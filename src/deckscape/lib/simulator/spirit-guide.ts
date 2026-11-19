import { isDeepStrictEqual } from "node:util";
import spec from "./spirit-guide-specification-v3.json";
import type { Seat } from "./setup";
import { versionDefinition, type EngineManifest } from "./definition-version";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";
import { ruleEventObservationState, type EventBehavior } from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";

export const spiritGuideId = spec.cardId;

const handler = spec.handlerId;

/** The controller is captured when the tarot is played; source departure does not erase the trigger. */
export function bindSpiritGuide(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  effects: {
    hasAbility(state: GameState, id: string): boolean;
    create(state: GameState, player: Seat, sourceId: string): GameState;
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
      { id: handler, version: spec.handlerVersion, parameters: {} },
    ])
  )
    throw Error("Spirit Guide definition pin mismatch");
  const check = (s: GameState) => {
    if (s.engineVersion !== engine.version || s.rulesVersion !== rulesVersion)
      throw Error("Spirit Guide runtime version mismatch");
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
            throw Error("Invalid Spirit Guide trigger");
          const observed = ruleEventObservationState(state, event),
            source = observed.objects[trigger.sourceId];
          if (
            source?.definitionVersion !== pin.version ||
            source.controller !== trigger.controller ||
            !effects.hasAbility(observed, source.id)
          )
            throw Error("Invalid retained Spirit Guide source");
          return effects.create(state, trigger.controller, trigger.sourceId);
        },
      },
    ],
  ]);
  return {
    events,
    triggers,
    triggerLabels: new Map([
      [handler, "Spirit Guide: create a Dreamwalker token."],
    ]),
  };
}
