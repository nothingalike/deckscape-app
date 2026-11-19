import { isDeepStrictEqual } from "node:util";
import spec from "./astra-specification-v3.json";
import { versionDefinition, type EngineManifest } from "./definition-version";
import { characteristicsSchema } from "./characteristics";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { EventBehavior } from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";

export function bindAstra(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  effects: {
    hasAbility(state: GameState, sourceId: string): boolean;
    draw(state: GameState, player: Seat, sourceId: string): GameState;
  },
) {
  const pin = versionDefinition(input.definition, engine),
    engineVersion = engine.version;
  if (
    pin.version !== input.version ||
    pin.definition.rulesVersion !== rulesVersion
  )
    throw new Error("Astra definition pin mismatch");
  if (
    pin.definition.cardId !== spec.cardId ||
    !isDeepStrictEqual(
      pin.definition.characteristics,
      characteristicsSchema.parse(spec.characteristics),
    ) ||
    !isDeepStrictEqual(pin.definition.handlers, [
      { id: spec.handlerId, version: spec.handlerVersion, parameters: {} },
    ])
  )
    throw new Error(
      "Astra definition does not match its retained implementation",
    );
  const assertPins = (state: GameState) => {
    if (
      state.engineVersion !== engineVersion ||
      state.rulesVersion !== rulesVersion
    )
      throw new Error("Astra runtime version mismatch");
  };
  const events = new Map<string, EventBehavior>([
    [
      pin.version,
      {
        onEvent(state, sourceId, event) {
          assertPins(state);
          if (
            event.type !== "character-entered" ||
            event.instanceId !== sourceId
          )
            return [];
          if (
            !event.zonesAtEvent ||
            !event.observers ||
            !event.statEffectsBefore
          )
            throw new Error("Character entry observation unavailable");
          const source = state.objects[sourceId];
          if (source?.definitionVersion !== pin.version)
            throw new Error("Astra source binding unavailable");
          if (
            source.faceDown ||
            !state.arena.includes(sourceId) ||
            !effects.hasAbility(structuredClone(state), sourceId)
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
          assertPins(state);
          const event = trigger.event;
          const source =
            "zonesAtEvent" in event
              ? event.zonesAtEvent?.objects[trigger.sourceId]
              : undefined;
          if (
            trigger.handler !== spec.handlerId ||
            event.type !== "character-entered" ||
            event.instanceId !== trigger.sourceId ||
            event.player !== trigger.controller ||
            source?.definitionVersion !== pin.version ||
            source.controller !== trigger.controller
          )
            throw new Error("Invalid retained Astra trigger");
          return effects.draw(state, trigger.controller, trigger.sourceId);
        },
      },
    ],
  ]);
  return {
    events,
    triggers,
    triggerLabels: new Map([
      [spec.handlerId, "Astra: draw one card on entry."],
    ]),
  };
}
