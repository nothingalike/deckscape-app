import { deckCopyLimit, isNanobotSwarm } from "./card-limits";
import { Card, Entry, Issue, sections } from "./types";

export function validateDeck(
  entries: Entry[],
  cards: Pick<
    Card,
    | "id"
    | "name"
    | "normalized_name"
    | "card_type"
    | "copies_limit"
    | "is_basic_ram"
  >[],
): Issue[] {
  const issues: Issue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });
  const catalog = new Map(cards.map((c) => [c.id, c]));
  const counts = Object.fromEntries(sections.map((s) => [s, 0]));
  const copies = new Map<
    string,
    { count: number; limit: number; name: string }
  >();
  const seen = new Set<string>();
  for (const entry of entries) {
    if (
      !sections.includes(entry.section) ||
      !Number.isInteger(entry.quantity) ||
      entry.quantity < 1 ||
      entry.quantity > 999
    ) {
      add(
        "entry",
        "Card quantities must be whole numbers between 1 and 999 in a valid section.",
      );
      continue;
    }
    const key = `${entry.section}:${entry.card_id}`;
    if (seen.has(key))
      add("duplicate", "Combine duplicate card rows in each section.");
    seen.add(key);
    counts[entry.section] += entry.quantity;
    const card = catalog.get(entry.card_id);
    if (!card) {
      add("unknown", "A card is no longer available in the catalog.");
      continue;
    }
    const type = card.card_type;
    const allowed =
      entry.section === "ram"
        ? type === "ram"
        : entry.section.includes("mainframe")
          ? type === "mainframe"
          : ["character", "program", "gear"].includes(type);
    if (!allowed)
      add(
        "section",
        `${card.name} cannot go in ${entry.section.replaceAll("_", " ")}.`,
      );
    if (
      !card.is_basic_ram &&
      !entry.section.includes("mainframe") &&
      !(entry.section === "cyberdeck" && isNanobotSwarm(card))
    ) {
      const current = copies.get(card.normalized_name) ?? {
        count: 0,
        limit: deckCopyLimit(card),
        name: card.name,
      };
      current.count += entry.quantity;
      current.limit = Math.min(current.limit, deckCopyLimit(card));
      copies.set(card.normalized_name, current);
    }
  }
  if (counts.mainframe !== 1) add("mainframe", "Choose exactly one mainframe.");
  if (counts.cyberdeck < 50 || counts.cyberdeck > 255)
    add(
      "cyberdeck",
      `Cyberdeck needs 50–255 cards (currently ${counts.cyberdeck}).`,
    );
  if (counts.ram !== 25)
    add("ram", `RAM deck needs exactly 25 cards (currently ${counts.ram}).`);
  if (counts.sideboard > 12)
    add("sideboard", "Sideboard can contain at most 12 cards.");
  if (counts.sideboard_mainframe > 1)
    add("sideboard_mainframe", "Choose at most one sideboard mainframe.");
  for (const { count, limit, name } of copies.values())
    if (count > limit)
      add(
        "copies",
        `${name}: ${count} copies across deck sections; maximum ${limit}.`,
      );
  return issues;
}
