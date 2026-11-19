import type { Card, Entry } from "./types";
export type Owned = Record<string, number>;
export function ownedByName(owned: Owned, cards: Card[]) {
  const result: Owned = {};
  for (const c of cards)
    result[c.normalized_name] =
      (result[c.normalized_name] ?? 0) + (owned[c.id] ?? 0);
  return result;
}
export function missingCards(entries: Entry[], owned: Owned, cards: Card[]) {
  const have = ownedByName(owned, cards);
  const need = new Map<string, { name: string; required: number }>();
  const map = new Map(cards.map((c) => [c.id, c]));
  for (const e of entries) {
    const c = map.get(e.card_id);
    const key = c?.normalized_name ?? e.card_id;
    const row = need.get(key) ?? {
      name: c?.name ?? "Unknown card",
      required: 0,
    };
    row.required += e.quantity;
    need.set(key, row);
  }
  return [...need]
    .map(([key, row]) => ({
      ...row,
      owned: have[key] ?? 0,
      missing: Math.max(0, row.required - (have[key] ?? 0)),
    }))
    .sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name));
}
