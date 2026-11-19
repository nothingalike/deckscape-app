import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { StatEffect } from "./stat-layers";

/** Explicitly swaps base values (7b), before ordinary bonuses and counters. */
export function supersymmetryStats(
  state: GameState,
  version: string | undefined,
  current: ReadonlyMap<string, CardCharacteristics>,
  hasAbility: (state: GameState, id: string) => boolean,
): Map<string, StatEffect[]> {
  const result = new Map<string, StatEffect[]>();
  if (!version) return result;
  for (const sourceId of state.environment) {
    const object = state.objects[sourceId];
    if (object.definitionVersion !== version || !hasAbility(state, sourceId))
      continue;
    const card = current.get(sourceId);
    if (card?.cardType !== "program" || card.subtype !== "environment")
      continue;
    for (const id of state.arena)
      if (current.get(id)?.cardType === "character")
        result.set(id, [
          ...(result.get(id) ?? []),
          {
            id: `${sourceId}:${object.incarnation}:base-swap`,
            timestamp: object.timestamp,
            dependsOn: [],
            layer: "7b",
            operation: "swap",
          },
        ]);
  }
  return result;
}
