import { isDeepStrictEqual } from "node:util";
import type { GameState } from "./game-state";
import {
  ruleEventObservationState,
  type EventBehavior,
  type PendingTrigger,
} from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import type { CharacterHitEffects } from "./character-hit-triggers";
import { activeCombatEffects } from "./timed-combat-effects";

/** MACHINA MORTIS grants a repeated triggered ability, not a one-shot delayed trigger. */
export function machinaMortisHitBinding(
  version: string,
  handler: string,
  effects: CharacterHitEffects,
) {
  const captured = (state: GameState, trigger: PendingTrigger) => {
    const event = trigger.event;
    if (
      trigger.handler !== handler ||
      event.type !== "character-damaged" ||
      !event.combat ||
      event.amount <= 0 ||
      event.sourceId !== trigger.sourceId ||
      !event.zonesAtEvent ||
      !event.observers ||
      !event.statEffectsBefore
    )
      throw new Error("Invalid Machina Mortis hit observation");
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
          effect.targetId === source.id &&
          effect.change.kind === "grant-character-hit-copy",
      )
    )
      throw new Error("Invalid Machina Mortis source");
    return { event, observed, card };
  };
  const targets: NonNullable<TriggerBehavior["targets"]> = (state, trigger) => {
    const { event, observed, card } = captured(state, trigger);
    const current = effects.characteristics(structuredClone(state));
    if (!effects.canTarget)
      throw new Error("Machina Mortis target runtime unavailable");
    return state.arena
      .filter(
        (id) =>
          current.get(id)?.cardType === "character" &&
          !(
            id === event.instanceId &&
            state.objects[id].incarnation === observed.objects[id].incarnation
          ) &&
          effects.canTarget!(
            structuredClone(state),
            trigger.sourceId,
            id,
            card,
          ),
      )
      .map((id) => ({
        kind: "character" as const,
        id,
        incarnation: state.objects[id].incarnation,
      }));
  };
  const legal = (state: GameState, trigger: PendingTrigger) =>
    trigger.target?.kind === "character" &&
    targets(state, trigger).some((target) =>
      isDeepStrictEqual(target, trigger.target),
    );
  const behavior: TriggerBehavior = {
    targets,
    optional(state, trigger) {
      const { event } = captured(state, trigger);
      return legal(state, trigger)
        ? `Deal ${event.amount} ${event.channel} damage to the selected character with MACHINA MORTIS?`
        : null;
    },
    resolve(state, trigger) {
      const { event, card } = captured(state, trigger);
      if (!legal(state, trigger) || trigger.target?.kind !== "character")
        return state;
      return effects.damage(
        state,
        [
          {
            sourceId: trigger.sourceId,
            recipient: "character",
            instanceId: trigger.target.id,
            channel: event.channel,
            amount: event.amount,
          },
        ],
        card,
      );
    },
  };
  const events: EventBehavior = {
    onEvent(state, sourceId, event) {
      if (
        event.type !== "character-damaged" ||
        !event.combat ||
        event.amount <= 0 ||
        event.sourceId !== sourceId
      )
        return [];
      const trigger = {
        sourceId,
        controller: state.objects[sourceId].controller,
        handler,
        event,
      };
      if (!event.zonesAtEvent || !event.observers || !event.statEffectsBefore)
        throw new Error("Machina Mortis hit observation unavailable");
      const source = state.objects[sourceId];
      if (source.definitionVersion !== version)
        throw new Error("Machina Mortis binding mismatch");
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
            effect.targetId === sourceId &&
            effect.change.kind === "grant-character-hit-copy",
        )
        .map(() => structuredClone(trigger));
    },
  };
  return { events, behavior };
}
