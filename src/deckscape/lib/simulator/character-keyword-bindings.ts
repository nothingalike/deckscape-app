import { isDeepStrictEqual } from "node:util";
import specifications from "./character-keyword-specifications-v1.json";
import activationSpecifications from "./character-activation-specifications-v1.json";
import { characterImplementationHandlers } from "./character-implementation-handlers";
import { versionDefinition, type EngineManifest } from "./definition-version";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";
import type { CombatKeyword } from "./combat-keywords";

/** Printed keyword contributions only; the owning ability-layer interpreter combines
 * these with granted/removed abilities. Never interpret typeline tags as keywords. */
export function bindCharacterKeywords(
  inputs: readonly PinnedDefinition[],
  engine: EngineManifest,
  rulesVersion: string,
  enabled: (
    state: GameState,
    sourceId: string,
    keyword: CombatKeyword,
  ) => boolean,
) {
  const engineVersion = engine.version;
  const definitions = new Map<string, (typeof specifications)[number]>();
  const seen = new Set<string>();
  for (const input of inputs) {
    const pin = versionDefinition(input.definition, engine);
    const spec = specifications.find(
      (spec) => spec.cardId === pin.definition.cardId,
    );
    const combined = activationSpecifications.find(
      (item) =>
        item.cardId === spec?.cardId &&
        item.keywords?.some(
          (keyword) =>
            keyword.handlerId === spec.handlerId &&
            keyword.keyword === spec.keyword,
        ),
    );
    if (
      pin.version !== input.version ||
      pin.definition.rulesVersion !== rulesVersion
    )
      throw new Error("Character keyword pin mismatch");
    if (
      !spec ||
      seen.has(pin.definition.cardId) ||
      !isDeepStrictEqual(
        pin.definition.characteristics,
        characteristicsSchema.parse(spec.characteristics),
      ) ||
      !isDeepStrictEqual(
        pin.definition.handlers,
        combined
          ? characterImplementationHandlers(combined)
          : [
              {
                id: spec.handlerId,
                version: spec.handlerVersion,
                parameters: {},
              },
            ],
      )
    )
      throw new Error("Character keyword specification mismatch");
    if (
      pin.definition.support !== "unimplemented" &&
      spec.characteristics.activatedAbilities.length &&
      (!combined ||
        combined.abilities.length !==
          spec.characteristics.activatedAbilities.length)
    )
      throw new Error("Character activated abilities remain unbound");
    seen.add(pin.definition.cardId);
    definitions.set(pin.version, spec);
  }
  return {
    keywords(
      state: GameState,
      current: ReadonlyMap<string, CardCharacteristics>,
    ): ReadonlyMap<string, ReadonlySet<CombatKeyword>> {
      if (
        state.engineVersion !== engineVersion ||
        state.rulesVersion !== rulesVersion
      )
        throw new Error("Character keyword runtime version mismatch");
      const result = new Map<string, ReadonlySet<CombatKeyword>>();
      for (const id of state.arena) {
        const source = state.objects[id],
          spec = definitions.get(source.definitionVersion);
        if (!spec) continue;
        const card = current.get(id);
        if (!card)
          throw new Error("Keyword source characteristics unavailable");
        const keyword = spec.keyword as CombatKeyword;
        result.set(
          id,
          new Set(
            !source.faceDown &&
              card.cardType === "character" &&
              enabled(structuredClone(state), id, keyword)
              ? [keyword]
              : [],
          ),
        );
      }
      return result;
    },
  };
}
