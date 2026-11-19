import { z } from "zod";
import { abilityChoicesSchema } from "./ability-choices";

export const activationQuoteRequestSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    id: z.string().min(1),
    abilityId: z.string().min(1),
    choices: abilityChoicesSchema,
  })
  .strict();
export type ActivationQuoteRequest = z.infer<
  typeof activationQuoteRequestSchema
>;
const revision = z.number().int().nonnegative();
export const activationQuoteSchema = z
  .discriminatedUnion("status", [
    z
      .object({
        status: z.literal("ready"),
        revision,
        request: activationQuoteRequestSchema,
        cost: z.number().int().nonnegative(),
        run: z.boolean(),
        ram: z.array(z.string().min(1)),
        affordable: z.boolean(),
      })
      .strict(),
    z
      .object({
        status: z.literal("unavailable"),
        revision,
        request: activationQuoteRequestSchema,
        reason: z.enum([
          "stale",
          "window",
          "source",
          "prohibited",
          "additionalCost",
          "choices",
        ]),
      })
      .strict(),
  ])
  .superRefine((quote, ctx) => {
    const stale = quote.status === "unavailable" && quote.reason === "stale";
    if (stale === (quote.revision === quote.request.expectedRevision))
      ctx.addIssue({
        code: "custom",
        message: "Activation quote revision mismatch",
      });
    if (
      quote.status === "ready" &&
      (new Set(quote.ram).size !== quote.ram.length ||
        quote.affordable !== quote.ram.length >= quote.cost ||
        (quote.run && quote.ram.includes(quote.request.id)))
    )
      ctx.addIssue({ code: "custom", message: "Invalid activation quote" });
  });
export type ActivationQuote = z.infer<typeof activationQuoteSchema>;
export const activationQuoteResponseSchema = z
  .object({ matchId: z.uuid(), quote: activationQuoteSchema })
  .strict();
