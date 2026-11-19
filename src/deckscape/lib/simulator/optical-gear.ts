import { isDeepStrictEqual } from "node:util";
import thirdEye from "./third-eye-card-v5.json";
import retainedRecipes from "./optical-gear-cards-v3.json";
import { versionDefinition, type EngineManifest } from "./definition-version";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";

const recipes = [...retainedRecipes, thirdEye];
export function bindOpticalGear(
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
      throw Error("Optical gear definition mismatch");
    bound.set(pin.version, r.characteristics.name);
  }
  const sources = (s: GameState, name: string) =>
    s.arena.filter(
      (id) =>
        bound.get(s.objects[id].definitionVersion) === name &&
        hasAbility(s, id),
    );
  const attaches = (s: GameState, gear: string, host: string) =>
    s.objects[gear].attachments.some(
      (a) => a.kind === "gear" && a.hostId === host,
    );
  return {
    thirdEye(s: GameState, viewer: 0 | 1) {
      return sources(s, "THIRD EYE").some(
        (id) => s.objects[id].controller === viewer,
      );
    },
    cloaked(
      s: GameState,
      host: string,
      current: ReadonlyMap<string, CardCharacteristics>,
    ) {
      if (
        !s.arena.includes(host) ||
        current.get(host)?.cardType !== "character"
      )
        return false;
      // Prohibition wins over every grant, regardless of attachment timestamp.
      if (
        sources(s, "A-Z OPTICS").some(
          (id) => s.objects[id].controller !== s.objects[host].controller,
        )
      )
        return false;
      return sources(s, "CLOAKING FIELD").some((id) => attaches(s, id, host));
    },
    vision(s: GameState, current: ReadonlyMap<string, CardCharacteristics>) {
      return new Set(
        s.arena.filter(
          (host) =>
            current.get(host)?.cardType === "character" &&
            sources(s, "A-Z OPTICS").some((id) => attaches(s, id, host)),
        ),
      );
    },
  };
}
