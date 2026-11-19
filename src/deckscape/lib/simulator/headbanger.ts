import { isDeepStrictEqual } from "node:util";
import spec from "./headbanger-specification-v3.json";
import { versionDefinition, type EngineManifest } from "./definition-version";
import type { PinnedDefinition } from "./deck-admission";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import {
  ruleEventObservationState,
  type RuleEvent,
  type EventBehavior,
} from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import { mainframeTierRequirements } from "./synergy";
import { addUntilTurnEndStatEffect } from "./timed-stat-effects";
export const headbangerId = spec.cardId;

export function bindHeadbanger(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  effects: {
    characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
    hasAbility(state: GameState, id: string): boolean;
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
    throw Error("Headbanger definition mismatch");
  const tier = (
    state: GameState,
    sourceId: string,
    event: RuleEvent,
  ): number => {
    if (
      state.engineVersion !== engine.version ||
      state.rulesVersion !== rulesVersion
    )
      throw Error("Headbanger runtime mismatch");
    if (event.type !== "persistent-destroyed") return 0;
    const observed = ruleEventObservationState(state, event),
      source = observed.objects[sourceId];
    if (
      source?.definitionVersion !== pin.version ||
      source.controller !== event.destroyedBy ||
      source.controller === event.player ||
      !observed.players[source.controller].zones.mainframe.includes(sourceId) ||
      !effects.hasAbility(observed, sourceId)
    )
      return 0;
    if (
      effects.characteristics(observed).get(event.instanceId)?.cardType !==
      "character"
    )
      return 0;
    const active = mainframeTierRequirements(
      observed,
      sourceId,
      effects.characteristics(observed),
    );
    return active[1] ? 2 : active[0] ? 1 : 0;
  };
  const events = new Map<string, EventBehavior>([
    [
      pin.version,
      {
        onEvent(state, sourceId, event) {
          if (
            !tier(state, sourceId, event) ||
            event.type !== "persistent-destroyed"
          )
            return [];
          return [
            {
              sourceId,
              controller: event.destroyedBy!,
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
          const amount = tier(state, trigger.sourceId, trigger.event);
          if (
            !amount ||
            trigger.handler !== spec.handlerId ||
            trigger.event.type !== "persistent-destroyed" ||
            trigger.controller !== trigger.event.destroyedBy
          )
            throw Error("Invalid retained Headbanger trigger");
          let next = structuredClone(state);
          const current = effects.characteristics(state);
          for (const id of state.arena) {
            const card = current.get(id);
            if (
              state.objects[id].controller === trigger.controller &&
              card?.cardType === "character" &&
              card.factions.includes("THRASHER")
            )
              next = addUntilTurnEndStatEffect(
                next,
                trigger.sourceId,
                id,
                {
                  layer: "7d",
                  operation: "add",
                  attack: amount,
                  defence: amount,
                },
                current,
              );
          }
          return next;
        },
      },
    ],
  ]);
  return {
    events,
    triggers,
    triggerLabels: new Map([
      [spec.handlerId, "Headbanger: boost your Thrasher characters."],
    ]),
  };
}
