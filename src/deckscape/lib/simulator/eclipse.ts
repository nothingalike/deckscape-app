import { isDeepStrictEqual } from "node:util";
import spec from "./eclipse-specification-v3.json";
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
export const eclipseId = spec.cardId;
export function eclipseStats(
  state: GameState,
  version: string | undefined,
  current: ReadonlyMap<string, CardCharacteristics>,
  hasAbility: (state: GameState, id: string) => boolean,
) {
  const result = new Map<string, import("./stat-layers").StatEffect[]>();
  if (!version) return result;
  for (const player of state.players)
    for (const sourceId of player.zones.mainframe) {
      const source = state.objects[sourceId];
      if (
        source.definitionVersion !== version ||
        !hasAbility(state, sourceId) ||
        !mainframeTierRequirements(state, sourceId, current)[1]
      )
        continue;
      for (const id of state.arena) {
        const c = current.get(id);
        if (
          !state.objects[id].token ||
          c?.cardType !== "character" ||
          c.name !== "Dreamwalker"
        )
          continue;
        result.set(id, [
          ...(result.get(id) ?? []),
          {
            id: `${sourceId}:dreamwalker-bonus`,
            timestamp: source.timestamp,
            dependsOn: [],
            layer: "7d",
            operation: "add",
            attack: 1,
            defence: 1,
          },
        ]);
      }
    }
  return result;
}

export function bindEclipse(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  effects: {
    characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
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
      { id: spec.handlerId, version: 1, parameters: {} },
    ])
  )
    throw Error("Eclipse definition mismatch");
  const tier = (
    state: GameState,
    sourceId: string,
    event: RuleEvent,
  ): number => {
    if (
      state.engineVersion !== engine.version ||
      state.rulesVersion !== rulesVersion
    )
      throw Error("Eclipse runtime mismatch");
    if (event.type !== "program-played" || !event.tags.includes("TAROT"))
      return 0;
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
    return active[0] ? 1 : 0;
  };
  const events = new Map<string, EventBehavior>([
    [
      pin.version,
      {
        onEvent(state, sourceId, event) {
          if (!tier(state, sourceId, event) || event.type !== "program-played")
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
            trigger.event.type !== "program-played" ||
            trigger.controller !== trigger.event.player
          )
            throw Error("Invalid retained Eclipse trigger");
          return effects.create(state, trigger.controller, trigger.sourceId);
        },
      },
    ],
  ]);
  return {
    events,
    triggers,
    triggerLabels: new Map([
      [spec.handlerId, "Eclipse: create a Dreamwalker."],
    ]),
  };
}
