import { isDeepStrictEqual } from "node:util";
import spec from "./ed-card-counter-specification-v3.json";
import { versionDefinition, type EngineManifest } from "./definition-version";
import { characteristicsSchema } from "./characteristics";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";
import { ruleEventObservationState, type EventBehavior } from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import type { CounterPlacement } from "./put-counters";

export function bindEdCardCounter(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  effects: {
    hasAbility(state: GameState, id: string): boolean;
    putCounters(
      state: GameState,
      sourceId: string,
      placements: readonly CounterPlacement[],
    ): GameState;
  },
) {
  const pin = versionDefinition(input.definition, engine);
  if (
    pin.version !== input.version ||
    pin.definition.rulesVersion !== rulesVersion ||
    pin.definition.cardId !== spec.cardId ||
    !isDeepStrictEqual(
      pin.definition.characteristics,
      characteristicsSchema.parse(spec.characteristics),
    ) ||
    !isDeepStrictEqual(pin.definition.handlers, [
      { id: spec.handlerId, version: 1, parameters: {} },
    ])
  )
    throw new Error("Ed Card Counter definition pin mismatch");
  const check = (state: GameState) => {
    if (
      state.engineVersion !== engine.version ||
      state.rulesVersion !== rulesVersion
    )
      throw new Error("Ed Card Counter runtime version mismatch");
  };
  const events = new Map<string, EventBehavior>([
    [
      pin.version,
      {
        onEvent(state, sourceId, event) {
          check(state);
          if (
            event.type !== "psychosis-rolled" &&
            event.type !== "instability-rolled" &&
            event.type !== "card-die-rolled"
          )
            return [];
          if (
            !event.observers ||
            !event.zonesAtEvent ||
            !event.statEffectsBefore
          )
            throw new Error("Ed Card Counter needs captured d20 roll facts");
          const observed = ruleEventObservationState(state, event),
            source = observed.objects[sourceId];
          if (
            source?.definitionVersion !== pin.version ||
            !("player" in event) ||
            source.controller !== event.player ||
            !effects.hasAbility(observed, sourceId)
          )
            return [];
          return [
            {
              sourceId,
              controller: source.controller,
              handler: spec.handlerId,
              event,
            },
          ];
        },
      },
    ],
  ]);
  const triggers = new Map<string, TriggerBehavior>([
    [
      spec.handlerId,
      {
        resolve(state, trigger) {
          check(state);
          const event = trigger.event;
          if (
            event.type !== "psychosis-rolled" &&
            event.type !== "instability-rolled" &&
            event.type !== "card-die-rolled"
          )
            throw new Error("Invalid Ed Card Counter trigger");
          if (
            !event.observers ||
            !event.zonesAtEvent ||
            !event.statEffectsBefore
          )
            throw new Error("Ed Card Counter needs captured d20 roll facts");
          const observed = ruleEventObservationState(state, event),
            source = observed.objects[trigger.sourceId];
          if (
            trigger.handler !== spec.handlerId ||
            source?.definitionVersion !== pin.version ||
            source.controller !== trigger.controller ||
            !("player" in event) ||
            event.player !== trigger.controller ||
            !effects.hasAbility(observed, source.id)
          )
            throw new Error("Invalid retained Ed Card Counter trigger");
          if (
            state.objects[source.id]?.incarnation !== source.incarnation ||
            !state.arena.includes(source.id)
          )
            return state;
          return effects.putCounters(state, source.id, [
            { instanceId: source.id, counter: "+1/+1", amount: 1 },
          ]);
        },
      },
    ],
  ]);
  return {
    events,
    triggers,
    triggerLabels: new Map([
      [spec.handlerId, "Ed, Card Counter: add one +1/+1 counter."],
    ]),
  };
}
