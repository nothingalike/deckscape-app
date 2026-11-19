import { isDeepStrictEqual } from "node:util";
import spec from "./omnis-specification-v3.json";
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
import { applyHealthChanges } from "./health";
export const omnisId = spec.cardId;

export function bindOmnis(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  effects: {
    characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
    hasAbility(state: GameState, id: string): boolean;
    install(state: GameState, player: Seat, running: boolean): GameState;
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
    throw Error("Omnis definition mismatch");
  const tier = (
    state: GameState,
    sourceId: string,
    event: RuleEvent,
  ): number => {
    if (
      state.engineVersion !== engine.version ||
      state.rulesVersion !== rulesVersion
    )
      throw Error("Omnis runtime mismatch");
    if (event.type !== "netcheck-started") return 0;
    const observed = ruleEventObservationState(state, event),
      source = observed.objects[sourceId];
    if (
      source?.definitionVersion !== pin.version ||
      source.controller !== event.player ||
      !observed.players[event.player].zones.mainframe.includes(sourceId) ||
      !effects.hasAbility(observed, sourceId)
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
            event.type !== "netcheck-started"
          )
            return [];
          return [
            {
              sourceId,
              controller: event.player,
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
            trigger.event.type !== "netcheck-started" ||
            trigger.controller !== trigger.event.player
          )
            throw Error("Invalid retained Omnis trigger");
          let next = applyHealthChanges(
            state,
            trigger.sourceId,
            (["MF", "BF"] as const).map((channel) => ({
              player: trigger.controller,
              channel,
              amount,
              operation: "lose" as const,
              cause: "effect" as const,
            })),
          );
          for (let n = 0; n < amount; n++)
            next = effects.install(next, trigger.controller, amount === 1);
          return next;
        },
      },
    ],
  ]);
  return {
    events,
    triggers,
    triggerLabels: new Map([
      [spec.handlerId, "Omnis Blood Diamond: lose health and install RAM."],
    ]),
  };
}
