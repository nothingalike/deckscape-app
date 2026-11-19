import { isDeepStrictEqual } from "node:util";
import spec from "./firestarter-specification-v1.json";
import { versionDefinition, type EngineManifest } from "./definition-version";
import type { PinnedDefinition } from "./deck-admission";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import type { GameState } from "./game-state";
import type { EventBehavior, PendingTrigger } from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import type { TriggerTarget } from "./trigger-target";
import type { CombatDamagePacket } from "./combat-damage";
import { mainframeTierRequirements } from "./synergy";

export interface FirestarterEffects {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  hasAbility(state: GameState, sourceId: string): boolean;
  canTarget(
    state: GameState,
    sourceId: string,
    target: TriggerTarget,
    source: CardCharacteristics,
  ): boolean;
  damage(state: GameState, packet: CombatDamagePacket): GameState;
}

export function bindFirestarter(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  effects: FirestarterEffects,
) {
  const pin = versionDefinition(input.definition, engine),
    engineVersion = engine.version;
  if (
    pin.version !== input.version ||
    pin.definition.rulesVersion !== rulesVersion
  )
    throw new Error("Firestarter definition pin mismatch");
  if (
    pin.definition.cardId !== spec.cardId ||
    !isDeepStrictEqual(
      pin.definition.characteristics,
      characteristicsSchema.parse(spec.characteristics),
    ) ||
    !isDeepStrictEqual(pin.definition.handlers, spec.handlers)
  )
    throw new Error(
      "Firestarter definition does not match its retained implementation",
    );
  const assertPins = (state: GameState) => {
    if (
      state.engineVersion !== engineVersion ||
      state.rulesVersion !== rulesVersion
    )
      throw new Error("Firestarter runtime version mismatch");
  };
  const validate = (state: GameState, trigger: PendingTrigger) => {
    assertPins(state);
    const event = trigger.event,
      source =
        "zonesAtEvent" in event
          ? event.zonesAtEvent?.objects[trigger.sourceId]
          : undefined;
    if (
      event.type !== "program-played" ||
      event.subtype !== "script" ||
      !event.factions.includes("HACKER") ||
      event.player !== trigger.controller ||
      source?.definitionVersion !== pin.version ||
      source.owner !== trigger.controller ||
      !spec.handlers.some((handler) => handler.id === trigger.handler)
    )
      throw new Error("Invalid retained Firestarter trigger");
  };
  const targets = (
    state: GameState,
    trigger: PendingTrigger,
  ): TriggerTarget[] => {
    validate(state, trigger);
    const cards = effects.characteristics(structuredClone(state));
    const source = cards.get(trigger.sourceId);
    if (!source)
      throw new Error("Firestarter source characteristics unavailable");
    const options: TriggerTarget[] = [
      { kind: "player", player: 0 },
      { kind: "player", player: 1 },
    ];
    for (const id of state.arena) {
      const card = cards.get(id);
      if (!card)
        throw new Error("Firestarter target characteristics unavailable");
      if (card.cardType === "character")
        options.push({
          kind: "character",
          id,
          incarnation: state.objects[id].incarnation,
        });
    }
    return options.filter((target) =>
      effects.canTarget(
        structuredClone(state),
        trigger.sourceId,
        target,
        source,
      ),
    );
  };
  const events = new Map<string, EventBehavior>([
    [
      pin.version,
      {
        onEvent(state, sourceId, event) {
          assertPins(state);
          const source = state.objects[sourceId];
          if (source?.definitionVersion !== pin.version)
            throw new Error("Firestarter source binding unavailable");
          if (
            source.faceDown ||
            event.type !== "program-played" ||
            event.subtype !== "script" ||
            event.player !== source.owner ||
            !event.factions.includes("HACKER")
          )
            return [];
          if (
            !event.zonesAtEvent ||
            !event.observers ||
            !event.statEffectsBefore
          )
            throw new Error("Firestarter event observation unavailable");
          if (!effects.hasAbility(structuredClone(state), sourceId)) return [];
          const cards = effects.characteristics(structuredClone(state)),
            card = cards.get(sourceId);
          if (
            card?.cardType !== "mainframe" ||
            !isDeepStrictEqual(card.tiers, spec.characteristics.tiers) ||
            card.prefix !== spec.characteristics.prefix
          )
            throw new Error(
              "Firestarter ability changed without a matching interpreter",
            );
          const tiers = mainframeTierRequirements(state, sourceId, cards),
            tier = tiers[1] ? 1 : tiers[0] ? 0 : null;
          return tier === null
            ? []
            : [
                {
                  sourceId,
                  controller: source.owner,
                  handler: spec.handlers[tier].id,
                  event,
                },
              ];
        },
      },
    ],
  ]);
  const triggers = new Map<string, TriggerBehavior>(
    spec.handlers.map((handler, index) => [
      handler.id,
      {
        targets,
        resolve(state, trigger) {
          validate(state, trigger);
          if (trigger.handler !== handler.id || trigger.target === undefined)
            throw new Error("Firestarter target not selected");
          const target = trigger.target;
          if (
            target === null ||
            !targets(state, trigger).some((candidate) =>
              isDeepStrictEqual(candidate, target),
            )
          )
            return state;
          const packet: CombatDamagePacket = {
            sourceId: trigger.sourceId,
            amount: index + 1,
            channel: "MF",
            ...(target.kind === "player"
              ? { recipient: "player", player: target.player }
              : { recipient: "character", instanceId: target.id }),
          };
          return effects.damage(state, packet);
        },
      },
    ]),
  );
  return {
    events,
    triggers,
    triggerLabels: new Map(
      spec.handlers.map((handler, index) => [
        handler.id,
        `Firestarter: deal ${index + 1} MF damage to a chosen character or player.`,
      ]),
    ),
  };
}
