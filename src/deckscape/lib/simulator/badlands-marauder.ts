import { isDeepStrictEqual } from "node:util";
import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { CardCharacteristics } from "./characteristics";
import type { ActivatedBehavior } from "./resolve-ability";
import type { TriggerBehavior } from "./resolve-trigger";
import {
  ruleEventObservationState,
  type EventBehavior,
  type PendingTrigger,
} from "./rule-events";
import {
  activeCombatEffects,
  addUntilTurnEndCombatEffect,
} from "./timed-combat-effects";
import { isCurrentIncarnation } from "./object-incarnation";
import { validateUntargetedCharacterEffect } from "./character-sweep-effects";

export interface SmashAndGrabEffects {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  hasAbility(state: GameState, sourceId: string, handler: string): boolean;
  canTarget(
    state: GameState,
    sourceId: string,
    targetId: string,
    source: CardCharacteristics,
  ): boolean;
  /** Shared departure evaluator applies destruction restrictions and replacements. */
  destroy(
    state: GameState,
    sourceId: string,
    targetId: string,
    source: CardCharacteristics,
  ): GameState;
  /** Shared resource evaluator applies installation restrictions and replacements. */
  install(
    state: GameState,
    player: Seat,
    sourceId: string,
    running: boolean,
    source: CardCharacteristics,
  ): GameState;
}

/** User ruling: the same activation applies to every successful player hit until
 * turn end. It grants this instance an ability rather than a one-shot delay. */
export function smashAndGrabActivation(
  characteristics: SmashAndGrabEffects["characteristics"],
  mode: "smash-and-grab" | "unchained-rage" = "smash-and-grab",
): ActivatedBehavior {
  return {
    hasLegalTargets(_state, action) {
      validateUntargetedCharacterEffect(action.activatedAbility.choices);
      return true;
    },
    resolve(state, action) {
      const current = characteristics(structuredClone(state));
      if (
        !isCurrentIncarnation(state, action.activatedAbility.source) ||
        !state.arena.includes(action.sourceId) ||
        current.get(action.sourceId)?.cardType !== "character"
      )
        return state;
      return addUntilTurnEndCombatEffect(
        state,
        action.sourceId,
        action.sourceId,
        {
          kind:
            mode === "unchained-rage"
              ? "grant-unchained-rage"
              : "grant-smash-and-grab",
        },
        current,
      );
    },
  };
}

/** The hit fixes the damaged player and trigger controller. Choose RAM on trigger
 * placement, then recheck it on resolution. Subsequent source changes do not erase a trigger. */
export function smashAndGrabHitBinding(
  version: string,
  handler: string,
  effects: SmashAndGrabEffects,
  mode: "smash-and-grab" | "unchained-rage" = "smash-and-grab",
) {
  const grant =
    mode === "unchained-rage" ? "grant-unchained-rage" : "grant-smash-and-grab";
  const captured = (state: GameState, trigger: PendingTrigger) => {
    const event = trigger.event;
    if (
      trigger.handler !== handler ||
      event.type !== "player-damaged" ||
      !event.combat ||
      event.amount <= 0 ||
      event.sourceId !== trigger.sourceId ||
      !event.zonesAtEvent ||
      !event.observers ||
      !event.statEffectsBefore
    )
      throw new Error("Invalid Smash and Grab hit observation");
    const observed = ruleEventObservationState(state, event),
      source = observed.objects[trigger.sourceId],
      card = effects.characteristics(observed).get(trigger.sourceId);
    if (
      source?.definitionVersion !== version ||
      source.controller !== trigger.controller ||
      source.faceDown ||
      !observed.arena.includes(source.id) ||
      card?.cardType !== "character" ||
      !activeCombatEffects(observed).some(
        (effect) =>
          effect.targetId === source.id && effect.change.kind === grant,
      )
    )
      throw new Error("Invalid Smash and Grab source");
    return { event, card };
  };
  const targets: NonNullable<TriggerBehavior["targets"]> = (state, trigger) => {
    const { event, card } = captured(state, trigger),
      current = effects.characteristics(structuredClone(state));
    // Committed RAM lives in the arena; bank RAM can be refreshed or running.
    return [
      ...state.arena,
      ...state.players.flatMap((player) => player.zones.ramBank),
    ]
      .filter(
        (id) =>
          state.objects[id].controller === event.player &&
          current.get(id)?.cardType === "ram" &&
          effects.canTarget(structuredClone(state), trigger.sourceId, id, card),
      )
      .map((id) => ({
        kind: "ram" as const,
        id,
        incarnation: state.objects[id].incarnation,
      }));
  };
  const behavior: TriggerBehavior = {
    targets,
    resolve(state, trigger) {
      const { card } = captured(state, trigger);
      if (
        trigger.target?.kind !== "ram" ||
        !targets(state, trigger).some((target) =>
          isDeepStrictEqual(target, trigger.target),
        )
      )
        return state;
      const next = effects.destroy(
        structuredClone(state),
        trigger.sourceId,
        trigger.target.id,
        card,
      );
      // CR 606.1/607.4: an illegal sole target skips the ability; an impossible
      // destruction is ignored. "Then" orders the installation, not a paid cost.
      return next.outcome || mode === "unchained-rage"
        ? next
        : effects.install(
            next,
            trigger.controller,
            trigger.sourceId,
            true,
            card,
          );
    },
  };
  const events: EventBehavior = {
    onEvent(state, sourceId, event) {
      if (
        event.type !== "player-damaged" ||
        !event.combat ||
        event.amount <= 0 ||
        event.sourceId !== sourceId
      )
        return [];
      if (!event.zonesAtEvent || !event.observers || !event.statEffectsBefore)
        throw new Error("Smash and Grab hit observation unavailable");
      const source = state.objects[sourceId];
      if (source.definitionVersion !== version)
        throw new Error("Smash and Grab binding mismatch");
      if (
        source.faceDown ||
        !state.arena.includes(sourceId) ||
        effects.characteristics(structuredClone(state)).get(sourceId)
          ?.cardType !== "character" ||
        !effects.hasAbility(structuredClone(state), sourceId, handler)
      )
        return [];
      return activeCombatEffects(state)
        .filter(
          (effect) =>
            effect.targetId === sourceId && effect.change.kind === grant,
        )
        .map(() => ({
          sourceId,
          controller: source.controller,
          handler,
          event: structuredClone(event),
        }));
    },
  };
  return { events, behavior };
}
