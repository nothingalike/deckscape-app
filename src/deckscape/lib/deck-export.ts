import { sections, type Card, type Deck, type Entry } from "./types";

export type DeckExportCard = Pick<
  Card,
  "id" | "name" | "card_type" | "factions" | "image_path"
>;

export type DeckExportSnapshot = {
  name: string;
  description: string;
  entries: Entry[];
  cards: DeckExportCard[];
};

export function deckExportSnapshot(
  deck: Pick<Deck, "name" | "description" | "entries">,
  cards: DeckExportCard[],
): DeckExportSnapshot {
  const includedCardIds = new Set(deck.entries.map((entry) => entry.card_id));
  return {
    name: deck.name,
    description: deck.description,
    entries: deck.entries.map((entry) => ({ ...entry })),
    cards: cards
      .filter((card) => includedCardIds.has(card.id))
      .map((card) => ({
        id: card.id,
        name: card.name,
        card_type: card.card_type,
        factions: [...card.factions],
        image_path: card.image_path,
      })),
  };
}

export function deckText(deck: Deck, cards: Pick<Card, "id" | "name">[]) {
  const names = new Map(cards.map((card) => [card.id, card.name]));
  const headings = {
    mainframe: "Mainframe",
    cyberdeck: "Cyberdeck",
    ram: "RAM",
    sideboard: "Sideboard",
    sideboard_mainframe: "Sideboard Mainframe",
  };
  return (
    sections
      .map((section) => {
        const quantities = new Map<string, number>();
        for (const entry of deck.entries.filter(
          (entry) => entry.section === section,
        )) {
          const name =
            names.get(entry.card_id) ?? `Unknown card (${entry.card_id})`;
          quantities.set(name, (quantities.get(name) ?? 0) + entry.quantity);
        }
        const lines = [...quantities]
          .sort(([a], [b]) => a.localeCompare(b, "en"))
          .map(([name, quantity]) => `${quantity} ${name}`);
        return [`# ${headings[section]}`, ...lines].join("\n");
      })
      .join("\n\n") + "\n"
  );
}
