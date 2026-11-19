import { isDeepStrictEqual } from "node:util";
import specs from "./cybernetic-gear-specifications-v1.json";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import { versionDefinition, type EngineManifest } from "./definition-version";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";
import {
  ruleEventObservationState,
  type EventBehavior,
  type PendingTrigger,
} from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import type { TriggerTarget } from "./trigger-target";
import type { CombatDamagePacket } from "./combat-damage";

/** Follow-up damage is not itself an attack hit and cannot recursively trigger
 * Flux Cannon. The original hit records its amount, channel and source controller. */
export function bindFluxCannon(
  inputs: readonly PinnedDefinition[],
  engine: EngineManifest,
  rulesVersion: string,
  effects: {
    characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
    hasAbility(state: GameState, id: string, handler: string): boolean;
    canTarget(state: GameState, sourceId: string, targetId: string): boolean;
    damage(state: GameState, packets: readonly CombatDamagePacket[]): GameState;
  },
) {
  const spec = specs.find((s) => s.kind === "flux-cannon")!;
  const events = new Map<string, EventBehavior>(),
    triggers = new Map<string, TriggerBehavior>(),
    triggerLabels = new Map<string, string>();
  if (inputs.length > 1) throw Error("Duplicate Flux Cannon definition");
  for (const input of inputs) {
    const pin = versionDefinition(input.definition, engine);
    if (
      pin.version !== input.version ||
      pin.definition.cardId !== spec.cardId ||
      pin.definition.rulesVersion !== rulesVersion ||
      !isDeepStrictEqual(
        pin.definition.characteristics,
        characteristicsSchema.parse(spec.characteristics),
      ) ||
      !isDeepStrictEqual(pin.definition.handlers, [
        { id: spec.handlerId, version: spec.handlerVersion, parameters: {} },
      ])
    )
      throw Error("Flux Cannon definition mismatch");
    const check = (state: GameState) => {
      if (
        state.engineVersion !== engine.version ||
        state.rulesVersion !== rulesVersion
      )
        throw Error("Flux Cannon runtime mismatch");
    };
    const observation = (
      state: GameState,
      id: string,
      event: PendingTrigger["event"],
    ) => {
      check(state);
      if (
        event.type !== "character-damaged" ||
        !event.combat ||
        event.amount <= 0
      )
        return null;
      const observed = ruleEventObservationState(state, event),
        gear = observed.objects[id];
      if (
        !gear ||
        gear.definitionVersion !== pin.version ||
        gear.faceDown ||
        !observed.arena.includes(id) ||
        !effects.hasAbility(observed, id, spec.handlerId) ||
        !gear.attachments.some(
          (a) => a.kind === "gear" && a.hostId === event.sourceId,
        )
      )
        return null;
      return { observed, event };
    };
    const validate = (state: GameState, trigger: PendingTrigger) => {
      const result = observation(state, trigger.sourceId, trigger.event);
      if (
        !result ||
        trigger.handler !== spec.handlerId ||
        trigger.controller !==
          result.observed.objects[trigger.sourceId].controller
      )
        throw Error("Invalid Flux Cannon trigger");
      return result;
    };
    const targets = (
      state: GameState,
      trigger: PendingTrigger,
    ): TriggerTarget[] => {
      const { event } = validate(state, trigger),
        current = effects.characteristics(state);
      return state.arena
        .filter(
          (id) =>
            id !== event.instanceId &&
            current.get(id)?.cardType === "character" &&
            effects.canTarget(state, event.sourceId, id),
        )
        .map((id) => ({
          kind: "character",
          id,
          incarnation: state.objects[id].incarnation,
        }));
    };
    events.set(pin.version, {
      onEvent(state, id, event) {
        const result = observation(state, id, event);
        return result
          ? [
              {
                sourceId: id,
                controller: result.observed.objects[id].controller,
                handler: spec.handlerId,
                event: structuredClone(event),
              },
            ]
          : [];
      },
    });
    triggers.set(spec.handlerId, {
      targets,
      optional(state, trigger) {
        validate(state, trigger);
        return "Deal the hit's damage to another target character?";
      },
      resolve(state, trigger) {
        const { event, observed } = validate(state, trigger),
          target = trigger.target;
        if (target?.kind !== "character")
          throw Error("Flux Cannon target missing");
        if (
          !targets(state, trigger).some(
            (t) =>
              t.kind === "character" &&
              t.id === target.id &&
              t.incarnation === target.incarnation,
          )
        )
          return state;
        return effects.damage(state, [
          {
            sourceId: event.sourceId,
            sourceController: observed.objects[event.sourceId].controller,
            recipient: "character",
            instanceId: target.id,
            channel: event.channel,
            amount: event.amount,
          },
        ]);
      },
    });
    triggerLabels.set(
      spec.handlerId,
      "Flux Cannon: optionally deal the hit's damage to another character.",
    );
  }
  return { events, triggers, triggerLabels };
}
