import { isDeepStrictEqual } from "node:util";
import spec from "./gearhead-specification-v3.json";
import { versionDefinition, type EngineManifest } from "./definition-version";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";
import { mainframeTierRequirements } from "./synergy";

export function bindGearhead(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  hasAbility: (state: GameState, id: string, handler: string) => boolean,
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
    !isDeepStrictEqual(pin.definition.handlers, spec.handlers)
  )
    throw Error("Gearhead definition mismatch");
  return (
    state: GameState,
    id: string,
    current: ReadonlyMap<string, CardCharacteristics>,
  ) => {
    if (
      state.engineVersion !== engine.version ||
      state.rulesVersion !== rulesVersion
    )
      throw Error("Gearhead runtime mismatch");
    if (!state.arena.includes(id) || current.get(id)?.cardType !== "character")
      return 0;
    const controller = state.objects[id].controller;
    let reduction = 0;
    for (const sourceId of state.players[controller].zones.mainframe) {
      const source = state.objects[sourceId];
      if (
        source.definitionVersion !== pin.version ||
        source.faceDown ||
        !hasAbility(state, sourceId, spec.handlers[0].id)
      )
        continue;
      const card = current.get(sourceId);
      if (
        card?.cardType !== "mainframe" ||
        !isDeepStrictEqual(card.tiers, spec.characteristics.tiers) ||
        card.prefix !== spec.characteristics.prefix
      )
        throw Error("Gearhead text changed without matching interpreter");
      const tiers = mainframeTierRequirements(state, sourceId, current);
      reduction += tiers[1] ? 10 : tiers[0] ? 5 : 0;
    }
    return reduction;
  };
}
