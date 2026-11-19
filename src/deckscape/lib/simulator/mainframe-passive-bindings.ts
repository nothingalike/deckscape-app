import { isDeepStrictEqual } from "node:util";
import specifications from "./mainframe-passive-specifications-v1.json";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import { versionDefinition, type EngineManifest } from "./definition-version";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";
import type { StatEffect } from "./stat-layers";
import { mainframeTierRequirements } from "./synergy";

export interface MainframePassiveEvaluation {
  /** Owning layer evaluator resolves ability removal/copy/text effects before stats. */
  hasAbility(state: GameState, sourceId: string, handler: string): boolean;
}

/** Retained specifications are executable bindings, separate from mutable review data.
 * Returns layer-7 contributions; the runtime must combine them with all other effects
 * before applying counters and swaps. It does not register a release or promote support. */
export function bindMainframePassives(
  inputs: readonly PinnedDefinition[],
  engine: EngineManifest,
  rulesVersion: string,
  evaluated: MainframePassiveEvaluation,
) {
  const engineVersion = engine.version;
  const bound = new Map<string, (typeof specifications)[number]>();
  const seen = new Set<string>();
  for (const input of inputs) {
    const pin = versionDefinition(input.definition, engine);
    const spec = specifications.find(
      (item) => item.cardId === pin.definition.cardId,
    );
    if (
      pin.version !== input.version ||
      pin.definition.rulesVersion !== rulesVersion
    )
      throw new Error("Mainframe passive definition pin mismatch");
    if (!spec || seen.has(spec.cardId))
      throw new Error("Unknown or duplicate mainframe passive binding");
    if (
      !isDeepStrictEqual(
        pin.definition.characteristics,
        characteristicsSchema.parse(spec.characteristics),
      ) ||
      !isDeepStrictEqual(pin.definition.handlers, [
        { id: spec.handlerId, version: spec.handlerVersion, parameters: {} },
      ])
    )
      throw new Error(
        "Mainframe definition does not match its versioned passive implementation",
      );
    seen.add(spec.cardId);
    bound.set(pin.version, structuredClone(spec));
  }
  return {
    statEffects(
      state: GameState,
      beforeStats: ReadonlyMap<string, CardCharacteristics>,
    ): Map<string, StatEffect[]> {
      if (
        state.engineVersion !== engineVersion ||
        state.rulesVersion !== rulesVersion
      )
        throw new Error("Mainframe passive runtime version mismatch");
      const result = new Map<string, StatEffect[]>();
      for (const player of state.players)
        for (const sourceId of player.zones.mainframe) {
          const source = state.objects[sourceId];
          if (!source) throw new Error("Missing mainframe passive source");
          const spec = bound.get(source.definitionVersion);
          if (
            !spec ||
            source.faceDown ||
            !evaluated.hasAbility(
              structuredClone(state),
              sourceId,
              spec.handlerId,
            )
          )
            continue;
          const sourceCard = beforeStats.get(sourceId);
          if (sourceCard?.cardType !== "mainframe")
            throw new Error("Mainframe passive characteristics unavailable");
          // Ability text/type changes must bind their own implementation, never reuse the
          // printed interpreter with a different tier layout.
          if (
            !isDeepStrictEqual(sourceCard.tiers, spec.characteristics.tiers) ||
            sourceCard.prefix !== spec.characteristics.prefix
          )
            throw new Error(
              "Mainframe passive ability text changed without a matching interpreter",
            );
          const tiers = mainframeTierRequirements(state, sourceId, beforeStats);
          const attackPerGear = tiers[1] ? 2 : tiers[0] ? 1 : 0;
          if (!attackPerGear) continue;
          for (const id of state.arena) {
            const card = beforeStats.get(id),
              object = state.objects[id];
            if (!card || !object)
              throw new Error(
                "Mainframe passive target characteristics unavailable",
              );
            if (
              card.cardType !== "character" ||
              object.controller !== source.owner ||
              !card.factions.includes("CYBERNETIC")
            )
              continue;
            const attached = state.arena.filter((gearId) => {
              const gear = beforeStats.get(gearId);
              if (!gear)
                throw new Error(
                  "Mainframe passive gear characteristics unavailable",
                );
              return (
                gear.cardType === "gear" &&
                gear.subtype === "cyberware" &&
                state.objects[gearId].attachments.some(
                  (link) => link.kind === "gear" && link.hostId === id,
                )
              );
            }).length;
            if (!attached) continue;
            const effect: StatEffect = {
              id: `${sourceId}:${source.incarnation}:${spec.handlerId}`,
              timestamp: source.timestamp,
              dependsOn: [],
              layer: "7d",
              operation: "add",
              attack: attackPerGear * attached,
              defence: attached,
            };
            result.set(id, [...(result.get(id) ?? []), effect]);
          }
        }
      return result;
    },
  };
}
