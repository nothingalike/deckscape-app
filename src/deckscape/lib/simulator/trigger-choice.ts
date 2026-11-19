import { isDeepStrictEqual } from "node:util";
import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { TriggerBehavior } from "./resolve-trigger";

export interface TriggerChoices {
  cardCount?: number;
  prompt: string;
  options: { id: string; label: string; cardId?: string }[];
}
export interface TriggerChoiceDecision extends TriggerChoices {
  timing?: "placement";
  type: "trigger-choice";
  id: string;
  player: Seat;
  sourceId: string;
  triggerIndex: number;
}
export function validateTriggerChoiceContinuation(
  state: GameState,
): TriggerChoiceDecision {
  const d = state.pendingDecision;
  if (d?.type !== "trigger-choice") throw Error("Trigger choice unavailable");
  const t = state.pendingTriggers[d.triggerIndex];
  if (
    !state.triggersOrdered ||
    state.pendingRuleEvents.length ||
    (d.timing !== "placement" &&
      d.triggerIndex !== state.pendingTriggers.length - 1) ||
    !t ||
    t.sourceId !== d.sourceId ||
    (t.optionalPlayer ?? t.controller) !== d.player ||
    t.choice !== undefined ||
    t.selectedCards !== undefined ||
    (d.timing === "placement" &&
      (t.placementChoice !== undefined || d.cardCount !== undefined)) ||
    (d.cardCount !== undefined &&
      (!Number.isSafeInteger(d.cardCount) ||
        d.cardCount < 1 ||
        d.cardCount > d.options.length ||
        d.options.some((o) => !o.cardId))) ||
    t.target === null ||
    !d.prompt.trim() ||
    d.prompt.length > 500 ||
    d.options.length < 1 ||
    d.options.length > 512 ||
    new Set(d.options.map((o) => o.id)).size !== d.options.length ||
    d.options.some(
      (o) =>
        !o.id.trim() ||
        o.id.length > 100 ||
        !o.label.trim() ||
        o.label.length > 200,
    )
  )
    throw Error("Invalid trigger choice continuation");
  return d;
}
export function evaluateTriggerChoice(
  state: GameState,
  behaviors: ReadonlyMap<string, TriggerBehavior>,
): TriggerChoices | null {
  const d = validateTriggerChoiceContinuation(state),
    t = state.pendingTriggers[d.triggerIndex];
  const behavior = behaviors.get(t.handler);
  const choices =
    d.timing === "placement" ? behavior?.placementChoices : behavior?.choices;
  if (!behavior || !choices) throw Error("Trigger choice runtime unavailable");
  if (
    t.optionalPlayer !== undefined &&
    (!behavior.optionalPlayer ||
      behavior.optionalPlayer(structuredClone(state), structuredClone(t)) !==
        t.optionalPlayer)
  )
    throw Error("Trigger choice player changed");
  return choices(structuredClone(state), structuredClone(t));
}
export function answerTriggerChoice(
  state: GameState,
  user: string,
  revision: number,
  id: string,
  choice: string,
  evaluated: TriggerChoices | null,
): GameState {
  if (state.outcome || state.revision !== revision)
    throw Error("Ended game or stale revision");
  const d = validateTriggerChoiceContinuation(state);
  if (d.id !== id || state.players[d.player].userId !== user)
    throw Error("Not the deciding player or decision");
  if (
    d.cardCount !== undefined ||
    !isDeepStrictEqual(evaluated, { prompt: d.prompt, options: d.options }) ||
    !d.options.some((o) => o.id === choice)
  )
    throw Error("Invalid trigger choice");
  const next = structuredClone(state);
  if (d.timing === "placement")
    next.pendingTriggers[d.triggerIndex].placementChoice = choice;
  else next.pendingTriggers[d.triggerIndex].choice = choice;
  next.pendingDecision = null;
  next.revision++;
  return next;
}

/** Lock the whole group before the handler performs its simultaneous instruction. */
export function answerTriggerCards(
  state: GameState,
  user: string,
  revision: number,
  id: string,
  cards: string[],
  evaluated: TriggerChoices | null,
): GameState {
  if (state.outcome || state.revision !== revision)
    throw Error("Ended game or stale revision");
  const d = validateTriggerChoiceContinuation(state);
  if (d.id !== id || state.players[d.player].userId !== user)
    throw Error("Not the deciding player or decision");
  if (
    !d.cardCount ||
    !isDeepStrictEqual(evaluated, {
      cardCount: d.cardCount,
      prompt: d.prompt,
      options: d.options,
    }) ||
    cards.length !== d.cardCount ||
    new Set(cards).size !== cards.length ||
    cards.some((id) => !d.options.some((o) => o.id === id && o.cardId))
  )
    throw Error("Invalid trigger card choices");
  const next = structuredClone(state);
  next.pendingTriggers[d.triggerIndex].selectedCards = [...cards];
  next.pendingDecision = null;
  next.revision++;
  return next;
}
