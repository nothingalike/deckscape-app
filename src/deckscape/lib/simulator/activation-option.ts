import { z } from "zod";
import { boardZones, type PlayerGameView } from "./board-view";

const id = z.string().min(1);
const count = z.number().int().nonnegative();
const label = z.string().trim().min(1).max(500);
export const activationVariantSchema = z
  .object({
    key: id,
    cacheActionId: id.optional(),
    label,
    modes: z.array(count),
    x: z.object({ minimum: count, maximum: count }).strict().nullable(),
    targets: z.array(
      z
        .object({
          label,
          purpose: z.enum(["sacrifice-ram", "sacrifice-character"]).optional(),
          minimum: count,
          maximum: count,
          candidates: z.array(id),
          candidatesByFirstTarget: z.record(id, z.array(id)).optional(),
        })
        .strict(),
    ),
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
  .superRefine((variant, ctx) => {
    if (
      new Set(variant.modes).size !== variant.modes.length ||
      (variant.playerTargets &&
        new Set(variant.playerTargets.map((target) => target.player)).size !==
          variant.playerTargets.length) ||
      (variant.x && variant.x.minimum > variant.x.maximum) ||
      variant.targets.some(
        (group) =>
          group.minimum > group.maximum ||
          new Set(group.candidates).size !== group.candidates.length,
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid activation choice description",
      });
  });
export type ActivationVariant = z.infer<typeof activationVariantSchema>;
export const activationAbilitySchema = z
  .object({
    abilityId: id,
    label,
    variants: z.array(activationVariantSchema),
  })
  .strict()
  .superRefine((ability, ctx) => {
    if (
      new Set(ability.variants.map((v) => v.key)).size !==
      ability.variants.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate activation variant" });
  });
export type ActivationAbilityOption = z.infer<typeof activationAbilitySchema>;
export const activationOptionSchema = z
  .object({ id, abilities: z.array(activationAbilitySchema) })
  .strict()
  .superRefine((option, ctx) => {
    if (
      new Set(option.abilities.map((a) => a.abilityId)).size !==
      option.abilities.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate activated ability" });
  });
export type ActivationOption = z.infer<typeof activationOptionSchema>;

/** Publicly located objects only. Ability descriptions belong to controlled,
 * refreshed, unspent sources whose identity this participant may inspect.
 */
export function activationOptionsMatchView(
  options: ActivationOption[],
  view: PlayerGameView,
): boolean {
  const visible = new Set(
    boardZones(view).flatMap((zone) =>
      zone.cards.map((card) => card.instanceId),
    ),
  );
  const eligible = new Set(
    [
      ...view.arena,
      ...view.environment,
      ...view.players.flatMap((player) => [
        ...player.mainframe,
        ...player.ramBank,
      ]),
    ]
      .filter(
        (card) =>
          card.controller === view.seat &&
          !card.running &&
          !card.abilitySpent &&
          !!card.definitionVersion,
      )
      .map((card) => card.instanceId),
  );
  return (
    new Set(options.map((o) => o.id)).size === options.length &&
    options.every(
      (option) =>
        eligible.has(option.id) &&
        option.abilities.every((ability) =>
          ability.variants.every(
            (variant) =>
              (variant.playerTargets ?? []).every(
                (target) =>
                  target.label ===
                  (target.player === view.seat ? "You" : "Opponent"),
              ) &&
              variant.targets.every(
                (group) =>
                  group.candidates.every((target) => visible.has(target)) &&
                  Object.entries(group.candidatesByFirstTarget ?? {}).every(
                    ([host, targets]) =>
                      visible.has(host) &&
                      targets.every(
                        (target) =>
                          visible.has(target) &&
                          group.candidates.includes(target),
                      ),
                  ),
              ),
          ),
        ),
    )
  );
}
