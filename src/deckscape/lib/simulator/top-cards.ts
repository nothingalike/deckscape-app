import { isDeepStrictEqual } from "node:util";
import { assertGameZones, type GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";
import type { ActivatedBehavior } from "./resolve-ability";
import type { PendingTrigger } from "./rule-events";
import { revealSearchedCard } from "./deck-search";
import { advanceObjectIncarnation } from "./object-incarnation";
import {
  captureEventObservation,
  type EventObservation,
} from "./event-observation";

export interface TopCardsSpecification {
  kind: "index" | "divine" | "look-bin" | "tea-party";
  count: number;
  cardType?: CardCharacteristics["cardType"];
  subtype?: string;
  faction?: string;
}
export interface TopCardsDecision {
  type: "top-cards";
  id: string;
  player: Seat;
  sourceId: string;
  actionId: string;
  handler: string;
  kind: "index" | "divine" | "look-bin" | "tea-party";
  count: number;
  inspected: string[];
  candidates: string[];
  /** The resolving trigger has been removed from the queue; retain it across the choice. */
  trigger?: PendingTrigger;
  /** Repeated instructions remain one resolving trigger, with no intervening priority. */
  sequence?: { total: number; remaining: number };
}
export interface TopCardsEffects {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  enterTeaParty?(
    state: GameState,
    player: Seat,
    sourceId: string,
    id: string,
  ): GameState;
  moveToHand(state: GameState, player: Seat, id: string): GameState;
  /** Apply bin replacements to the whole remainder, then move it as one event. */
  bin(
    state: GameState,
    sourceId: string,
    player: Seat,
    ids: readonly string[],
  ): GameState;
}
export interface TopCardsEvaluation {
  resume?(state: GameState, completed: TopCardsDecision): GameState;
  characteristics: ReadonlyMap<string, CardCharacteristics>;
  complete(
    state: GameState,
    decision: TopCardsDecision,
    selected: string | null,
  ): GameState;
}
export interface CyberdeckBinEvent extends EventObservation {
  type: "cyberdeck-card-binned";
  sourceId: string;
  instanceId: string;
  player: Seat;
}

export function topCardCandidates(
  state: GameState,
  player: Seat,
  spec: TopCardsSpecification,
  current: ReadonlyMap<string, CardCharacteristics>,
) {
  if (!Number.isSafeInteger(spec.count) || spec.count < 0)
    throw new Error("Invalid top-card count");
  return state.players[player].zones.cyberdeck
    .slice(0, spec.count)
    .filter((id) => {
      const card = current.get(id);
      if (!card) throw new Error("Top-card characteristics unavailable");
      return (
        (!spec.cardType || card.cardType === spec.cardType) &&
        (!spec.subtype ||
          ("subtype" in card && card.subtype === spec.subtype)) &&
        (!spec.faction || card.factions.includes(spec.faction))
      );
    });
}

export function validateTopCardsContinuation(
  state: GameState,
  decision: TopCardsDecision,
): void {
  const action = state.priorityWindow?.resolving;
  const trigger = decision.trigger;
  const contextValid = trigger
    ? !action &&
      state.triggersOrdered &&
      trigger.sourceId === decision.sourceId &&
      trigger.handler === decision.handler &&
      ((trigger.optionalChoice === true &&
        trigger.optionalPlayer === decision.player) ||
        (trigger.optionalChoice === undefined &&
          trigger.optionalPlayer === undefined &&
          trigger.controller === decision.player)) &&
      decision.actionId ===
        `trigger:${state.revision}:${state.pendingTriggers.length}:${trigger.handler}`
    : !!action &&
      state.priorityWindow?.mode === "drain" &&
      state.priorityWindow.priority === null &&
      action.id === decision.actionId &&
      action.sourceId === decision.sourceId &&
      action.controller === decision.player &&
      (action.activatedAbility?.handler === decision.handler ||
        // Script handlers are checked against the retained source by the runtime evaluator.
        (action.kind === "card" && !!action.programChoices));
  const expected = state.players[decision.player].zones.cyberdeck.slice(
    0,
    decision.count,
  );
  if (
    !contextValid ||
    decision.id !== `top:${decision.actionId}` ||
    !Number.isSafeInteger(decision.count) ||
    decision.count <= 0 ||
    (decision.kind === "look-bin" &&
      (decision.count !== 1 ||
        !isDeepStrictEqual(decision.candidates, decision.inspected))) ||
    (decision.sequence !== undefined &&
      (!trigger ||
        decision.kind !== "divine" ||
        !Number.isSafeInteger(decision.sequence.total) ||
        !Number.isSafeInteger(decision.sequence.remaining) ||
        decision.sequence.remaining < 1 ||
        decision.sequence.remaining > decision.sequence.total)) ||
    !decision.inspected.length ||
    !isDeepStrictEqual(expected, decision.inspected) ||
    new Set(decision.candidates).size !== decision.candidates.length ||
    decision.candidates.some((id) => !expected.includes(id)) ||
    (decision.kind === "divine" &&
      !isDeepStrictEqual(decision.candidates, decision.inspected))
  )
    throw new Error("Invalid top-card continuation");
}

export function completeTopCards(
  state: GameState,
  decision: TopCardsDecision,
  selected: string | null,
  effects: TopCardsEffects,
): GameState {
  let next = structuredClone(state);
  if (decision.kind === "look-bin")
    return selected === null
      ? next
      : effects.bin(next, decision.sourceId, decision.player, [selected]);
  if (selected !== null) {
    if (decision.kind === "tea-party") {
      if (!effects.enterTeaParty) throw Error("Tea Party entry unavailable");
      next = effects.enterTeaParty(
        next,
        decision.player,
        decision.sourceId,
        selected,
      );
    } else next = effects.moveToHand(next, decision.player, selected);
  }
  if (next.outcome) return next;
  if (next.pendingDecision)
    throw new Error(
      "Top-card movement requires a resumable replacement interpreter",
    );
  const rest = decision.inspected.filter((id) => id !== selected);
  if (rest.length)
    next = effects.bin(next, decision.sourceId, decision.player, rest);
  if (next.pendingDecision)
    throw new Error(
      "Top-card binning requires a resumable replacement interpreter",
    );
  return next;
}

export function topCardsAbility(
  spec: TopCardsSpecification,
  handler: string,
  effects: TopCardsEffects,
): ActivatedBehavior {
  return {
    hasLegalTargets(_state, action) {
      const choices = action.activatedAbility.choices;
      if (
        choices.targets.length ||
        choices.modes.length ||
        choices.x !== null ||
        choices.playerTarget !== undefined
      )
        throw new Error("Top-card choices occur during resolution");
      return true;
    },
    resolve(state, action) {
      return beginTopCards(
        state,
        action.controller,
        action.sourceId,
        action.id,
        handler,
        spec,
        effects,
      );
    },
  };
}

/** Trigger-owned INDEX uses the same reveal, candidate and completion semantics as activated INDEX. */
export function topCardsTrigger(
  state: GameState,
  trigger: PendingTrigger,
  spec: TopCardsSpecification,
  effects: TopCardsEffects,
  sequence?: TopCardsDecision["sequence"],
): GameState {
  if (
    state.pendingDecision ||
    state.priorityWindow?.resolving ||
    (trigger.optionalChoice !== undefined && trigger.optionalChoice !== true) ||
    (trigger.optionalChoice === true && trigger.optionalPlayer === undefined)
  )
    throw new Error("Triggered top-card inspection unavailable");
  const player = trigger.optionalPlayer ?? trigger.controller;
  const actionId = `trigger:${state.revision}:${state.pendingTriggers.length}:${trigger.handler}`;
  return beginTopCards(
    state,
    player,
    trigger.sourceId,
    actionId,
    trigger.handler,
    spec,
    effects,
    trigger,
    sequence,
  );
}

export function beginTopCards(
  state: GameState,
  player: Seat,
  sourceId: string,
  actionId: string,
  handler: string,
  spec: TopCardsSpecification,
  effects: TopCardsEffects,
  trigger?: PendingTrigger,
  sequence?: TopCardsDecision["sequence"],
): GameState {
  if (state.pendingDecision) throw new Error("Top-card inspection unavailable");
  const inspected = state.players[player].zones.cyberdeck.slice(0, spec.count);
  const current = effects.characteristics(structuredClone(state));
  const candidates = topCardCandidates(state, player, spec, current);
  if (!inspected.length) return state;
  let next = structuredClone(state);
  if (spec.kind === "index" || spec.kind === "tea-party")
    for (const id of inspected)
      next = revealSearchedCard(next, player, id, current);
  const decision: TopCardsDecision = {
    type: "top-cards",
    id: `top:${actionId}`,
    player,
    sourceId,
    actionId,
    handler,
    kind: spec.kind,
    count: spec.count,
    inspected,
    candidates,
    ...(trigger ? { trigger: structuredClone(trigger) } : {}),
    ...(sequence ? { sequence: structuredClone(sequence) } : {}),
  };
  if (!candidates.length)
    return completeTopCards(next, decision, null, effects);
  next.pendingDecision = decision;
  validateTopCardsContinuation(next, decision);
  return next;
}

export function answerTopCards(
  state: GameState,
  userId: string,
  revision: number,
  decisionId: string,
  selected: string | null,
  evaluated: TopCardsEvaluation,
): GameState {
  const decision = state.pendingDecision;
  if (
    state.outcome ||
    state.revision !== revision ||
    decision?.type !== "top-cards" ||
    decision.id !== decisionId
  )
    throw new Error("Top-card decision unavailable");
  if (state.players[decision.player].userId !== userId)
    throw new Error("Not the deciding player");
  validateTopCardsContinuation(state, decision);
  if (
    selected === null
      ? (decision.kind === "divine" || decision.kind === "tea-party") &&
        decision.candidates.length > 0
      : !decision.candidates.includes(selected)
  )
    throw new Error("Invalid top-card selection");
  let next = structuredClone(state);
  next.pendingDecision = null;
  next = evaluated.complete(next, structuredClone(decision), selected);
  if (decision.trigger) {
    if (
      next.priorityWindow?.resolving ||
      next.revision !== revision ||
      next.pendingDecision ||
      !isDeepStrictEqual(next.pendingTriggers, state.pendingTriggers)
    )
      throw new Error("Top-card continuation changed the trigger queue");
  } else if (next.priorityWindow?.resolving?.id !== decision.actionId)
    throw new Error("Top-card continuation changed the resolving action");
  else next.priorityWindow.resolutionApplied = true;
  next.revision++;
  if (evaluated.resume && !next.outcome) {
    const continued = evaluated.resume(next, structuredClone(decision));
    if (
      continued.revision !== next.revision ||
      !isDeepStrictEqual(continued.pendingTriggers, next.pendingTriggers) ||
      continued.priorityWindow?.resolving
    )
      throw Error("Top-card sequence changed resolution identity");
    next = continued;
  }
  assertGameZones(next);
  return next;
}

/** CR 701.8: binning cards from a deck is neither destruction nor discarding. */
export function binCyberdeckCards(
  state: GameState,
  sourceId: string,
  player: Seat,
  ids: readonly string[],
): GameState {
  if (
    state.outcome ||
    !state.objects[sourceId] ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !state.players[player].zones.cyberdeck.includes(id))
  )
    throw new Error("Invalid cyberdeck bin batch");
  const next = structuredClone(state);
  next.players[player].zones.cyberdeck = next.players[
    player
  ].zones.cyberdeck.filter((id) => !ids.includes(id));
  for (const id of ids) {
    const object = next.objects[id];
    next.players[object.owner].zones.recycleBin.push(id);
    Object.assign(object, {
      controller: object.owner,
      faceDown: false,
      running: false,
      abilitySpent: false,
    });
    advanceObjectIncarnation(next, id);
  }
  const observation = captureEventObservation(next);
  for (const id of ids)
    next.pendingRuleEvents.push({
      type: "cyberdeck-card-binned",
      sourceId,
      instanceId: id,
      player: next.objects[id].owner,
      ...structuredClone(observation),
    });
  assertGameZones(next);
  return next;
}
