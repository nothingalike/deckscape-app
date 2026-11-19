import { isDeepStrictEqual } from "node:util";
import baseGearSpecs from "./base-gear-specifications-v3.json";
import combatGearSpecs from "./combat-gear-specifications-v3.json";
import simpleSpecs from "./simple-gear-specifications-v3.json";
import passiveSpecs from "./cybernetic-gear-specifications-v1.json";
import grantedSpecs from "./gear-granted-specifications-v1.json";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import { versionDefinition, type EngineManifest } from "./definition-version";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";
import type { StatEffect } from "./stat-layers";
import { evaluatePlayerSynergy } from "./synergy";
const specs = [
  ...passiveSpecs,
  ...baseGearSpecs,
  ...combatGearSpecs,
  ...simpleSpecs.filter((s) => s.kind === "railgun"),
  ...grantedSpecs.filter((s) => s.kind === "knux" || s.kind === "codebreaker"),
];

/** Retained passive gear contributions. Granted activations and hit effects are
 * added separately before the other Cybernetic gear can enter this inventory. */
export function bindCyberneticGear(
  inputs: readonly PinnedDefinition[],
  engine: EngineManifest,
  rulesVersion: string,
  effects: {
    /** Characteristics after faction/ability layers, before these stat additions. */
    characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
    hasAbility(state: GameState, sourceId: string, handler: string): boolean;
  },
) {
  const bound = new Map<string, (typeof specs)[number]>();
  const ids = new Set<string>();
  for (const input of inputs) {
    const pin = versionDefinition(input.definition, engine);
    const spec = specs.find((s) => s.cardId === pin.definition.cardId);
    if (
      !spec ||
      ids.has(spec.cardId) ||
      pin.version !== input.version ||
      pin.definition.rulesVersion !== rulesVersion ||
      !isDeepStrictEqual(
        pin.definition.characteristics,
        characteristicsSchema.parse(spec.characteristics),
      ) ||
      !isDeepStrictEqual(pin.definition.handlers, [
        { id: spec.handlerId, version: spec.handlerVersion, parameters: {} },
      ])
    )
      throw Error("Cybernetic gear definition mismatch");
    ids.add(spec.cardId);
    bound.set(pin.version, spec);
  }
  function contributions(state: GameState) {
    if (
      state.engineVersion !== engine.version ||
      state.rulesVersion !== rulesVersion
    )
      throw Error("Cybernetic gear runtime mismatch");
    if (!bound.size) return [];
    const current = effects.characteristics(state);
    const synergy = evaluatePlayerSynergy(state, current);
    return state.arena.flatMap((id) => {
      const object = state.objects[id],
        spec = bound.get(object.definitionVersion);
      if (
        !spec ||
        object.faceDown ||
        !effects.hasAbility(state, id, spec.handlerId)
      )
        return [];
      const hosts = new Set(
        object.attachments
          .filter(
            (a) =>
              a.kind === "gear" &&
              state.arena.includes(a.hostId) &&
              current.get(a.hostId)?.cardType === "character",
          )
          .map((a) => a.hostId),
      );
      return [...hosts].map((hostId) => ({
        hostId,
        kind: spec.kind,
        id: `${id}:${object.incarnation}:${spec.handlerId}`,
        timestamp: object.timestamp,
        attack:
          spec.kind === "battle-axe"
            ? 3
            : spec.kind === "snatcher"
              ? 0
              : spec.kind === "drive-saw"
                ? 2 * (synergy[object.controller].factions.CYBERNETIC ?? 0)
                : spec.kind === "railgun"
                  ? 5
                  : spec.kind === "knux"
                    ? 4
                    : spec.kind === "codebreaker"
                      ? 0
                      : 2,
        psychosis:
          spec.kind === "drive-saw"
            ? 10
            : spec.kind === "knux" ||
                spec.kind === "codebreaker" ||
                spec.kind === "flux-cannon" ||
                spec.kind === "snatcher"
              ? 5
              : 0,
      }));
    });
  }
  return {
    statEffects(state: GameState): Map<string, StatEffect[]> {
      const result = new Map<string, StatEffect[]>();
      for (const c of contributions(state))
        result.set(c.hostId, [
          ...(result.get(c.hostId) ?? []),
          {
            id: c.id,
            timestamp: c.timestamp,
            dependsOn: [],
            layer: c.kind === "gigadyne-amp" ? "7b" : "7d",
            operation: c.kind === "gigadyne-amp" ? "multiply" : "add",
            attack: c.attack,
          },
        ]);
      return result;
    },
    additionalPsychosis(state: GameState, hostId: string): number {
      return contributions(state)
        .filter((c) => c.hostId === hostId)
        .reduce((sum, c) => sum + c.psychosis, 0);
    },
  };
}
