import { addUntilTurnEndCombatEffect } from "./timed-combat-effects";
import { isDeepStrictEqual } from "node:util";
import spec from "./berserker-specification-v3.json";
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
export const berserkerId = spec.cardId;

export function bindBerserker(
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
    throw Error("Berserker definition mismatch");
  const tier = (
    state: GameState,
    sourceId: string,
    event: RuleEvent,
  ): number => {
    if (
      state.engineVersion !== engine.version ||
      state.rulesVersion !== rulesVersion
    )
      throw Error("Berserker runtime mismatch");
    if (event.type !== "character-attacked") return 0;
    const observed = ruleEventObservationState(state, event),
      source = observed.objects[sourceId];
    if (
      source?.definitionVersion !== pin.version ||
      source.controller !== event.player ||
      !observed.players[source.controller].zones.mainframe.includes(sourceId) ||
      !effects.hasAbility(observed, sourceId)
    )
      return 0;
    const attacker = effects.characteristics(observed).get(event.instanceId);
    if (
      attacker?.cardType !== "character" ||
      !attacker.factions.includes("THRASHER")
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
            event.type !== "character-attacked"
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
            trigger.event.type !== "character-attacked" ||
            trigger.controller !== trigger.event.player
          )
            throw Error("Invalid retained Berserker trigger");
          const id = trigger.event.instanceId,
            observed = ruleEventObservationState(state, trigger.event);
          const current = effects.characteristics(state);
          if (
            !state.arena.includes(id) ||
            state.objects[id]?.incarnation !==
              observed.objects[id]?.incarnation ||
            current.get(id)?.cardType !== "character"
          )
            return state;
          let next = addUntilTurnEndStatEffect(
            state,
            trigger.sourceId,
            id,
            { layer: "7d", operation: "add", attack: 1, defence: 0 },
            current,
          );
          if (amount === 2)
            next = addUntilTurnEndCombatEffect(
              next,
              trigger.sourceId,
              id,
              { kind: "grant-keyword", keyword: "OVERRUN" },
              current,
            );
          return next;
        },
      },
    ],
  ]);
  return {
    events,
    triggers,
    triggerLabels: new Map([
      [spec.handlerId, "Berserker: boost your Thrasher characters."],
    ]),
  };
}
