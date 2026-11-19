import { z } from "zod";
import { programPlayOptionSchema } from "./program-play-option";
import { activationOptionSchema } from "./activation-option";
import type { PlayerGameView } from "./board-view";

const common = { revision: z.number().int().nonnegative() };
const id = z.string().min(1);
/** Public choices only; no hidden card identities or interpreter data. */
export const turnPromptSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...common,
      type: z.literal("pass"),
      programs: z.array(programPlayOptionSchema).optional(),
      activations: z.array(activationOptionSchema).optional(),
      gear: z
        .array(
          z
            .object({
              id,
              cost: z.number().int().nonnegative(),
              freePlays: z.number().int().positive().optional(),
              ram: z.array(id),
              tether: z.boolean(),
              hosts: z.array(
                z
                  .object({
                    hostId: id,
                    ports: z
                      .array(z.enum(["head", "body", "leftArm", "rightArm"]))
                      .min(1),
                    chain: z.number().int().nonnegative(),
                  })
                  .strict(),
              ),
              unavailable: z
                .enum([
                  "window",
                  "hand",
                  "prohibited",
                  "timing",
                  "additionalCost",
                  "synergy",
                  "ram",
                  "attachment",
                ])
                .nullable(),
            })
            .strict(),
        )
        .optional(),
      characters: z
        .array(
          z
            .object({
              id,
              cost: z.number().int().nonnegative(),
              freePlays: z.number().int().positive().optional(),
              ram: z.array(id),
              runCharacters: z
                .object({
                  count: z.number().int().nonnegative(),
                  candidates: z.array(id),
                })
                .strict()
                .optional(),
              unavailable: z
                .enum([
                  "window",
                  "hand",
                  "prohibited",
                  "timing",
                  "additionalCost",
                  "synergy",
                  "ram",
                ])
                .nullable(),
            })
            .strict(),
        )
        .optional(),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal("order-triggers"),
      triggers: z
        .array(
          z
            .object({
              index: z.number().int().nonnegative(),
              label: z.string().trim().min(1).max(500),
              yours: z.boolean(),
              sourceId: id.optional(),
            })
            .strict(),
        )
        .min(2),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal("attack"),
      candidates: z.array(id),
      required: z.array(id).optional(),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal("block"),
      requiredBlockers: z.array(id).optional(),
      minimumBlockers: z
        .array(
          z
            .object({ attackerId: id, minimum: z.number().int().positive() })
            .strict(),
        )
        .optional(),
      blockers: z.array(
        z.object({ blockerId: id, attackers: z.array(id).min(1) }).strict(),
      ),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal("assign-damage"),
      overrun: z
        .array(
          z
            .object({
              attackerId: id,
              channel: z.enum(["MF", "BF"]),
              playerDamage: z.number().int().positive(),
              blockers: z
                .array(
                  z
                    .object({ id, amount: z.number().int().nonnegative() })
                    .strict(),
                )
                .min(1),
            })
            .strict(),
        )
        .optional(),
      splits: z.array(
        z
          .object({
            attackerId: id,
            total: z.number().int().nonnegative(),
            blockers: z.array(id).min(2),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal("draw-install"),
      remaining: z.number().int().positive(),
      canDraw: z.boolean(),
      canInstall: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal("force-quit"),
      candidates: z.array(z.string().min(1)),
    })
    .strict(),
]);
export type TurnPrompt = z.infer<typeof turnPromptSchema>;

/** Structural ownership/phase gate shared by response validation and React mounting. */
export function turnPromptMatchesView(
  prompt: TurnPrompt,
  view: PlayerGameView,
): boolean {
  if (view.outcome || view.pendingDecision || prompt.revision !== view.revision)
    return false;
  if (view.triggerOrder)
    return (
      prompt.type === "order-triggers" && view.triggerOrder.player === view.seat
    );
  if (prompt.type === "order-triggers") return false;
  if (prompt.type === "pass")
    return (
      view.priority?.mode === "priority" && view.priority.player === view.seat
    );
  if (view.priority || view.cache.length) return false;
  if (
    prompt.type === "attack" ||
    prompt.type === "block" ||
    prompt.type === "assign-damage"
  ) {
    const stage =
      prompt.type === "attack"
        ? "attackers"
        : prompt.type === "block"
          ? "blockers"
          : "damage";
    const owner =
      prompt.type === "block"
        ? 1 - view.turn.activePlayer
        : view.turn.activePlayer;
    return (
      view.turn.step === "combat" &&
      view.combat?.stage === stage &&
      view.seat === owner
    );
  }
  return view.turn.activePlayer === view.seat && view.turn.step === prompt.type;
}
