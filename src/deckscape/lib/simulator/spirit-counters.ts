import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { PersistentDeparture } from "./destruction";

function hasSpirit(state: GameState, id: string): boolean {
  const count = state.objects[id]?.counters.SPIRIT ?? 0;
  if (!Number.isSafeInteger(count) || count < 0)
    throw new Error("Invalid SPIRIT counter count");
  return count > 0;
}

/** CR 703.4a: a counter changes the in-play character, never its retained printing.
 * Apply in the attribute-setting sublayer, before any RAM-cost modifiers.
 */
export function applySpiritCounterCosts(
  state: GameState,
  cards: ReadonlyMap<string, CardCharacteristics>,
): Map<string, CardCharacteristics> {
  const result = new Map(cards);
  for (const id of state.arena) {
    const card = cards.get(id);
    if (card?.cardType === "character" && hasSpirit(state, id))
      result.set(id, { ...card, ramCost: 0 });
  }
  return result;
}

/** One applicable replacement, not a global replacement-order solver. A caller
 * with competing replacements must resolve the affected player's choice first.
 * Purging an already-purging character is unchanged, avoiding replacement loops.
 */
export function replaceSpiritDepartures(
  state: GameState,
  intents: readonly PersistentDeparture[],
  cards: ReadonlyMap<string, CardCharacteristics>,
): PersistentDeparture[] {
  return intents.map((intent) =>
    state.arena.includes(intent.id) &&
    cards.get(intent.id)?.cardType === "character" &&
    hasSpirit(state, intent.id) &&
    !(intent.kind === "move" && intent.destination === "purge")
      ? {
          id: intent.id,
          kind: "move",
          destination: "purge",
          replacement: "spirit",
        }
      : structuredClone(intent),
  );
}
