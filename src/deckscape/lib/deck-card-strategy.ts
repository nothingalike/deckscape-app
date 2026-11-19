import { deckCopyLimit } from "./card-limits";
import type { Card, Entry, Section } from "./types";

type DeckCard = Pick<Card, "card_type" | "copies_limit"> &
  Partial<Pick<Card, "normalized_name">>;
type Strategy = {
  destination: (sideboard: boolean) => Section | null;
  canIncrement: (quantity: number) => boolean;
  requiresReplacement: (
    entries: Entry[],
    cardId: string,
    section: Section,
  ) => boolean;
  change: (
    entries: Entry[],
    cardId: string,
    section: Section,
    delta: number,
  ) => Entry[];
};

function changeQuantity(
  entries: Entry[],
  cardId: string,
  section: Section,
  delta: number,
): Entry[] {
  const next = [...entries];
  const index = next.findIndex(
    (entry) => entry.card_id === cardId && entry.section === section,
  );
  if (index < 0 && delta > 0)
    next.push({ card_id: cardId, section, quantity: 1 });
  else if (index >= 0) {
    const quantity = next[index].quantity + delta;
    if (quantity <= 0) next.splice(index, 1);
    else next[index] = { ...next[index], quantity: Math.min(quantity, 999) };
  }
  return next;
}

const generalStrategy: Strategy = {
  destination: (sideboard) => (sideboard ? "sideboard" : "cyberdeck"),
  canIncrement: () => true,
  requiresReplacement: () => false,
  change: changeQuantity,
};

const ramStrategy: Strategy = {
  ...generalStrategy,
  destination: (sideboard) => (sideboard ? null : "ram"),
};

const mainframeStrategy: Strategy = {
  destination: (sideboard) => (sideboard ? "sideboard_mainframe" : "mainframe"),
  canIncrement: (quantity) => quantity === 0,
  requiresReplacement: (entries, cardId, section) =>
    entries.some(
      (entry) => entry.section === section && entry.card_id !== cardId,
    ),
  // Callers must obtain confirmation before replacing a different mainframe.
  change: (entries, cardId, section, delta) =>
    delta > 0
      ? [
          ...entries.filter((entry) => entry.section !== section),
          { card_id: cardId, section, quantity: 1 },
        ]
      : changeQuantity(entries, cardId, section, delta),
};

export function getDeckCardStrategy(card: DeckCard): Strategy | null {
  if (deckCopyLimit(card) === 0) return null;
  switch (card.card_type) {
    case "mainframe":
      return mainframeStrategy;
    case "ram":
      return ramStrategy;
    case "character":
    case "program":
    case "gear":
      return generalStrategy;
    default:
      return null;
  }
}

export function getDeckCardAction(
  card: DeckCard & Pick<Card, "id">,
  entries: Entry[],
  sideboard = false,
) {
  const strategy = getDeckCardStrategy(card);
  const section = strategy?.destination(sideboard);
  if (!strategy || !section) return null;
  const quantity =
    entries.find(
      (entry) => entry.card_id === card.id && entry.section === section,
    )?.quantity ?? 0;
  return {
    section,
    quantity,
    canAdd: strategy.canIncrement(quantity),
    requiresReplacement: strategy.requiresReplacement(
      entries,
      card.id,
      section,
    ),
  };
}

export function changeDeckCardEntries(
  entries: Entry[],
  card: DeckCard & Pick<Card, "id">,
  section: Section,
  delta: number,
) {
  const strategy = getDeckCardStrategy(card);
  // Existing invalid drafts must still allow removing ineligible cards.
  if (delta < 0) return changeQuantity(entries, card.id, section, delta);
  if (
    !strategy ||
    ![strategy.destination(false), strategy.destination(true)].includes(section)
  )
    return entries;
  return strategy.change(entries, card.id, section, delta);
}
