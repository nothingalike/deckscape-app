import { type Entry, type Section } from "./types";
import { validateDeck } from "./validation";
export type ImportCard = Parameters<typeof validateDeck>[1][number];
export const MAX_DECK_TEXT = 50000;
const headings: Record<string, Section> = {
  mainframe: "mainframe",
  cyberdeck: "cyberdeck",
  ram: "ram",
  "ram deck": "ram",
  sideboard: "sideboard",
  "sideboard mainframe": "sideboard_mainframe",
};
const normalize = (name: string) =>
  name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
export function parseDeckText(
  text: string,
  cards: ImportCard[],
  addBasicRam = true,
) {
  if (text.length > MAX_DECK_TEXT)
    throw new Error("Deck lists must be 50,000 characters or fewer.");
  const byName = new Map<string, ImportCard[]>();
  for (const card of cards) {
    const key = normalize(card.name);
    byName.set(key, [...(byName.get(key) ?? []), card]);
  }
  let section: Section | null = null;
  const seenSections = new Set<Section>(),
    entries: Entry[] = [],
    errors: string[] = [];
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line) continue;
    const heading = /^#{1,6}\s+(.+?)\s*#*$/u.exec(line);
    if (heading) {
      const key = normalize(heading[1]);
      section = Object.hasOwn(headings, key) ? headings[key] : null;
      if (!section)
        errors.push(
          "Line " + (index + 1) + ': unknown section "' + heading[1] + '".',
        );
      else seenSections.add(section);
      continue;
    }
    if (!section) {
      errors.push(
        "Line " + (index + 1) + ": add a section heading before this card.",
      );
      continue;
    }
    const quantified = /^(\d+)\s+(.+)$/u.exec(line);
    const isMainframe =
      section === "mainframe" || section === "sideboard_mainframe";
    if (!quantified && !isMainframe) {
      errors.push(
        "Line " + (index + 1) + ": use a quantity followed by a card name.",
      );
      continue;
    }
    const quantity = quantified ? Number(quantified[1]) : 1,
      name = quantified ? quantified[2] : line;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999) {
      errors.push(
        "Line " + (index + 1) + ": quantity must be between 1 and 999.",
      );
      continue;
    }
    const matches = byName.get(normalize(name)) ?? [];
    if (matches.length !== 1) {
      errors.push(
        "Line " +
          (index + 1) +
          ": " +
          (matches.length ? "ambiguous" : "unknown") +
          ' card "' +
          name +
          '".',
      );
      continue;
    }
    const existing = entries.find(
      (e) => e.section === section && e.card_id === matches[0].id,
    );
    if (existing) {
      existing.quantity += quantity;
      if (existing.quantity > 999)
        errors.push("Line " + (index + 1) + ": combined quantity exceeds 999.");
    } else entries.push({ section, card_id: matches[0].id, quantity });
  }
  if (errors.length)
    throw new Error(
      errors.slice(0, 12).join("\n") +
        (errors.length > 12 ? "\nMore errors remain." : ""),
    );
  if (!entries.length)
    throw new Error("Paste a deck list with section headings and card names.");
  if (entries.length > 1000)
    throw new Error("Deck lists can contain at most 1,000 distinct entries.");
  let addedBasicRam = false;
  if (addBasicRam && !seenSections.has("ram")) {
    const basic = cards.filter((c) => c.is_basic_ram && c.card_type === "ram");
    if (basic.length !== 1)
      throw new Error(
        "Basic RAM could not be identified uniquely. Add an explicit RAM section.",
      );
    entries.push({ section: "ram", card_id: basic[0].id, quantity: 25 });
    addedBasicRam = true;
  }
  return { entries, addedBasicRam, issues: validateDeck(entries, cards) };
}
