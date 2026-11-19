import { z } from "zod";
import { cardInspectionSchema } from "./card-inspection";
const id = z.string().min(1),
  seat = z.union([z.literal(0), z.literal(1)]);
export const enhanceDecisionSchema = z
  .object({
    type: z.literal("deck-order"),
    id,
    sourceId: id,
    actionId: id,
    player: seat,
    targetPlayer: seat,
    inspected: z.array(id).min(1).max(5),
  })
  .strict();
export type EnhanceDecision = z.infer<typeof enhanceDecisionSchema>;
export const enhanceAnswerSchema = z
  .object({
    type: z.literal("answer-deck-order"),
    decisionId: id,
    order: z.array(id).min(1).max(5),
  })
  .strict();
export const enhancePromptSchema = z
  .object({
    type: z.literal("deck-order"),
    decisionId: id,
    revision: z.number().int().nonnegative(),
    targetPlayer: seat,
    cards: z.array(cardInspectionSchema.extend({ id }).strict()).min(1).max(5),
  })
  .strict();
export type EnhancePrompt = z.infer<typeof enhancePromptSchema>;
