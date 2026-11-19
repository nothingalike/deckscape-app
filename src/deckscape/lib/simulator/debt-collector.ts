import { isDeepStrictEqual } from "node:util";
import spec from "./debt-collector-specification-v1.json";
import { versionDefinition, type EngineManifest } from "./definition-version";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { CombatDamagePacket } from "./combat-damage";
import { observeCapturedEvent } from "./event-observation";
import {
  ruleEventObservationState,
  type RuleEvent,
  type EventBehavior,
} from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";

export interface DebtCollectorEffects {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  hasAbility(state: GameState, sourceId: string): boolean;
  /** Apply current damage replacement/prevention, retaining the observed source information. */
  damage(
    state: GameState,
    packets: readonly CombatDamagePacket[],
    source: CardCharacteristics,
  ): GameState;
}

/** User ruling, 2026-09-09: one trigger per simultaneous batch, even when all three RAM are spent. */
export function bindDebtCollector(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  effects: DebtCollectorEffects,
) {
  const pin = versionDefinition(input.definition, engine);
  if (
    pin.version !== input.version ||
    pin.definition.rulesVersion !== rulesVersion
  )
    throw new Error("Debt Collector definition pin mismatch");
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
      "Debt Collector definition does not match its retained implementation",
    );
  const engineVersion = engine.version;
  const assertPins = (state: GameState) => {
    if (
      state.engineVersion !== engineVersion ||
      state.rulesVersion !== rulesVersion
    )
      throw new Error("Debt Collector runtime version mismatch");
  };
  const refreshedRam = (state: GameState, player: Seat) => {
    const current = effects.characteristics(structuredClone(state));
    return [
      ...state.arena,
      ...state.environment,
      ...state.players.flatMap((p) => [
        ...p.zones.ramBank,
        ...p.zones.mainframe,
      ]),
    ].filter((id) => {
      const object = state.objects[id],
        card = current.get(id);
      if (!card)
        throw new Error("Debt Collector RAM characteristics unavailable");
      return (
        object.controller === player &&
        card.cardType === "ram" &&
        !object.running &&
        !object.attachments.some((link) => link.kind === "ram")
      );
    });
  };
  const qualifyingSource = (
    state: GameState,
    sourceId: string,
    event: RuleEvent,
  ) => {
    if (
      event.type !== "ram-commitments-changed" &&
      event.type !== "object-ran" &&
      event.type !== "object-refreshed" &&
      event.type !== "object-rebooted"
    )
      return null;
    if (!event.zonesAtEvent || !event.observers || !event.statEffectsBefore)
      throw new Error("Debt Collector event observation unavailable");
    let changed: string[], before: GameState;
    if (event.type === "ram-commitments-changed") {
      if (!event.attached.length) return null;
      if (!event.before)
        throw new Error("Debt Collector commitment observation unavailable");
      before = observeCapturedEvent(state, event.before);
      changed = event.attached.map((link) => link.ramId);
    } else {
      if (!event.batch)
        throw new Error("Debt Collector status batch unavailable");
      if (event.batch.index !== 0) return null;
      before = observeCapturedEvent(state, event.batch.before);
      changed = event.batch.operations
        .filter((op) => op.type === "object-ran")
        .map((op) => op.instanceId);
    }
    const after = ruleEventObservationState(state, event),
      source = after.objects[sourceId];
    if (source?.definitionVersion !== pin.version)
      throw new Error("Debt Collector source binding unavailable");
    const characteristics = effects
      .characteristics(structuredClone(after))
      .get(sourceId);
    if (!characteristics)
      throw new Error("Debt Collector source characteristics unavailable");
    if (
      source.faceDown ||
      !after.arena.includes(sourceId) ||
      characteristics.cardType !== "character" ||
      !effects.hasAbility(structuredClone(after), sourceId)
    )
      return null;
    const opponent: Seat = source.controller === 0 ? 1 : 0;
    const prior = refreshedRam(before, opponent);
    if (
      !prior.length ||
      refreshedRam(after, opponent).length ||
      !prior.every((id) => changed.includes(id))
    )
      return null;
    return { source, characteristics, opponent };
  };
  const events = new Map<string, EventBehavior>([
    [
      pin.version,
      {
        onEvent(state, sourceId, event) {
          assertPins(state);
          const qualified = qualifyingSource(state, sourceId, event);
          return qualified
            ? [
                {
                  sourceId,
                  controller: qualified.source.controller,
                  handler: spec.handlerId,
                  event,
                },
              ]
            : [];
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
          const qualified = qualifyingSource(
            state,
            trigger.sourceId,
            trigger.event,
          );
          if (
            trigger.handler !== spec.handlerId ||
            !qualified ||
            trigger.controller !== qualified.source.controller
          )
            throw new Error("Invalid retained Debt Collector trigger");
          return effects.damage(
            state,
            [
              {
                sourceId: trigger.sourceId,
                recipient: "player",
                player: qualified.opponent,
                channel: "BF",
                amount: 2,
              },
            ],
            qualified.characteristics,
          );
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
        "Debt Collector: deal 2 BF when an opponent spends their last refreshed RAM.",
      ],
    ]),
  };
}
