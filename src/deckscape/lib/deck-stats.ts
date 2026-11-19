import type { Card, Entry } from "./types";
export function deckStats(entries: Entry[], cards: Card[]) {
  const map = new Map(cards.map((c) => [c.id, c]));
  const costs: Record<string, number> = {};
  const types: Record<string, number> = {};
  for (const e of entries.filter((e) => e.section === "cyberdeck")) {
    const c = map.get(e.card_id);
    const raw = c?.ram_cost ?? [];
    const cost = !raw.length
      ? "No printed cost"
      : raw.every((v) => /^\d+$/.test(v))
        ? String(raw.reduce((n, v) => n + Number(v), 0))
        : "Variable / other";
    costs[cost] = (costs[cost] ?? 0) + e.quantity;
    const type = c?.card_type || "unknown";
    types[type] = (types[type] ?? 0) + e.quantity;
  }
  return {
    costs: Object.entries(costs).sort(
      ([a], [b]) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b),
    ),
    types: Object.entries(types).sort(),
  };
}
export type HandState = {
  hand: string[];
  pile: string[];
  mulliganUsed: boolean;
  drawn: number;
};
export function openingHand(
  entries: Entry[],
  random: () => number = Math.random,
): HandState {
  const pile = entries
    .filter((e) => e.section === "cyberdeck")
    .flatMap((e) => Array.from({ length: e.quantity }, () => e.card_id));
  if (pile.length < 5)
    throw new Error(
      "At least five cyberdeck cards are needed to test an opening hand.",
    );
  for (let i = pile.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pile[i], pile[j]] = [pile[j], pile[i]];
  }
  return {
    hand: pile.slice(0, 5),
    pile: pile.slice(5),
    mulliganUsed: false,
    drawn: 5,
  };
}
export function mulligan(state: HandState, selected: number[]): HandState {
  if (state.mulliganUsed)
    throw new Error("The opening mulligan has already been used.");
  if (
    new Set(selected).size !== selected.length ||
    selected.some(
      (i) => !Number.isInteger(i) || i < 0 || i >= state.hand.length,
    )
  )
    throw new Error("Invalid hand selection.");
  // Selection order is the player's chosen bottom-of-deck order, topmost first.
  const pile = [...state.pile, ...selected.map((i) => state.hand[i])];
  return {
    hand: [
      ...state.hand.filter((_, i) => !selected.includes(i)),
      ...pile.slice(0, selected.length),
    ],
    pile: pile.slice(selected.length),
    mulliganUsed: true,
    drawn: state.drawn + selected.length,
  };
}
export function drawNext(state: HandState): HandState {
  return state.pile.length
    ? {
        hand: [...state.hand, state.pile[0]],
        pile: state.pile.slice(1),
        mulliganUsed: true,
        drawn: state.drawn + 1,
      }
    : state;
}
