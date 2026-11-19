import { z } from "zod";
import { programChoicesSchema } from "./program-choices";
import { turnPromptSchema } from "./turn-prompt";

const id = z.string().min(1);
export const wonderlandPlaySchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("play-character"),
      id,
      ram: z.array(id),
      runCharacters: z.array(id).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("play-gear"),
      id,
      ram: z.array(id),
      targets: z.array(
        z
          .object({
            hostId: id,
            port: z.enum(["head", "body", "leftArm", "rightArm"]),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      type: z.literal("play-program"),
      id,
      ram: z.array(id),
      choices: programChoicesSchema,
    })
    .strict(),
]);
export type WonderlandPlay = z.infer<typeof wonderlandPlaySchema>;
export const wonderlandAnswerSchema = z
  .object({
    type: z.literal("answer-wonderland"),
    decisionId: id,
    selected: id.nullable().optional(),
    play: wonderlandPlaySchema.optional(),
  })
  .strict();
export type WonderlandAnswer = z.infer<typeof wonderlandAnswerSchema>;
export const wonderlandOptionsSchema = turnPromptSchema.options[0].pick({
  characters: true,
  gear: true,
  programs: true,
});
export type WonderlandOptions = z.infer<typeof wonderlandOptionsSchema>;
export const wonderlandPromptSchema = z
  .object({
    type: z.literal("wonderland"),
    decisionId: id,
    revision: z.number().int().nonnegative(),
    sourceId: id,
    stage: z.enum(["destroy", "invert", "play"]),
    roll: z.number().int(),
    remaining: z.number().int().min(0).max(1),
    candidates: z.array(id),
    cardId: id.optional(),
    play: wonderlandOptionsSchema.optional(),
  })
  .strict();
export type WonderlandPrompt = z.infer<typeof wonderlandPromptSchema>;
