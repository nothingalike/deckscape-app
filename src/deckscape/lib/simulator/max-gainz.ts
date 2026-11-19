import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";

/** Continuous contributions retain source chronology for the owning ability-layer interpreter. */
export function maxGainz(
  state: GameState,
  sourceId: string,
  current: ReadonlyMap<string, CardCharacteristics>,
) {
  return state.arena.flatMap((targetId) => {
    const card = current.get(targetId);
    if (!card) throw new Error("MAX GAINZ characteristics unavailable");
    return card.cardType === "character"
      ? [
          {
            sourceId,
            targetId,
            timestamp: state.objects[sourceId].timestamp,
            keyword: "STAMINA" as const,
          },
        ]
      : [];
  });
}
