import { z } from "zod";
import { boardZones, type PlayerGameView } from "./board-view";

const id = z.string().min(1);
const count = z.number().int().nonnegative();
/** One explicit combination of modes/reversal. Target groups retain their order in
 * the announced targets array. Handlers still validate cross-group constraints.
 */
export const programVariantSchema = z
  .object({
    key: id,
    cacheActionId: id.optional(),
    label: z.string().trim().min(1).max(500),
    modes: z.array(count),
    reversed: z.boolean(),
    x: z.object({ minimum: count, maximum: count }).strict().nullable(),
    targets: z.array(
      z
        .object({
          purpose: z.literal("sacrifice-character").optional(),
          label: z.string().trim().min(1).max(500),
          minimum: count,
          maximum: count,
          candidates: z.array(id),
        })
        .strict(),
    ),
    mainframes: z.array(id).nullable(),
    runCharacters: z
      .object({
        label: z.string().trim().min(1).max(500),
        candidates: z.array(id),
      })
      .strict()
      .optional(),
    playerTargets: z
      .array(
        z
          .object({
            player: z.union([z.literal(0), z.literal(1)]),
            label: z.enum(["You", "Opponent"]),
          })
          .strict(),
      )
      .optional(),
  })
  .strict()
  .superRefine((variant, context) => {
    if (
      new Set(variant.modes).size !== variant.modes.length ||
      (variant.runCharacters &&
        (!variant.x ||
          variant.x.maximum > variant.runCharacters.candidates.length ||
          new Set(variant.runCharacters.candidates).size !==
            variant.runCharacters.candidates.length)) ||
      (variant.playerTargets &&
        new Set(variant.playerTargets.map((target) => target.player)).size !==
          variant.playerTargets.length) ||
      (variant.x && variant.x.minimum > variant.x.maximum) ||
      (variant.mainframes &&
        new Set(variant.mainframes).size !== variant.mainframes.length) ||
      variant.targets.some(
        (group) =>
          group.minimum > group.maximum ||
          new Set(group.candidates).size !== group.candidates.length,
      )
    )
      context.addIssue({
        code: "custom",
        message: "Invalid program choice description",
      });
  });
export type ProgramPlayVariant = z.infer<typeof programVariantSchema>;
export const programPlayOptionSchema = z
  .object({
    freePlays: z.number().int().positive().optional(),
    id,
    variants: z.array(programVariantSchema),
    origin: z.enum(["hand", "recycleBin", "cyberdeck"]).optional(),
  })
  .strict()
  .superRefine((option, context) => {
    if (
      new Set(option.variants.map((variant) => variant.key)).size !==
      option.variants.length
    )
      context.addIssue({
        code: "custom",
        message: "Duplicate program variant",
      });
  });
export type ProgramPlayOption = z.infer<typeof programPlayOptionSchema>;

/** Choices may refer only to objects the participant can locate on this snapshot. */
export function programOptionsMatchView(
  options: ProgramPlayOption[],
  view: PlayerGameView,
): boolean {
  const own = new Set(
    view.players
      .find((player) => player.seat === view.seat)
      ?.hand?.map((card) => card.instanceId),
  );
  const top = view.players.find((p) => p.seat === view.seat)?.cyberdeckTop
    ?.instanceId;
  const topIds = new Set(top ? [top] : []);
  const visible = new Set(
    boardZones(view).flatMap((zone) =>
      zone.cards.map((card) => card.instanceId),
    ),
  );
  const recycled = new Set(
    view.players
      .find((player) => player.seat === view.seat)
      ?.recycleBin.map((card) => card.instanceId),
  );
  const mainframes = new Set(
    view.players.flatMap((player) =>
      player.mainframe.map((card) => card.instanceId),
    ),
  );
  return (
    new Set(options.map((option) => option.id)).size === options.length &&
    options.every(
      (option) =>
        (option.origin === "recycleBin"
          ? recycled
          : option.origin === "cyberdeck"
            ? topIds
            : own
        ).has(option.id) &&
        option.variants.every(
          (variant) =>
            (!variant.cacheActionId ||
              !!view.priority?.stack.some(
                (action) => action.kind === "activated",
              )) &&
            (variant.playerTargets ?? []).every(
              (target) =>
                target.label ===
                (target.player === view.seat ? "You" : "Opponent"),
            ) &&
            variant.targets.every((group) =>
              group.candidates.every((id) => visible.has(id)),
            ) &&
            (!variant.runCharacters ||
              variant.runCharacters.candidates.every((id) =>
                view.arena.some(
                  (card) =>
                    card.instanceId === id &&
                    card.controller === view.seat &&
                    !card.running,
                ),
              )) &&
            (!variant.mainframes ||
              variant.mainframes.every((id) => mainframes.has(id))),
        ),
    )
  );
}
