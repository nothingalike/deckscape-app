import type { Entry } from "../types";
import { validateDeck } from "../validation";
import { versionDefinition, type EngineManifest } from "./definition-version";
import { createSetup, type SetupDeck } from "./setup";
import type { RandomState } from "./random";

export function createAdmittedSetup(
  users: readonly [string, string],
  entries: readonly [Entry[], Entry[]],
  definitions: ReadonlyMap<string, PinnedDefinition>,
  engine: EngineManifest,
  random: RandomState,
) {
  return createSetup(
    users,
    [
      admitDeck(entries[0], definitions, engine),
      admitDeck(entries[1], definitions, engine),
    ],
    random,
  );
}

export interface PinnedDefinition {
  version: string;
  definition: unknown;
}

/** Validate against pinned characteristics, never a mutable catalog's later values. */
export function admitDeck(
  entries: Entry[],
  definitions: ReadonlyMap<string, PinnedDefinition>,
  engine: EngineManifest,
): SetupDeck {
  const validated = new Map<string, ReturnType<typeof versionDefinition>>();
  for (const entry of entries) {
    if (validated.has(entry.card_id)) continue;
    const pinned = definitions.get(entry.card_id);
    if (!pinned) throw new Error(`Missing definition for ${entry.card_id}`);
    const candidate = versionDefinition(pinned.definition, engine);
    if (
      candidate.definition.cardId !== entry.card_id ||
      candidate.version !== pinned.version
    )
      throw new Error(`Pinned definition mismatch for ${entry.card_id}`);
    validated.set(entry.card_id, candidate);
  }
  const cards = [...validated].map(([id, { definition }]) => {
    const card = definition.characteristics;
    return {
      id,
      name: card.name,
      normalized_name: card.name.normalize("NFKC").trim().toLowerCase(),
      card_type: card.cardType,
      // The deckbuilder treats null as its default four. Here explicit reviewed null is unlimited.
      copies_limit: card.copiesLimit ?? Number.MAX_SAFE_INTEGER,
      is_basic_ram: card.cardType === "ram" && card.isBasicRam,
    };
  });
  const issues = validateDeck(entries, cards);
  if (issues.length)
    throw new Error(issues.map((issue) => issue.message).join("\n"));
  const deck: SetupDeck = { mainframe: "", cyberdeck: [], ramDeck: [] };
  const cyberdeck: string[] = [],
    ramDeck: string[] = [];
  for (const entry of entries) {
    if (
      entry.section === "sideboard" ||
      entry.section === "sideboard_mainframe"
    )
      continue;
    const candidate = validated.get(entry.card_id)!;
    if (candidate.definition.support !== "verified")
      throw new Error(
        `Card is not ready for play: ${candidate.definition.characteristics.name}`,
      );
    if (entry.section === "mainframe") deck.mainframe = candidate.version;
    else
      (entry.section === "ram" ? ramDeck : cyberdeck).push(
        ...Array<string>(entry.quantity).fill(candidate.version),
      );
  }
  return { ...deck, cyberdeck, ramDeck };
}
