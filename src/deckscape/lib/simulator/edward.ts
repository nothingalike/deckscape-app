import { isDeepStrictEqual } from "node:util";
import spec from "./edward-specification-v3.json";
import { versionDefinition, type EngineManifest } from "./definition-version";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";
import { ruleEventObservationState, type EventBehavior } from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import type { CounterPlacement } from "./put-counters";
import type { StatEffect } from "./stat-layers";

export function edwardStats(
  state: GameState,
  version: string | undefined,
  current: ReadonlyMap<string, CardCharacteristics>,
  hasAbility: (state: GameState, id: string) => boolean,
): Map<string, StatEffect[]> {
  const result = new Map<string, StatEffect[]>();
  if (!version) return result;
  for (const id of state.arena) {
    const source = state.objects[id];
    if (
      source.definitionVersion !== version ||
      !hasAbility(state, id) ||
      current.get(id)?.cardType !== "character"
    )
      continue;
    result.set(id, [
      {
        id: `${id}:${source.incarnation}:drink-bonus`,
        timestamp: source.timestamp,
        dependsOn: [],
        layer: "7d",
        operation: "add",
        attack: 4 * Math.floor((source.counters.drink ?? 0) / 2),
      },
    ]);
  }
  return result;
}

export function bindEdward(
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
    throw new Error("Edward definition pin mismatch");
  const check = (state: GameState) => {
    if (
      state.engineVersion !== engine.version ||
      state.rulesVersion !== rulesVersion
    )
      throw new Error("Edward runtime version mismatch");
  };
  const events = new Map<string, EventBehavior>([
    [
      pin.version,
      {
        onEvent(state, sourceId, event) {
          check(state);
          if (event.type !== "netcheck-started") return [];
          if (
            !event.observers ||
            !event.zonesAtEvent ||
            !event.statEffectsBefore
          )
            throw new Error("Edward needs captured NETCHECK facts");
          const observed = ruleEventObservationState(state, event),
            source = observed.objects[sourceId];
          if (
            source?.definitionVersion !== pin.version ||
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
          if (event.type !== "netcheck-started")
            throw new Error("Invalid Edward trigger");
          if (
            !event.observers ||
            !event.zonesAtEvent ||
            !event.statEffectsBefore
          )
            throw new Error("Edward needs captured NETCHECK facts");
          const observed = ruleEventObservationState(state, event),
            source = observed.objects[trigger.sourceId];
          if (
            trigger.handler !== spec.handlerId ||
            source?.definitionVersion !== pin.version ||
            source.controller !== trigger.controller ||
            event.player !== trigger.controller ||
            !effects.hasAbility(observed, source.id)
          )
            throw new Error("Invalid retained Edward trigger");
          if (
            state.objects[source.id]?.incarnation !== source.incarnation ||
            !state.arena.includes(source.id)
          )
            return state;
          return effects.putCounters(state, source.id, [
            { instanceId: source.id, counter: "drink", amount: 1 },
          ]);
        },
      },
    ],
  ]);
  return {
    events,
    triggers,
    triggerLabels: new Map([
      [spec.handlerId, "Edward 40 Hands: add one drink counter."],
    ]),
  };
}
