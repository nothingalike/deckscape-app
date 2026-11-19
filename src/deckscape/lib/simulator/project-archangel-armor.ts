import { isDeepStrictEqual } from "node:util";
import spec from "./project-archangel-specification-v3.json";
import { versionDefinition, type EngineManifest } from "./definition-version";
import { characteristicsSchema } from "./characteristics";
import { characterImplementationHandlers } from "./character-implementation-handlers";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";
import {
  ruleEventObservationState,
  type EventBehavior,
  type PendingTrigger,
} from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import type { CounterPlacement } from "./put-counters";

export function archangelCanCombat(
  s: GameState,
  id: string,
  version: string | undefined,
  hasAbility: (s: GameState, id: string) => boolean,
) {
  return (
    !version ||
    s.objects[id]?.definitionVersion !== version ||
    !hasAbility(s, id) ||
    (s.objects[id].counters.ARMOR ?? 0) > 0
  );
}

export function bindArchangelArmor(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  effects: {
    hasAbility(s: GameState, id: string): boolean;
    putCounters(
      s: GameState,
      sourceId: string,
      placements: readonly CounterPlacement[],
    ): GameState;
  },
) {
  const pin = versionDefinition(input.definition, engine),
    handler = spec.passiveTriggers[0].handlerId;
  if (
    pin.version !== input.version ||
    pin.definition.rulesVersion !== rulesVersion ||
    pin.definition.cardId !== spec.cardId ||
    !isDeepStrictEqual(
      pin.definition.characteristics,
      characteristicsSchema.parse(spec.characteristics),
    ) ||
    !isDeepStrictEqual(
      pin.definition.handlers,
      characterImplementationHandlers(spec),
    )
  )
    throw Error("Archangel definition mismatch");
  const observe = (
    s: GameState,
    id: string,
    event: PendingTrigger["event"],
  ) => {
    if (s.engineVersion !== engine.version || s.rulesVersion !== rulesVersion)
      throw Error("Archangel runtime mismatch");
    if (event.type !== "system-checked") return null;
    if (!event.observers || !event.zonesAtEvent || !event.statEffectsBefore)
      throw Error("Archangel observation missing");
    const observed = ruleEventObservationState(s, event),
      source = observed.objects[id];
    return source?.definitionVersion === pin.version &&
      observed.arena.includes(id) &&
      effects.hasAbility(observed, id) &&
      source.controller === event.player &&
      (source.counters.ARMOR ?? 0) === 0
      ? source
      : null;
  };
  const events = new Map<string, EventBehavior>([
    [
      pin.version,
      {
        onEvent(s, id, event) {
          const source = observe(s, id, event);
          return source
            ? [{ sourceId: id, controller: source.controller, handler, event }]
            : [];
        },
      },
    ],
  ]);
  const triggers = new Map<string, TriggerBehavior>([
    [
      handler,
      {
        resolve(s, t) {
          const source = observe(s, t.sourceId, t.event);
          if (
            !source ||
            t.handler !== handler ||
            t.controller !== source.controller
          )
            throw Error("Invalid Archangel ARMOR trigger");
          if (
            !s.arena.includes(source.id) ||
            s.objects[source.id]?.incarnation !== source.incarnation ||
            (s.objects[source.id].counters.ARMOR ?? 0) > 0
          )
            return s;
          return effects.putCounters(s, source.id, [
            { instanceId: source.id, counter: "ARMOR", amount: 1 },
          ]);
        },
      },
    ],
  ]);
  return {
    events,
    triggers,
    triggerLabels: new Map([[handler, "Project Archangel: restore ARMOR."]]),
  };
}
