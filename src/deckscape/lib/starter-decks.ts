import { z } from "zod";
import type { Card, Entry } from "./types";
import { validateDeck } from "./validation";

const namedCard = z.object({
  name: z.string().min(1),
  quantity: z.number().int().positive(),
});
export const starterManifest = z.object({
  edition: z.string(),
  decks: z
    .array(
      z.object({
        key: z
          .string()
          .regex(/^genesis-starter-(corpo|dustrunner|cybernetic|hacker)$/),
        name: z.string().min(1),
        mainframe: z.string().min(1),
        set_code: z.string().min(1),
        cyberdeck: z.array(namedCard).min(1),
        ram: namedCard,
      }),
    )
    .length(4),
});
export type StarterPayload = {
  key: string;
  name: string;
  description: string;
  entries: Entry[];
};
export function resolveStarters(
  input: unknown,
  cards: Card[],
): StarterPayload[] {
  const manifest = starterManifest.parse(input);
  if (new Set(manifest.decks.map((d) => d.key)).size !== 4)
    throw new Error("Starter keys must be unique.");
  const normalize = (s: string) => s.normalize("NFKC").trim().toLowerCase();
  return manifest.decks.map((deck) => {
    const resolve = (name: string) => {
      const matches = cards.filter(
        (c) =>
          normalize(c.name) === normalize(name) && c.set_code === deck.set_code,
      );
      if (matches.length !== 1)
        throw new Error(
          `${deck.name}: ${name} has ${matches.length} matches in ${deck.set_code}; import cards or resolve the manifest explicitly.`,
        );
      return matches[0];
    };
    const entries: Entry[] = [
      {
        card_id: resolve(deck.mainframe).id,
        section: "mainframe" as const,
        quantity: 1,
      },
      ...deck.cyberdeck.map((c) => ({
        card_id: resolve(c.name).id,
        section: "cyberdeck" as const,
        quantity: c.quantity,
      })),
      {
        card_id: resolve(deck.ram.name).id,
        section: "ram" as const,
        quantity: deck.ram.quantity,
      },
    ].sort(
      (a, b) =>
        a.section.localeCompare(b.section) ||
        a.card_id.localeCompare(b.card_id),
    );
    if (
      deck.cyberdeck.reduce((sum, c) => sum + c.quantity, 0) !== 50 ||
      deck.ram.quantity !== 25
    )
      throw new Error(`${deck.name}: expected 50 cyberdeck cards and 25 RAM.`);
    const issues = validateDeck(entries, cards);
    if (issues.length)
      throw new Error(
        `${deck.name}: ${issues.map((i) => i.message).join(" ")}`,
      );
    return {
      key: deck.key,
      name: deck.name,
      entries,
      description: `${manifest.edition}: ${deck.name}. 1 ${deck.mainframe}, 50 cyberdeck cards, and 25 Basic RAM.`,
    };
  });
}
