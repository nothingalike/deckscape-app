import {
  validateTriggerChoiceContinuation,
  type TriggerChoices,
} from "./trigger-choice";
import { assertGameZones, type GameState } from "./game-state";
import type { PendingTrigger } from "./rule-events";
import { prepareTriggerTargets, type TriggerTarget } from "./trigger-target";
import { validateOptionalTriggerContinuation } from "./optional-trigger";
import type { Seat } from "./setup";

export interface TriggerBehavior {
  /** Mainframe "Or" tiers are locked in placement order before any trigger resolves. */
  placementChoices?(state: GameState, trigger: PendingTrigger): TriggerChoices;
  /** Mandatory resolution-time choices, distinct from placement targets and optional effects. */
  choices?(state: GameState, trigger: PendingTrigger): TriggerChoices | null;
  /** A resolution-time choice, after all placement targets. Null means the optional effect is unavailable. */
  optional?(state: GameState, trigger: PendingTrigger): string | null;
  /** Defaults to the trigger controller; evaluated only when an optional choice is available. */
  optionalPlayer?(state: GameState, trigger: PendingTrigger): Seat;
  targets?(state: GameState, trigger: PendingTrigger): readonly TriggerTarget[];
  resolve(state: GameState, trigger: PendingTrigger): GameState;
}

/** Resolve the already ordered top trigger using its saved controller and event facts.
 * A source leaving play does not erase its trigger. Settlement checks ensuing SBAs
 * and events before another trigger resolves. Missing bindings fail atomically.
 */
export function resolveNextRuleTrigger(
  state: GameState,
  behaviors: ReadonlyMap<string, TriggerBehavior>,
  observe?: (state: GameState, trigger: PendingTrigger) => void,
): GameState {
  if (
    state.outcome ||
    state.pendingDecision ||
    !state.triggersOrdered ||
    state.pendingRuleEvents.length
  )
    throw new Error("Trigger resolution is not ready");
  const trigger = state.pendingTriggers.at(-1);
  if (!trigger) throw new Error("No pending trigger");
  const behavior = behaviors.get(trigger.handler);
  if (!behavior) throw new Error(`Missing trigger handler: ${trigger.handler}`);
  const next = prepareTriggerTargets(state, behaviors);
  if (next.pendingDecision) return next;
  const prepared = next.pendingTriggers.at(-1)!;
  if (prepared.placementChoice !== undefined && !behavior.placementChoices)
    throw Error("Unexpected trigger placement choice");
  if (prepared.optionalChoice !== undefined && !behavior.optional)
    throw new Error("Unexpected optional trigger answer");
  if (prepared.optionalPlayer !== undefined && !behavior.optionalPlayer)
    throw new Error("Unexpected optional trigger player");
  if (
    prepared.optionalChoice === true &&
    behavior.optionalPlayer &&
    prepared.optionalPlayer === undefined
  )
    throw new Error("Optional trigger player unavailable");
  if (
    prepared.optionalChoice !== undefined &&
    prepared.optionalPlayer !== undefined &&
    behavior.optionalPlayer!(
      structuredClone(next),
      structuredClone(prepared),
    ) !== prepared.optionalPlayer
  )
    throw new Error("Optional trigger player changed");
  if (
    behavior.optional &&
    prepared.target !== null &&
    prepared.optionalChoice === undefined
  ) {
    const prompt = behavior.optional(
      structuredClone(next),
      structuredClone(prepared),
    );
    if (prompt !== null) {
      const player = behavior.optionalPlayer
        ? behavior.optionalPlayer(
            structuredClone(next),
            structuredClone(prepared),
          )
        : prepared.controller;
      if (player !== 0 && player !== 1)
        throw new Error("Invalid optional trigger player");
      if (behavior.optionalPlayer) prepared.optionalPlayer = player;
      next.pendingDecision = {
        type: "optional-trigger",
        id: `optional-trigger:${next.revision}:${next.pendingTriggers.length - 1}:${prepared.handler}`,
        player,
        sourceId: prepared.sourceId,
        triggerIndex: next.pendingTriggers.length - 1,
        prompt,
      };
      validateOptionalTriggerContinuation(next);
      return next;
    }
    prepared.optionalChoice = false;
  }
  if (
    (prepared.choice !== undefined || prepared.selectedCards !== undefined) &&
    !behavior.choices
  )
    throw Error("Unexpected trigger choice");
  if (
    behavior.choices &&
    prepared.target !== null &&
    prepared.optionalChoice !== false
  ) {
    const choices = behavior.choices(
      structuredClone(next),
      structuredClone(prepared),
    );
    if (
      choices &&
      prepared.choice === undefined &&
      prepared.selectedCards === undefined
    ) {
      next.pendingDecision = {
        type: "trigger-choice",
        id:
          "trigger-choice:" +
          next.revision +
          ":" +
          (next.pendingTriggers.length - 1) +
          ":" +
          prepared.handler,
        player: prepared.optionalPlayer ?? prepared.controller,
        sourceId: prepared.sourceId,
        triggerIndex: next.pendingTriggers.length - 1,
        ...choices,
      };
      validateTriggerChoiceContinuation(next);
      return next;
    }
    if (
      prepared.selectedCards !== undefined &&
      (!choices?.cardCount ||
        prepared.choice !== undefined ||
        prepared.selectedCards.length !== choices.cardCount ||
        new Set(prepared.selectedCards).size !==
          prepared.selectedCards.length ||
        prepared.selectedCards.some(
          (id) => !choices.options.some((o) => o.id === id && o.cardId),
        ))
    )
      throw Error("Trigger card choices changed");
    if (choices?.cardCount !== undefined && prepared.choice !== undefined)
      throw Error("Expected a group of cards");
    if (
      prepared.choice !== undefined &&
      !choices?.options.some((o) => o.id === prepared.choice)
    )
      throw Error("Trigger choices changed");
  }
  observe?.(next, prepared);
  next.pendingTriggers.pop();
  const resolved =
    prepared.target === null || prepared.optionalChoice === false
      ? next
      : behavior.resolve(next, structuredClone(prepared));
  assertGameZones(resolved);
  return resolved;
}
