import { z } from "zod";
import { programChoicesSchema } from "./program-choices";

export const programQuoteRequestSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    id: z.string().min(1),
    choices: programChoicesSchema,
    freePlay: z.boolean().optional(),
  })
  .strict();
export type ProgramQuoteRequest = z.infer<typeof programQuoteRequestSchema>;
const revision = z.number().int().nonnegative();
export const programQuoteSchema = z
  .discriminatedUnion("status", [
    z
      .object({
        status: z.literal("ready"),
        revision,
        request: programQuoteRequestSchema,
        cost: z.number().int().nonnegative(),
        ram: z.array(z.string().min(1)),
        affordable: z.boolean(),
      })
      .strict(),
    z
      .object({
        status: z.literal("unavailable"),
        revision,
        request: programQuoteRequestSchema,
        reason: z.enum([
          "stale",
          "window",
          "hand",
          "prohibited",
          "timing",
          "additionalCost",
          "health",
          "synergy",
          "choices",
        ]),
      })
      .strict(),
  ])
  .superRefine((quote, context) => {
    const stale = quote.status === "unavailable" && quote.reason === "stale";
    if (stale === (quote.revision === quote.request.expectedRevision))
      context.addIssue({
        code: "custom",
        message: "Program quote revision mismatch",
      });
    if (
      quote.status === "ready" &&
      (quote.revision !== quote.request.expectedRevision ||
        new Set(quote.ram).size !== quote.ram.length ||
        quote.affordable !== quote.ram.length >= quote.cost)
    )
      context.addIssue({ code: "custom", message: "Invalid program quote" });
  });
export type ProgramQuote = z.infer<typeof programQuoteSchema>;
export const programQuoteResponseSchema = z
  .object({ matchId: z.uuid(), quote: programQuoteSchema })
  .strict();
