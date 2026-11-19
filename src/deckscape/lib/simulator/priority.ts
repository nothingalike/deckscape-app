import type { Seat } from "./setup";
import type { GearLink } from "./gear-attachment";
import type { ProgramChoices } from "./play-program";
import type { ActivatedAbilitySnapshot } from "./activate-ability";

export interface CacheAction {
  id: string;
  kind: "card" | "activated" | "triggered";
  controller: Seat;
  sourceId: string;
  sourceIncarnation?: number;
  purgeOnResolution?: true;
  /** Server-private captures of the selected objects, retained across response windows. */
  targetIncarnations?: Record<string, number>;
  gearTargets?: GearLink[];
  protocolTarget?: string;
  programChoices?: ProgramChoices;
  activatedAbility?: ActivatedAbilitySnapshot;
}
export interface PriorityState {
  activePlayer: Seat;
  origin: "deploy" | "combat" | "netcheck";
  swiftCheck: boolean;
  priority: Seat | null;
  consecutivePasses: number;
  stack: CacheAction[];
  triggers: CacheAction[];
  resolving: CacheAction | null;
  resolutionApplied: boolean;
  mode: "priority" | "drain" | "complete";
}
const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

/** Caller completes state-based actions and opening triggers before exposing priority. */
export function openPriority(
  activePlayer: Seat,
  origin: "deploy" | "combat" | "netcheck",
): PriorityState {
  return {
    activePlayer,
    origin,
    swiftCheck: origin === "combat",
    priority: origin === "combat" ? other(activePlayer) : activePlayer,
    consecutivePasses: 0,
    stack: [],
    triggers: [],
    resolving: null,
    resolutionApplied: false,
    mode: "priority",
  };
}

export function canAct(state: PriorityState, seat: Seat) {
  return (
    state.mode === "priority" &&
    !state.resolving &&
    !state.triggers.length &&
    state.priority === seat
  );
}

/** Adds an already validated/paid action. It does not validate targets or costs. */
export function addPriorityAction(
  state: PriorityState,
  action: CacheAction,
): PriorityState {
  if (action.kind === "triggered" || !canAct(state, action.controller))
    throw new Error("No priority for action");
  if ([...state.stack, ...state.triggers].some((a) => a.id === action.id))
    throw new Error("Duplicate cache action");
  const next = structuredClone(state);
  next.stack.push({ ...action });
  next.priority = state.swiftCheck
    ? other(action.controller)
    : other(state.activePlayer);
  next.swiftCheck = true;
  next.consecutivePasses = 0;
  return next;
}

export function passPriority(state: PriorityState, seat: Seat): PriorityState {
  if (!canAct(state, seat)) throw new Error("No priority to pass");
  const next = structuredClone(state);
  if (
    state.origin === "deploy" &&
    !state.swiftCheck &&
    !state.stack.length &&
    seat === state.activePlayer
  ) {
    next.mode = "complete";
    next.priority = null;
    return next;
  }
  next.consecutivePasses++;
  next.priority = other(seat);
  if (next.consecutivePasses === 2) {
    next.mode = "drain";
    next.priority = null;
  }
  return next;
}

/** Input order is placement order; last placed trigger resolves first (114.5a). */
export function addTriggers(
  state: PriorityState,
  triggers: CacheAction[],
): PriorityState {
  const ids = new Set(
    [
      ...state.stack,
      ...state.triggers,
      ...(state.resolving ? [state.resolving] : []),
    ].map((a) => a.id),
  );
  for (const trigger of triggers) {
    if (trigger.kind !== "triggered" || ids.has(trigger.id))
      throw new Error("Invalid or duplicate trigger");
    ids.add(trigger.id);
  }
  const next = structuredClone(state);
  next.triggers.push(...structuredClone(triggers));
  return next;
}

/** Yield one resolution to the rules interpreter. No priority is offered between actions. */
export function nextResolution(state: PriorityState): PriorityState {
  if (state.resolving) throw new Error("Current resolution is unfinished");
  const next = structuredClone(state);
  const trigger = next.triggers.pop();
  if (trigger) {
    next.resolving = trigger;
    return next;
  }
  if (next.mode !== "drain") throw new Error("Cache is not resolving");
  const action = next.stack.pop();
  if (action) {
    next.resolving = action;
    return next;
  }
  next.swiftCheck = false;
  next.consecutivePasses = 0;
  next.mode = next.origin === "deploy" ? "priority" : "complete";
  next.priority = next.origin === "deploy" ? next.activePlayer : null;
  return next;
}

/** Call only after applying the effect, state-based actions, and enqueueing resulting triggers. */
export function finishResolution(state: PriorityState): PriorityState {
  if (!state.resolving) throw new Error("No resolution in progress");
  const next = structuredClone(state);
  next.resolving = null;
  next.resolutionApplied = false;
  return next;
}
