import { isDeepStrictEqual } from "node:util";
import spec from "./deepnet-specification-v3.json";
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
import type { CombatDamagePacket } from "./combat-damage";
export const deepnetId = spec.cardId;

export function bindDeepnet(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  effects: {
    characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
    hasAbility(state: GameState, id: string): boolean;
    damage(state: GameState, packets: readonly CombatDamagePacket[]): GameState;
    draw(state: GameState, player: Seat, count: number): GameState;
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
    throw Error("Deepnet definition mismatch");
  const tier = (
    state: GameState,
    sourceId: string,
    event: RuleEvent,
  ): number => {
    if (
      state.engineVersion !== engine.version ||
      state.rulesVersion !== rulesVersion
    )
      throw Error("Deepnet runtime mismatch");
    if (event.type !== "program-played" || event.subtype !== "protocol")
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
    return active[1] ? 2 : active[0] ? 1 : 0;
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
  const targets: NonNullable<TriggerBehavior["targets"]> = (state, trigger) => {
    if (!tier(state, trigger.sourceId, trigger.event))
      throw Error("Invalid Deepnet target trigger");
    return [
      { kind: "player", player: 0 },
      { kind: "player", player: 1 },
    ];
  };
  const triggers = new Map<string, TriggerBehavior>([
    [
      spec.handlerId,
      {
        targets,

        resolve(state, trigger) {
          const amount = tier(state, trigger.sourceId, trigger.event);
          if (
            !amount ||
            trigger.handler !== spec.handlerId ||
            trigger.event.type !== "program-played" ||
            trigger.controller !== trigger.event.player
          )
            throw Error("Invalid retained Deepnet trigger");
          if (
            trigger.target?.kind !== "player" ||
            !targets(state, trigger).some((t) =>
              isDeepStrictEqual(t, trigger.target),
            )
          )
            return state;
          const next = effects.damage(state, [
            {
              sourceId: trigger.sourceId,
              recipient: "player",
              player: trigger.target.player,
              channel: "MF",
              amount: 2,
            },
          ]);
          return amount === 2 && !next.outcome
            ? effects.draw(next, trigger.controller, 1)
            : next;
        },
      },
    ],
  ]);
  return {
    events,
    triggers,
    triggerLabels: new Map([
      [
        spec.handlerId,
        "Deepnet: damage a player; draw at the upper threshold.",
      ],
    ]),
  };
}
