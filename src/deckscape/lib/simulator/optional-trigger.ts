import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { TriggerBehavior } from "./resolve-trigger";

export interface OptionalTriggerDecision {
  type: "optional-trigger";
  id: string;
  player: Seat;
  sourceId: string;
  triggerIndex: number;
  prompt: string;
}

export function validateOptionalTriggerContinuation(
  state: GameState,
): OptionalTriggerDecision {
  const decision = state.pendingDecision;
  if (decision?.type !== "optional-trigger")
    throw new Error("Optional trigger decision unavailable");
  const trigger = state.pendingTriggers[decision.triggerIndex];
  if (
    !state.triggersOrdered ||
    state.pendingRuleEvents.length ||
    decision.triggerIndex !== state.pendingTriggers.length - 1 ||
    !trigger ||
    trigger.sourceId !== decision.sourceId ||
    (trigger.optionalPlayer ?? trigger.controller) !== decision.player ||
    trigger.optionalChoice !== undefined ||
    trigger.target === null ||
    !decision.prompt.trim() ||
    decision.prompt.length > 500
  )
    throw new Error("Invalid optional trigger continuation");
  return decision;
}

/** Re-evaluate only through the retained server binding; request JSON cannot supply effect text. */
export function evaluateOptionalTrigger(
  state: GameState,
  behaviors: ReadonlyMap<string, TriggerBehavior>,
): string | null {
  const decision = validateOptionalTriggerContinuation(state);
  const trigger = state.pendingTriggers[decision.triggerIndex];
  const behavior = behaviors.get(trigger.handler);
  if (!behavior?.optional)
    throw new Error("Optional trigger runtime unavailable");
  if (
    (trigger.optionalPlayer !== undefined && !behavior.optionalPlayer) ||
    (behavior.optionalPlayer
      ? behavior.optionalPlayer(
          structuredClone(state),
          structuredClone(trigger),
        )
      : trigger.controller) !== decision.player
  )
    throw new Error("Optional trigger player changed");
  return behavior.optional(structuredClone(state), structuredClone(trigger));
}

export function answerOptionalTrigger(
  state: GameState,
  userId: string,
  revision: number,
  decisionId: string,
  useEffect: boolean,
  evaluated: string | null,
): GameState {
  if (state.outcome || state.revision !== revision)
    throw new Error("Ended game or stale revision");
  const decision = validateOptionalTriggerContinuation(state);
  if (
    decision.id !== decisionId ||
    state.players[decision.player].userId !== userId
  )
    throw new Error("Not the deciding player or decision");
  if (typeof useEffect !== "boolean" || evaluated !== decision.prompt)
    throw new Error("Optional trigger choice changed");
  const next = structuredClone(state);
  next.pendingTriggers[decision.triggerIndex].optionalChoice = useEffect;
  next.pendingDecision = null;
  next.revision++;
  return next;
}
