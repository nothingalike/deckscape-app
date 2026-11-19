import { z } from "zod";
import type { Card } from "./types";
export const sourceCard = z
  .object({
    id: z.uuid(),
    name: z.string().min(1),
    image_url: z.url().nullable().optional(),
    card_type: z.string().nullable().optional(),
    set_code: z.string().nullable().optional(),
    card_copies_limit: z.number().int().nonnegative().nullable().optional(),
    factions: z.array(z.string()).nullable().optional(),
    ram_cost: z.array(z.string()).nullable().optional(),
  })
  .passthrough();
export type SourceCard = z.infer<typeof sourceCard>;
export const pageSchema = z.object({
  cards: z.array(sourceCard),
  total: z.number().int().positive(),
  has_more: z.boolean(),
  offset: z.number().int().nonnegative(),
});
export async function fetchCatalog(
  fetchPage: (offset: number) => Promise<unknown>,
): Promise<SourceCard[]> {
  const cards: SourceCard[] = [];
  const ids = new Set<string>();
  let total: number | undefined;
  for (let page = 0; page < 1000; page++) {
    const result = pageSchema.parse(await fetchPage(cards.length));
    if (
      result.offset !== cards.length ||
      (total !== undefined && result.total !== total)
    )
      throw new Error("Catalog changed during pagination; retry the import.");
    total = result.total;
    if (!result.cards.length) throw new Error("Unexpected empty catalog page.");
    for (const card of result.cards) {
      if (ids.has(card.id)) throw new Error(`Duplicate source ID: ${card.id}`);
      ids.add(card.id);
      cards.push(card);
    }
    if (!result.has_more) {
      if (cards.length !== total)
        throw new Error("Catalog count does not match completed pages.");
      return cards;
    }
    if (cards.length >= total) throw new Error("Invalid pagination boundary.");
  }
  throw new Error("Catalog exceeded page limit.");
}
export function normalizeCard(raw: SourceCard, basicRamId: string): Card {
  const str = (key: string) =>
    typeof raw[key] === "string" ? (raw[key] as string) : "";
  const basic = raw.id === basicRamId;
  // Explicit correction: Comprehensive Rules v1.0 §100.2a.2 and §100.4.
  // The upstream Basic Ram record has an empty type and incorrectly sets a four-copy limit.
  const sanitizedRaw = {
    ...raw,
    image_url: raw.image_url
      ? new URL(raw.image_url).origin + new URL(raw.image_url).pathname
      : null,
  };
  return {
    id: raw.id,
    name: raw.name,
    normalized_name: raw.name.normalize("NFKC").trim().toLowerCase(),
    card_type: basic ? "ram" : str("card_type").toLowerCase(),
    subtype: [str("subtype"), str("program_class"), str("cyberware_class")]
      .filter(Boolean)
      .join(" / "),
    set_code: str("set_code") || "UNASSIGNED",
    set_name: str("set_name") || "Unassigned",
    collector_number: str("collector_number"),
    rules_text: str("rules_text"),
    flavor_text: str("flavor_text"),
    artist: str("artist"),
    rarity: str("rarity"),
    factions: (raw.factions ?? []).filter((f) => f && f !== "NULL"),
    ram_cost: raw.ram_cost ?? [],
    attack: typeof raw.attack === "number" ? raw.attack : null,
    defence: typeof raw.defence === "number" ? raw.defence : null,
    image_path: null,
    image_hash: null,
    is_landscape: raw.is_landscape === true,
    is_basic_ram: basic,
    copies_limit: basic ? null : (raw.card_copies_limit ?? 4),
    raw: sanitizedRaw,
  };
}
export function importDiff(incoming: Card[], previous: Card[]) {
  const old = new Map(previous.map((c) => [c.id, c]));
  const ids = new Set(incoming.map((c) => c.id));
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, canonical(v)]),
          )
        : value;
  const comparable = (c: Card) =>
    JSON.stringify(
      canonical(
        Object.fromEntries(
          Object.entries(c).filter(([k]) => k !== "updated_at"),
        ),
      ),
    );
  return {
    total: incoming.length,
    added: incoming.filter((c) => !old.has(c.id)).length,
    changed: incoming.filter(
      (c) => old.has(c.id) && comparable(c) !== comparable(old.get(c.id)!),
    ).length,
    missing: previous
      .filter((c) => !ids.has(c.id))
      .map((c) => ({ id: c.id, name: c.name })),
  };
}
