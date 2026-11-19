import { z } from "zod";
import { programChoicesSchema } from "./program-choices";
import { programPlayOptionSchema } from "./program-play-option";
const id = z.string().min(1),
  seat = z.union([z.literal(0), z.literal(1)]);
export const duckyDecisionSchema = z
  .object({
    type: z.literal("ducky-play"),
    id,
    sourceId: id,
    actionId: id,
    player: seat,
    cardId: id,
    definitionVersion: id,
  })
  .strict();
export type DuckyDecision = z.infer<typeof duckyDecisionSchema>;
export const duckyAnswerSchema = z
  .object({
    type: z.literal("answer-ducky"),
    decisionId: id,
    choices: programChoicesSchema.optional(),
    skip: z.literal(true).optional(),
  })
  .strict();
export const duckyPromptSchema = z
  .object({
    type: z.literal("ducky-play"),
    decisionId: id,
    revision: z.number().int().nonnegative(),
    cardId: id,
    options: z.array(programPlayOptionSchema),
    canPlay: z.boolean(),
  })
  .strict();
export type DuckyPrompt = z.infer<typeof duckyPromptSchema>;
