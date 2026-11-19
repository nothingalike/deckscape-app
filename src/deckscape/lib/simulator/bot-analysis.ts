import { createHash } from "node:crypto";
import { z } from "zod";
import { sections, type Entry } from "../types";
import { admitDeck } from "./deck-admission";
import { versionDefinition } from "./definition-version";
import type { RuntimeAdmission } from "./runtime-registry";
import { botPlaybookSchema, type BotPlaybook } from "./bot-playbook";

export const BOT_ANALYSIS_VERSION = "codex-deck-analysis-v1";
const entrySchema = z
  .object({
    card_id: z.uuid(),
    section: z.enum(sections),
    quantity: z.number().int().min(1).max(999),
  })
  .strict();
export const analysisPublicationSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  entries: z.array(entrySchema).min(1),
});
export type AnalysisPublication = z.infer<typeof analysisPublicationSchema>;

/** Ordering, split quantities and presentation metadata do not identify strategy. */
export function normalizeBotDeckEntries(entries: Entry[]): Entry[] {
  const merged = new Map<string, Entry>();
  for (const raw of entries) {
    const entry = entrySchema.parse(raw);
    entry.card_id = entry.card_id.toLowerCase();
    const key = `${entry.section}:${entry.card_id}`;
    const previous = merged.get(key);
    merged.set(
      key,
      entrySchema.parse({
        ...entry,
        quantity: entry.quantity + (previous?.quantity ?? 0),
      }),
    );
  }
  return [...merged.values()].sort((a, b) => {
    const left = `${a.section}:${a.card_id}`,
      right = `${b.section}:${b.card_id}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
}
export function botAnalysisHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function prepareBotAnalysisInput(
  raw: unknown,
  release: RuntimeAdmission,
) {
  const publication = analysisPublicationSchema.parse(raw);
  const entries = normalizeBotDeckEntries(publication.entries);
  // Match admission supplies legality and reviewed support; analysis never invents it.
  const setupDeck = admitDeck(entries, release.definitions, release.engine);
  const cards = entries
    .filter((entry) => !entry.section.startsWith("sideboard"))
    .map((entry) => {
      const pin = release.definitions.get(entry.card_id)!;
      const { definition } = versionDefinition(pin.definition, release.engine);
      return {
        ...entry,
        definitionVersion: pin.version,
        characteristics: definition.characteristics,
        handlers: definition.handlers,
      };
    });
  const sourceHash = botAnalysisHash({
    entries,
    engineVersion: release.engine.version,
    rulesVersion: release.rulesVersion,
    cards,
  });
  return {
    deckId: publication.id,
    deckName: publication.name,
    entries,
    cards,
    setupDeck,
    engineVersion: release.engine.version,
    rulesVersion: release.rulesVersion,
    sourceHash,
    inputHash: botAnalysisHash({
      sourceHash,
      analysisVersion: BOT_ANALYSIS_VERSION,
    }),
    analysisVersion: BOT_ANALYSIS_VERSION,
  };
}
export type BotAnalysisInput = ReturnType<typeof prepareBotAnalysisInput>;

/** IDs are compiled to the existing runtime vocabulary after reference validation. */
export const codexStrategySchema = z
  .object({
    reserveRam: z.number().int().min(0).max(10),
    aggression: z.number().min(0).max(1),
    priorities: z
      .array(
        z
          .object({
            cardId: z.uuid(),
            action: z.enum(["play", "activate"]),
            ability: z.string().min(1).nullable(),
            weight: z.number().min(-100).max(100),
            target: z.enum(["enemy", "friendly", "weak-friendly", "any"]),
            when: z.enum([
              "always",
              "own-turn",
              "opponent-cache",
              "enemy-board",
              "friendly-board",
              "low-health",
            ]),
            requiresCardIds: z.array(z.uuid()).max(20),
          })
          .strict(),
      )
      .max(256),
  })
  .strict();

export function compileCodexPlaybook(
  raw: unknown,
  input: BotAnalysisInput,
  provenance: string,
): BotPlaybook {
  const strategy = codexStrategySchema.parse(raw);
  const cards = new Map(
    input.cards.map((card) => [card.card_id, card.characteristics]),
  );
  const name = (id: string) => {
    const card = cards.get(id.toLowerCase());
    if (!card)
      throw new Error(
        `Strategy references a card outside the playable deck: ${id}`,
      );
    return card.name.toUpperCase();
  };
  const priorities = strategy.priorities.map((priority) => {
    const cardName = name(priority.cardId);
    const card = cards.get(priority.cardId.toLowerCase())!;
    if (priority.action === "activate") {
      if (
        !priority.ability ||
        !("activatedAbilities" in card) ||
        !card.activatedAbilities.some(
          (ability) =>
            ability.name.toUpperCase() === priority.ability!.toUpperCase(),
        )
      ) {
        throw new Error(
          `Strategy references an unavailable activation on ${cardName}`,
        );
      }
    } else if (priority.ability !== null) {
      throw new Error("Play priorities cannot name an activation");
    }
    return {
      card: cardName,
      action: priority.action,
      ...(priority.ability ? { ability: priority.ability } : {}),
      weight: priority.weight,
      target: priority.target,
      when: priority.when,
      requires: priority.requiresCardIds.map(name),
    };
  });
  return botPlaybookSchema.parse({
    version: 1,
    deck: input.deckId,
    provenance: { method: "ai-analysis", source: provenance },
    reserveRam: strategy.reserveRam,
    aggression: strategy.aggression,
    priorities,
  });
}

export const playbookCandidateSchema = z
  .object({
    id: z.uuid(),
    deckId: z.uuid(),
    deckName: z.string().min(1),
    sourceEntries: z.array(entrySchema),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    bookHash: z.string().regex(/^[a-f0-9]{64}$/),
    engineVersion: z.string(),
    rulesVersion: z.string(),
    analysisVersion: z.literal(BOT_ANALYSIS_VERSION),
    playbook: botPlaybookSchema,
    smoke: z
      .object({
        commands: z.number().int().positive(),
        revisions: z.number().int().positive(),
        completed: z.boolean(),
      })
      .strict(),
    generatedAt: z.iso.datetime(),
    modelRequested: z.string(),
  })
  .strict();
export type PlaybookCandidate = z.infer<typeof playbookCandidateSchema>;
export const playbookBatchSchema = z
  .object({
    version: z.literal(1),
    target: z.url(),
    generatedAt: z.iso.datetime(),
    candidates: z.array(playbookCandidateSchema).max(5),
    failures: z.array(
      z.object({ deckId: z.uuid(), message: z.string() }).strict(),
    ),
  })
  .strict();

export function validatePlaybookCandidate(
  raw: unknown,
  input: BotAnalysisInput,
) {
  const candidate = playbookCandidateSchema.parse(raw);
  if (
    candidate.deckId !== input.deckId ||
    candidate.inputHash !== input.inputHash ||
    candidate.sourceHash !== input.sourceHash ||
    candidate.engineVersion !== input.engineVersion ||
    candidate.rulesVersion !== input.rulesVersion ||
    candidate.bookHash !== botAnalysisHash(candidate.playbook) ||
    JSON.stringify(candidate.sourceEntries) !== JSON.stringify(input.entries) ||
    candidate.playbook.deck !== input.deckId
  ) {
    throw new Error(
      "Candidate no longer matches its source deck, runtime or strategy contents",
    );
  }
  // Recompile all references even for an edited/imported artifact.
  compileCodexPlaybook(
    {
      reserveRam: candidate.playbook.reserveRam,
      aggression: candidate.playbook.aggression,
      priorities: candidate.playbook.priorities.map((priority) => {
        const find = (name: string) => {
          const card = input.cards.find(
            (card) =>
              card.characteristics.name.toUpperCase() === name.toUpperCase(),
          );
          if (!card) throw new Error(`Strategy card is absent: ${name}`);
          return card.card_id;
        };
        if (priority.damage)
          throw new Error(
            "Operator analysis v1 does not accept inferred damage annotations",
          );
        return {
          cardId: find(priority.card),
          action: priority.action,
          ability: priority.ability ?? null,
          weight: priority.weight,
          target: priority.target,
          when: priority.when,
          requiresCardIds: priority.requires.map(find),
        };
      }),
    },
    input,
    candidate.playbook.provenance.source,
  );
  return candidate;
}
