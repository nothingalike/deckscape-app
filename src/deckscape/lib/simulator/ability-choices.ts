import { z } from "zod";

/** Public choice contract, shared without importing the server action evaluator. */
export const abilityChoicesSchema = z
  .object({
    sacrificeCharacters: z.array(z.string().min(1)).optional(),
    targets: z.array(z.string().min(1)),
    cacheActionId: z.string().min(1).optional(),
    sacrificeRam: z.array(z.string().min(1)).optional(),
    playerTarget: z.union([z.literal(0), z.literal(1)]).optional(),
    modes: z.array(z.number().int().nonnegative()),
    x: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type AbilityChoices = z.infer<typeof abilityChoicesSchema>;
