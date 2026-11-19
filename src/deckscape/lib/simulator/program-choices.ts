import { z } from "zod";

export const programChoicesSchema = z
  .object({
    modes: z.array(z.number().int().nonnegative()),
    sacrificeCharacters: z.array(z.string().min(1)).optional(),
    targets: z.array(z.string().min(1)),
    reversed: z.boolean(),
    x: z.number().int().nonnegative().nullable(),
    mainframeTarget: z.string().min(1).optional(),
    playerTarget: z.union([z.literal(0), z.literal(1)]).optional(),
    runCharacters: z.array(z.string().min(1)).optional(),
    /** Explicit pending ability identity; never encoded as a physical card target. */
    cacheActionId: z.string().min(1).optional(),
  })
  .strict();
export type ProgramChoices = z.infer<typeof programChoicesSchema>;
