import { z } from "zod";
import { cardInspectionSchema } from "./card-inspection";
const seat = z.union([z.literal(0), z.literal(1)]),
  id = z.string().min(1);
const card = cardInspectionSchema
  .extend({
    instanceId: id,
    definitionVersion: z.string().regex(/^[a-f0-9]{64}$/),
    owner: seat,
  })
  .strict();
export const setupViewSchema = z
  .object({
    revision: z.number().int().min(0).max(3),
    openingRolls: z.array(z.tuple([
      z.number().int().min(1).max(20),
      z.number().int().min(1).max(20),
    ])).min(1).nullable().default(null),
    seat,
    startingPlayer: seat.nullable(),
    decision: z.discriminatedUnion("type", [
      z.object({ type: z.literal("choose-starter"), seat }).strict(),
      z.object({ type: z.literal("mulligan"), seat }).strict(),
      z.object({ type: z.literal("ready") }).strict(),
    ]),
    players: z
      .array(
        z
          .object({
            seat,
            mainframe: card,
            mainframeHealth: z.number().int(),
            bioframeHealth: z.number().int(),
            cyberdeckCount: z.number().int().nonnegative(),
            ramDeckCount: z.number().int().nonnegative(),
            handCount: z.number().int().min(0).max(5),
            hand: z.array(card).max(5).optional(),
          })
          .strict(),
      )
      .length(2),
    legalDecisions: z
      .array(
        z.discriminatedUnion("type", [
          z
            .object({
              type: z.literal("choose-starter"),
              choices: z.array(seat).length(2),
            })
            .strict(),
          z
            .object({
              type: z.literal("mulligan"),
              cardIds: z.array(id).max(5),
            })
            .strict(),
        ]),
      )
      .max(1),
  })
  .strict()
  .superRefine((view, ctx) => {
    if (view.openingRolls?.length) {
      const final = view.openingRolls.at(-1)!;
      if (
        final[0] === final[1] ||
        view.openingRolls.slice(0, -1).some(([a, b]) => a !== b) ||
        (view.decision.type === "choose-starter" &&
          view.decision.seat !== (final[0] > final[1] ? 0 : 1))
      ) ctx.addIssue({ code: "custom", message: "Invalid opening D20 contest" });
    }
    if (
      view.players.some(
        (player, index) =>
          player.seat !== index ||
          player.mainframe.owner !== index ||
          (player.seat === view.seat
            ? !player.hand ||
              player.hand.length !== player.handCount ||
              player.hand.some((card) => card.owner !== view.seat)
            : player.hand !== undefined),
      )
    )
      ctx.addIssue({ code: "custom", message: "Invalid setup visibility" });
    const yourChoice =
      view.decision.type !== "ready" && view.decision.seat === view.seat;
    if (
      view.legalDecisions.length !== (yourChoice ? 1 : 0) ||
      (yourChoice && view.legalDecisions[0]?.type !== view.decision.type)
    )
      ctx.addIssue({ code: "custom", message: "Invalid setup decisions" });
    const choice = view.legalDecisions[0];
    if (choice?.type === "choose-starter" && new Set(choice.choices).size !== 2)
      ctx.addIssue({
        code: "custom",
        message: "Invalid starting player choices",
      });
    if (choice?.type === "mulligan") {
      const hand = view.players[view.seat].hand ?? [];
      if (
        choice.cardIds.length !== hand.length ||
        new Set(choice.cardIds).size !== hand.length ||
        hand.some((card) => !choice.cardIds.includes(card.instanceId))
      )
        ctx.addIssue({
          code: "custom",
          message: "Invalid mulligan candidates",
        });
    }
  });
export type SetupView = z.infer<typeof setupViewSchema>;
