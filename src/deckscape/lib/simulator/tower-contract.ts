import { z } from "zod";
import { cardInspectionSchema } from "./card-inspection";
const id = z.string().min(1),
  seat = z.union([z.literal(0), z.literal(1)]);
export const towerDecisionSchema = z
  .object({
    type: z.literal("tower"),
    id,
    sourceId: id,
    actionId: id,
    player: seat,
    controller: seat,
    opponent: seat,
    inspected: z.array(id).min(2).max(4),
    piles: z.tuple([z.array(id).min(1), z.array(id).min(1)]).nullable(),
  })
  .strict();
export type TowerDecision = z.infer<typeof towerDecisionSchema>;
export const towerAnswerSchema = z
  .object({
    type: z.literal("answer-tower"),
    decisionId: id,
    firstPile: z.array(id).optional(),
    pile: z.union([z.literal(0), z.literal(1)]).optional(),
  })
  .strict();
export const towerPromptSchema = z.discriminatedUnion("stage", [
  z
    .object({
      type: z.literal("tower"),
      decisionId: id,
      revision: z.number().int().nonnegative(),
      stage: z.literal("partition"),
      cards: z
        .array(cardInspectionSchema.extend({ id }).strict())
        .min(2)
        .max(4),
    })
    .strict(),
  z
    .object({
      type: z.literal("tower"),
      decisionId: id,
      revision: z.number().int().nonnegative(),
      stage: z.literal("choose"),
      counts: z.tuple([
        z.number().int().min(1).max(3),
        z.number().int().min(1).max(3),
      ]),
    })
    .strict(),
]);
export type TowerPrompt = z.infer<typeof towerPromptSchema>;
