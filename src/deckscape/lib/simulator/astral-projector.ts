import { isDeepStrictEqual } from "node:util";
import specs from "./resource-character-specifications-v3.json";
import { characterImplementationHandlers } from "./character-implementation-handlers";
import { versionDefinition, type EngineManifest } from "./definition-version";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";
import { ruleEventObservationState, type EventBehavior } from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import { addUntilTurnEndStatEffect } from "./timed-stat-effects";

export const astralProjectorId = "29f208bf-7c04-4060-bc99-7497cd7570dc";
const spec = specs.find((s) => s.cardId === astralProjectorId)!;
const handler = "astral-projector/abilities-v1";

/** The activation binder supplies PHASE SHIFT; this binding supplies the tarot trigger. */
export function bindAstralProjector(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  effects: {
    hasAbility(state: GameState, id: string): boolean;
    characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
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
    !isDeepStrictEqual(
      pin.definition.handlers,
      characterImplementationHandlers(spec),
    )
  )
    throw Error("Astral Projector definition pin mismatch");
  const check = (s: GameState) => {
    if (s.engineVersion !== engine.version || s.rulesVersion !== rulesVersion)
      throw Error("Astral Projector runtime version mismatch");
  };
  const events = new Map<string, EventBehavior>([
    [
      pin.version,
      {
        onEvent(state, sourceId, event) {
          check(state);
          if (event.type !== "program-played" || !event.tags.includes("TAROT"))
            return [];
          if (
            !event.observers ||
            !event.zonesAtEvent ||
            !event.statEffectsBefore
          )
            throw Error("Tarot observation unavailable");
          const observed = ruleEventObservationState(state, event),
            source = observed.objects[sourceId];
          if (
            source?.definitionVersion !== pin.version ||
            source.controller !== event.player ||
            !effects.hasAbility(observed, sourceId)
          )
            return [];
          return [{ sourceId, controller: source.controller, handler, event }];
        },
      },
    ],
  ]);
  const triggers = new Map<string, TriggerBehavior>([
    [
      handler,
      {
        resolve(state, trigger) {
          check(state);
          const event = trigger.event;
          if (
            trigger.handler !== handler ||
            event.type !== "program-played" ||
            !event.tags.includes("TAROT") ||
            event.player !== trigger.controller ||
            !event.observers ||
            !event.zonesAtEvent ||
            !event.statEffectsBefore
          )
            throw Error("Invalid Astral Projector trigger");
          const observed = ruleEventObservationState(state, event),
            source = observed.objects[trigger.sourceId];
          if (
            source?.definitionVersion !== pin.version ||
            source.controller !== trigger.controller ||
            !effects.hasAbility(observed, source.id)
          )
            throw Error("Invalid retained Astral Projector source");
          const current = effects.characteristics(state);
          if (
            state.objects[source.id]?.incarnation !== source.incarnation ||
            !state.arena.includes(source.id) ||
            current.get(source.id)?.cardType !== "character"
          )
            return state;
          return addUntilTurnEndStatEffect(
            state,
            source.id,
            source.id,
            { layer: "7d", operation: "add", attack: 1, defence: 1 },
            current,
          );
        },
      },
    ],
  ]);
  return {
    events,
    triggers,
    triggerLabels: new Map([
      [handler, "Astral Projector: +1/+1 until turn end."],
    ]),
  };
}
