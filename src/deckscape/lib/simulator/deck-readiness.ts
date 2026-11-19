import type { Card, Entry } from "../types";
import { validateDeck } from "../validation";
import { admitDeck, type PinnedDefinition } from "./deck-admission";
import { versionDefinition, type EngineManifest } from "./definition-version";

export type DeckReadiness = { ready: boolean; issues: string[] };

/** Explanatory preview only. Room selection still performs authoritative admission. */
export function assessDeckReadiness(
  entries: Entry[],
  catalog: Pick<
    Card,
    | "id"
    | "name"
    | "normalized_name"
    | "card_type"
    | "copies_limit"
    | "is_basic_ram"
  >[],
  release: {
    definitions: ReadonlyMap<string, PinnedDefinition>;
    engine: EngineManifest;
    rulesVersion: string;
  } | null,
): DeckReadiness {
  if (!release)
    return { ready: false, issues: ["Simulator readiness is unavailable."] };
  const cards = new Map(catalog.map((card) => [card.id, card]));
  const issues: string[] = [];
  for (const id of new Set(entries.map((entry) => entry.card_id))) {
    const pin = release.definitions.get(id);
    if (!pin) {
      issues.push(
        `${cards.get(id)?.name ?? id}: not supported by this simulator release.`,
      );
      continue;
    }
    try {
      const candidate = versionDefinition(pin.definition, release.engine);
      if (
        candidate.version !== pin.version ||
        candidate.definition.cardId !== id ||
        candidate.definition.rulesVersion !== release.rulesVersion
      )
        throw Error("Invalid pin");
      const card = candidate.definition.characteristics;
      cards.set(id, {
        id,
        name: card.name,
        normalized_name: card.name.normalize("NFKC").trim().toLowerCase(),
        card_type: card.cardType,
        copies_limit: card.copiesLimit ?? Number.MAX_SAFE_INTEGER,
        is_basic_ram: card.cardType === "ram" && card.isBasicRam,
      });
      if (
        candidate.definition.support !== "verified" &&
        entries.some(
          (entry) =>
            entry.card_id === id && !entry.section.startsWith("sideboard"),
        )
      )
        issues.push(`${card.name}: not yet ready for simulator play.`);
    } catch {
      issues.push(
        `${cards.get(id)?.name ?? id}: simulator definition is unavailable.`,
      );
    }
  }
  issues.push(
    ...validateDeck(entries, [...cards.values()]).map((issue) => issue.message),
  );
  if (!issues.length) {
    try {
      admitDeck(entries, release.definitions, release.engine);
    } catch {
      issues.push(
        "This deck could not be admitted by the simulator. Refresh and try again.",
      );
    }
  }
  return { ready: issues.length === 0, issues: [...new Set(issues)] };
}
