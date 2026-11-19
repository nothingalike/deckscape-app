import { z } from "zod";
import { sections } from "./types";
export const MAX_BACKUP_BYTES = 1_000_000;
const backup = z.object({
  format: z.literal("deckscape-backup"),
  version: z.literal(1),
  deck: z.object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(10000),
    entries: z
      .array(
        z.object({
          card_id: z.uuid(),
          section: z.enum(sections),
          quantity: z.number().int().min(1).max(999),
        }),
      )
      .max(1000),
  }),
});
export function parseDeckBackup(text: string) {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES)
    throw new Error("Backup files must be 1 MB or smaller.");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(
      "This file is not valid JSON. Choose a Deckscape draft backup.",
    );
  }
  const result = backup.safeParse(value);
  if (!result.success)
    throw new Error(
      "This is not a supported Deckscape draft backup, or its deck data is invalid.",
    );
  const entries = result.data.deck.entries;
  const keys = new Set(entries.map((e) => e.section + ":" + e.card_id));
  if (keys.size !== entries.length)
    throw new Error(
      "This backup contains duplicate card entries in the same section.",
    );
  return result.data.deck;
}
