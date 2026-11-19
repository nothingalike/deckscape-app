import { z } from "zod";

/** Stored strategy, never executable code or a live model response. */
export const botPlaybookSchema = z
  .object({
    version: z.literal(1),
    deck: z.string().min(1),
    provenance: z
      .object({ method: z.literal("ai-analysis"), source: z.string().min(1) })
      .strict(),
    reserveRam: z.number().int().min(0).max(10),
    aggression: z.number().min(0).max(1),
    priorities: z
      .array(
        z
          .object({
            card: z.string().min(1),
            action: z.enum(["play", "activate"]),
            ability: z.string().optional(),
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
            requires: z.array(z.string()).default([]),
            damage: z
              .object({
                channel: z.enum(["MF", "BF"]),
                amount: z.number().int().positive(),
              })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .max(256),
  })
  .strict();
export type BotPlaybook = z.infer<typeof botPlaybookSchema>;

export function readBotPlaybook(input: unknown, deck: string): BotPlaybook {
  const parsed = botPlaybookSchema.safeParse(input);
  if (parsed.success && parsed.data.deck === deck) return parsed.data;
  return {
    version: 1,
    deck,
    provenance: {
      method: "ai-analysis",
      source: "General fallback; deck analysis unavailable",
    },
    reserveRam: 0,
    aggression: 0.6,
    priorities: [],
  };
}
