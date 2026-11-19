import { getDeckCardStrategy } from "./deck-card-strategy";
import type { Card, Entry, Section } from "./types";

export function addDestination(
  card: Pick<Card, "card_type" | "copies_limit"> &
    Partial<Pick<Card, "normalized_name">>,
  sideboard = false,
): Section | null {
  return getDeckCardStrategy(card)?.destination(sideboard) ?? null;
}

export function profileGroups(entries: Entry[], cards: Card[]) {
  const map = new Map(cards.map((c) => [c.id, c]));
  const cyber = entries.filter((e) => e.section === "cyberdeck");
  const types = [
    ...new Set(cyber.map((e) => map.get(e.card_id)?.card_type || "unknown")),
  ];
  const preferred = ["character", "program", "gear"];
  types.sort(
    (a, b) =>
      (preferred.includes(a) ? preferred.indexOf(a) : 99) -
        (preferred.includes(b) ? preferred.indexOf(b) : 99) ||
      a.localeCompare(b),
  );
  const names: Record<string, string> = {
    character: "Characters",
    program: "Programs",
    gear: "Gear",
    unknown: "Unknown cards",
  };
  return types.map((type) => ({
    label: names[type] || type.charAt(0).toUpperCase() + type.slice(1),
    entries: cyber.filter(
      (e) => (map.get(e.card_id)?.card_type || "unknown") === type,
    ),
  }));
}
