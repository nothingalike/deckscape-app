import { z } from "zod";
import { cardInspectionSchema } from "./card-inspection";
const id = z.string().min(1);
export const eclipseDecisionSchema = z
  .object({
    type: z.literal("eclipse-entry"),
    id,
    sourceId: id,
    actionId: id,
    player: z.union([z.literal(0), z.literal(1)]),
    inspected: z.array(id).min(1),
    incarnations: z.record(id, z.number().int().nonnegative()),
  })
  .strict();
export type EclipseDecision = z.infer<typeof eclipseDecisionSchema>;
export const eclipseAnswerSchema = z
  .object({
    type: z.literal("answer-eclipse-entry"),
    decisionId: id,
    selected: id,
  })
  .strict();
export const eclipsePromptSchema = z
  .object({
    type: z.literal("eclipse-entry"),
    decisionId: id,
    revision: z.number().int().nonnegative(),
    cards: z.array(cardInspectionSchema.extend({ id }).strict()).min(1),
  })
  .strict();
export type EclipsePrompt = z.infer<typeof eclipsePromptSchema>;
