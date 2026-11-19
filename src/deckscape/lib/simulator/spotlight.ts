import { isDeepStrictEqual } from "node:util";
import spec from "./spotlight-specification-v3.json";
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
export const spotlightId = spec.cardId;

export function bindSpotlight(
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
    throw Error("Spotlight definition mismatch");
  const tier = (
    state: GameState,
    sourceId: string,
    event: RuleEvent,
  ): number => {
    if (
      state.engineVersion !== engine.version ||
      state.rulesVersion !== rulesVersion
    )
      throw Error("Spotlight runtime mismatch");
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
            throw Error("Invalid retained Spotlight trigger");
          const observed = ruleEventObservationState(state, trigger.event);
          const incarnation = observed.objects[trigger.sourceId].incarnation;
          if (
            amount === 1 &&
            state.effectUses?.some(
              (use) =>
                use.sourceId === trigger.sourceId &&
                use.incarnation === incarnation &&
                use.handler === spec.handlerId &&
                use.turn === state.turn.number,
            )
          )
            return state;
          let next = structuredClone(state);
          if (amount === 1)
            next.effectUses = [
              ...(next.effectUses ?? []),
              {
                sourceId: trigger.sourceId,
                incarnation,
                handler: spec.handlerId,
                turn: state.turn.number,
              },
            ];
          return effects.install(next, trigger.controller, true);
        },
      },
    ],
  ]);
  return {
    events,
    triggers,
    triggerLabels: new Map([
      [spec.handlerId, "Spotlight: install RAM running."],
    ]),
  };
}
