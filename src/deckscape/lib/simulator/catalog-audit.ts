import { normalizeCard, sourceCard, type SourceCard } from "../catalog-import";

export const BASIC_RAM_ID = "61045c1b-73b0-46f2-8cc0-4c379c5d31e4";
export const CATALOG_ENDPOINT =
  "https://api.v2.cloudflare.prod.carde.io/hydraproxy/api/v2/deckbuilder/cards/search-with-filters/";
export const RULES_SOURCE =
  "https://static1.squarespace.com/static/64fa4af199cc011608a2aa30/t/6a684d9b0d37176601065dc8/1785220507233/Neuroscape+Comprehensive+Rules+v1.00.pdf";

export type StarterInventory = {
  decks: {
    key: string;
    mainframe: string;
    ram: { name: string; quantity: number };
    cyberdeck: { name: string; quantity: number }[];
  }[];
};
export type ImplementationGroup =
  "starter" | "characters-mainframes-ram" | "programs" | "gear";
export type AuditIssue = {
  code: string;
  detail: string;
};
const nameKey = (s: string) => s.normalize("NFKC").trim().toLowerCase();
const stringField = (c: SourceCard, key: string) =>
  typeof c[key] === "string" ? (c[key] as string) : "";

/** Inventory descriptive evidence. Nothing here makes an ability executable or verified. */
export function auditCatalog(input: unknown, starters: StarterInventory) {
  const source = sourceCard.array().parse(input);
  if (!source.length)
    throw new Error("The simulator inventory cannot be empty.");
  if (new Set(source.map((c) => c.id)).size !== source.length)
    throw new Error("Duplicate source IDs in simulator inventory.");
  const basic = source.find((c) => c.id === BASIC_RAM_ID);
  if (!basic || nameKey(basic.name) !== "basic ram")
    throw new Error(
      "The verified Basic RAM correction no longer matches the source.",
    );

  const starterNames = new Map<string, string[]>();
  for (const deck of starters.decks) {
    for (const name of [
      deck.mainframe,
      deck.ram.name,
      ...deck.cyberdeck.map((c) => c.name),
    ]) {
      const key = nameKey(name);
      const memberships = starterNames.get(key) ?? [];
      if (!memberships.includes(deck.key)) memberships.push(deck.key);
      starterNames.set(key, memberships);
    }
  }
  const availableNames = new Set(source.map((c) => nameKey(c.name)));
  for (const name of starterNames.keys())
    if (!availableNames.has(name))
      throw new Error(`Starter card missing from source: ${name}`);

  const cards = source
    .map((raw) => {
      const card = normalizeCard(raw, BASIC_RAM_ID);
      if (
        !["ram", "character", "mainframe", "program", "gear"].includes(
          card.card_type,
        )
      )
        throw new Error(
          `Unrecognized card type for ${card.name}: ${card.card_type}`,
        );
      const starterDecks = starterNames.get(card.normalized_name) ?? [];
      const group: ImplementationGroup = starterDecks.length
        ? "starter"
        : card.card_type === "program"
          ? "programs"
          : card.card_type === "gear"
            ? "gear"
            : "characters-mainframes-ram";
      const issues: AuditIssue[] = [];
      if (!card.is_basic_ram)
        issues.push({
          code: "ARTWORK_REVIEW_REQUIRED",
          detail:
            "Verify printed symbols, ability bars, costs, and complete text against artwork before enabling simulation.",
        });
      if (["character", "gear"].includes(card.card_type))
        issues.push({
          code: "PORTS_NOT_STRUCTURED",
          detail:
            "The public feed does not provide a structured per-region gear-port definition.",
        });
      if (card.card_type === "mainframe")
        issues.push({
          code: "MAINFRAME_BARS_NOT_STRUCTURED",
          detail:
            "Verify the ability kind, scope, costs, faction requirements, and synergy thresholds from the printed card.",
        });
      if (!card.rules_text && !card.is_basic_ram)
        issues.push({
          code: "EMPTY_TEXT_REQUIRES_REVIEW",
          detail:
            "Empty source text is not evidence that the printed card has no abilities or keywords.",
        });
      if (
        card.card_type === "character" &&
        !["BIOFRAME", "MAINFRAME"].includes(stringField(raw, "attack_type"))
      )
        issues.push({
          code: "ATTACK_TYPE_MISSING",
          detail: "Resolve the printed damage type.",
        });
      // These are source excerpts for investigation, not invented token definitions.
      const generatedObjectMentions = card.rules_text
        .split(/\n|(?<=[.!?])\s+/)
        .filter((s) => /\btoken\b/i.test(s));
      let artworkSource: string | null = null;
      if (raw.image_url) {
        const url = new URL(raw.image_url);
        artworkSource = `${url.origin}${url.pathname}`;
      }
      return {
        id: card.id,
        name: card.name,
        normalizedName: card.normalized_name,
        setCode: card.set_code,
        collectorNumber: card.collector_number,
        type: card.card_type,
        subtype: card.subtype,
        factions: card.factions,
        ramCost: card.ram_cost,
        attack: card.attack,
        attackType: stringField(raw, "attack_type"),
        defence: card.defence,
        rulesText: card.rules_text,
        copiesLimit: card.copies_limit,
        iconic: raw.iconic === true,
        artworkSource,
        group,
        starterDecks,
        generatedObjectMentions,
        issues,
        // A full text import does not constitute tested executable behavior.
        simulatorStatus: "unimplemented" as const,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    schemaVersion: 1,
    rules: { version: "1.0", source: RULES_SOURCE },
    source: { endpoint: CATALOG_ENDPOINT, gameId: 134 },
    counts: {
      sourceCards: cards.length,
      distinctNames: new Set(cards.map((c) => c.normalizedName)).size,
      types: Object.fromEntries(
        ["ram", "character", "mainframe", "program", "gear"].map((t) => [
          t,
          cards.filter((c) => c.type === t).length,
        ]),
      ),
      groups: Object.fromEntries(
        ["starter", "characters-mainframes-ram", "programs", "gear"].map(
          (g) => [g, cards.filter((c) => c.group === g).length],
        ),
      ),
      needsArtworkReview: cards.filter((c) =>
        c.issues.some((i) => i.code === "ARTWORK_REVIEW_REQUIRED"),
      ).length,
      generatedObjectSourceCards: cards.filter(
        (c) => c.generatedObjectMentions.length,
      ).length,
    },
    cards,
  };
}
