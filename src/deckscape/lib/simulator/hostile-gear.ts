import neuralDisruptor from "./neural-disruptor-card-v5.json";
import { isDeepStrictEqual } from "node:util";
import retainedRecipes from "./hostile-gear-cards-v3.json";
import { versionDefinition, type EngineManifest } from "./definition-version";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";
import type { StatEffect } from "./stat-layers";

const recipes = [...retainedRecipes, neuralDisruptor];

/** Brainshredder and Overdriver share malicious attachment and Force Quit restrictions. */
export function bindHostileGear(
  inputs: readonly PinnedDefinition[],
  engine: EngineManifest,
  rulesVersion: string,
  hasAbility: (s: GameState, id: string) => boolean,
) {
  const bound = new Map<string, string>();
  for (const input of inputs) {
    const pin = versionDefinition(input.definition, engine),
      r = recipes.find((r) => r.cardId === pin.definition.cardId);
    if (
      !r ||
      pin.version !== input.version ||
      pin.definition.rulesVersion !== rulesVersion ||
      !isDeepStrictEqual(
        pin.definition.characteristics,
        characteristicsSchema.parse(r.characteristics),
      ) ||
      !isDeepStrictEqual(pin.definition.handlers, r.handlers) ||
      bound.has(pin.version)
    )
      throw Error("Hostile gear definition mismatch");
    bound.set(pin.version, r.characteristics.name);
  }
  const attached = (s: GameState, host: string) =>
    s.arena.filter(
      (id) =>
        bound.has(s.objects[id].definitionVersion) &&
        hasAbility(s, id) &&
        s.objects[id].attachments.some(
          (a) => a.kind === "gear" && a.hostId === host,
        ),
    );
  const name = (s: GameState, id: string) =>
    bound.get(s.objects[id].definitionVersion);
  const brainCount = (s: GameState, host: string) =>
    attached(s, host).filter((id) => name(s, id) === "BRAINSHREDDER").length;
  return {
    malicious: (s: GameState, id: string) =>
      bound.has(s.objects[id]?.definitionVersion) && !s.objects[id].faceDown,
    canForceQuit: (s: GameState, id: string) =>
      attached(s, id).every((gear) => name(s, gear) === "NEURAL DISRUPTOR"),
    mustAttack: (s: GameState, id: string) =>
      attached(s, id).some((gear) => name(s, gear) === "NEURAL DISRUPTOR"),
    additionalPsychosis: (s: GameState, id: string) =>
      15 *
      attached(s, id).filter((gear) =>
        ["BRAINSHREDDER", "NEURAL DISRUPTOR"].includes(name(s, gear)!),
      ).length,
    immune: (
      s: GameState,
      id: string,
      current: ReadonlyMap<string, CardCharacteristics>,
    ) =>
      current.get(id)?.name.toUpperCase() === "XAX XANTHOS" &&
      brainCount(s, id) > 0,
    multiplyPsychosis(s: GameState, id: string, total: number) {
      for (const gear of attached(s, id))
        if (name(s, gear) === "OVERDRIVER") total *= 2;
      if (!Number.isSafeInteger(total))
        throw Error("Psychosis total exceeds supported integer range");
      return total;
    },
    statEffects(
      s: GameState,
      current: ReadonlyMap<string, CardCharacteristics>,
    ) {
      const result = new Map<string, StatEffect[]>();
      for (const host of s.arena) {
        const card = current.get(host);
        if (
          card?.cardType !== "character" ||
          card.name.toUpperCase() !== "XAX XANTHOS"
        )
          continue;
        const gear = attached(s, host).filter(
          (id) => name(s, id) === "BRAINSHREDDER",
        );
        result.set(
          host,
          gear.map((id) => ({
            id: `${id}:${s.objects[id].incarnation}:brainshredder-bonus`,
            timestamp: s.objects[id].timestamp,
            dependsOn: [],
            layer: "7d" as const,
            operation: "add" as const,
            attack: 6,
          })),
        );
      }
      return result;
    },
  };
}
