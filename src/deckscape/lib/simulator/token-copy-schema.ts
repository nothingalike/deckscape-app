import { z } from "zod";

/** Data-only: saved object schemas must not import runtime token creation. */
export const tokenCopyOverridesSchema = z
  .object({ iconic: z.literal(false) })
  .strict();
export type TokenCopyOverrides = z.infer<typeof tokenCopyOverridesSchema>;
