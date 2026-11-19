import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";

/** CR 703.5a; provisional stacking ruling accepted 2026-09-12: each counter
 * swaps once, so even counts cancel. Apply after attack-type setting effects.
 * Recompute from characteristics each time; never alter retained printings.
 */
export function applyInvertCounters(
  state: GameState,
  cards: ReadonlyMap<string, CardCharacteristics>,
): Map<string, CardCharacteristics> {
  const result = new Map(cards);
  for (const id of state.arena) {
    const card = cards.get(id);
    if (card?.cardType !== "character") continue;
    const count = state.objects[id]?.counters.INVERT ?? 0;
    if (!Number.isSafeInteger(count) || count < 0)
      throw new Error("Invalid INVERT counter count");
    if (count % 2 === 1)
      result.set(id, {
        ...card,
        attackType: card.attackType === "MF" ? "BF" : "MF",
      });
  }
  return result;
}
