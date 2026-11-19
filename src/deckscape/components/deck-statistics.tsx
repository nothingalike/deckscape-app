"use client";
import { deckStats } from "@/lib/deck-stats";
import type { Card, Entry } from "@/lib/types";
import { DeckTools } from "./deck-tools";
export function DeckStatistics({
  entries,
  cards,
}: {
  entries: Entry[];
  cards: Card[];
}) {
  const stats = deckStats(entries, cards);
  const cyberdeck = entries.filter((e) => e.section === "cyberdeck");
  const byId = new Map(cards.map((c) => [c.id, c]));
  const factions = new Map<string, number>();
  for (const entry of cyberdeck) {
    const card = byId.get(entry.card_id);
    for (const faction of card?.factions.length
      ? card.factions
      : [card ? "Factionless" : "Unknown"])
      factions.set(faction, (factions.get(faction) ?? 0) + entry.quantity);
  }
  const total = entries.reduce((n, e) => n + e.quantity, 0);
  const unique = new Set(
    entries.map((e) => byId.get(e.card_id)?.normalized_name ?? e.card_id),
  ).size;
  const breakdown = (rows: [string, number][]) => (
    <ul className="stats-breakdown">
      {rows.map(([label, count]) => (
        <li key={label}>
          <span>{label}</span>
          <strong>{count}</strong>
        </li>
      ))}
    </ul>
  );
  return (
    <section className="deck-statistics" aria-label="Deck statistics">
      <div className="stats-summary">
        <div>
          <strong>{total}</strong>
          <span>Total copies · all sections</span>
        </div>
        <div>
          <strong>{unique}</strong>
          <span>Unique cards · all sections</span>
        </div>
        <div>
          <strong>{cyberdeck.reduce((n, e) => n + e.quantity, 0)}</strong>
          <span>Cyberdeck copies</span>
        </div>
      </div>
      <DeckTools entries={entries} cards={cards} expandedCurve />
      <div className="stats-panels">
        <section>
          <h3>Card types</h3>
          <p>Cyberdeck copies</p>
          {breakdown(stats.types)}
        </section>
        <section>
          <h3>Factions</h3>
          <p>Cyberdeck copies; multi-faction cards count in each faction.</p>
          {breakdown(
            [...factions].sort(
              (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
            ),
          )}
        </section>
      </div>
    </section>
  );
}
