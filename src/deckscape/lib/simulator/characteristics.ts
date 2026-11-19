import { z } from "zod";
import { portsSchema } from "./ports";

const nonnegative = z.number().int().nonnegative();
const requirements = z.record(z.string().min(1), nonnegative);
const strings = z.array(z.string().min(1));
const ability = z
  .object({
    name: z.string().min(1),
    ramCost: nonnegative,
    run: z.boolean(),
    additionalCostText: z.string().min(1).optional(),
    grantedTo: z.literal("attached-character").optional(),
  })
  .strict();
const common = {
  name: z.string().min(1),
  factions: strings,
  tags: strings,
  iconic: z.boolean(),
  rulesText: z.string(),
  copiesLimit: nonnegative.nullable(),
};
const playable = {
  ...common,
  ramCost: nonnegative,
  requirements,
  activatedAbilities: z.array(ability),
  additionalPlayCostText: z.string().min(1).optional(),
};

/** Printed data only. Prose is never evaluated as a handler. No guessed defaults. */
export const characteristicsSchema = z.discriminatedUnion("cardType", [
  z
    .object({
      ...playable,
      cardType: z.literal("character"),
      attack: z.number().int(),
      defence: z.number().int(),
      attackType: z.enum(["MF", "BF"]),
      ports: portsSchema,
    })
    .strict(),
  z
    .object({
      ...playable,
      cardType: z.literal("gear"),
      subtype: z.string().min(1),
      ports: portsSchema,
    })
    .strict(),
  z
    .object({
      ...playable,
      cardType: z.literal("program"),
      subtype: z.enum(["script", "protocol", "environment"]),
      swift: z.boolean(),
      modes: strings.optional(),
      chooseModes: z.number().int().positive().optional(),
      reversal: z
        .object({
          normalText: z.string().min(1),
          pinkText: z.string().min(1),
          replacementText: z.string().min(1),
          reversedText: z.string().min(1),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      ...common,
      cardType: z.literal("mainframe"),
      prefix: z.string(),
      tiers: z
        .array(
          z
            .object({
              persistents: nonnegative,
              factions: requirements,
              operator: z.enum([
                "base",
                "independent",
                "or",
                "instead",
                "plus",
              ]),
              text: z.string().min(1),
            })
            .strict(),
        )
        .min(1),
    })
    .strict(),
  z
    .object({
      ...common,
      cardType: z.literal("ram"),
      isBasicRam: z.boolean(),
    })
    .strict(),
]);

export type CardCharacteristics = z.infer<typeof characteristicsSchema>;
