import { z } from "zod";
import type { GameState } from "./game-state";
import type { EvaluatedDamage } from "./damage-batch";
import { takeEffectTimestamp } from "./effect-timestamp";

export const timedDamagePreventionSchema = z
  .object({
    id: z.string().min(1),
    timestamp: z.number().int().nonnegative(),
    sourceId: z.string().min(1),
    expiresAfterTurn: z.number().int().positive(),
    kind: z.enum(["prevent-all-damage", "justice"]),
    player: z.union([z.literal(0), z.literal(1)]).optional(),
    controller: z.union([z.literal(0), z.literal(1)]).optional(),
    // Omitted by retained global prevention effects. A captured incarnation
    // prevents protection from following a character that leaves and returns.
    character: z
      .object({
        instanceId: z.string().min(1),
        incarnation: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.kind === "justice"
        ? d.player !== undefined && d.controller !== undefined && !d.character
        : d.player === undefined && d.controller === undefined,
    "Invalid damage prevention metadata",
  );
export type TimedDamagePrevention = z.infer<typeof timedDamagePreventionSchema>;

/** Resolution creates a duration independent of the source's later zone or controller. */
export function preventAllDamageUntilTurnEnd(
  state: GameState,
  sourceId: string,
  characterId?: string,
): GameState {
  if (state.outcome || !state.objects[sourceId])
    throw new Error("Damage prevention source unavailable");
  if (
    characterId !== undefined &&
    (!state.arena.includes(characterId) || !state.objects[characterId])
  )
    throw new Error("Damage prevention recipient unavailable");
  const next = structuredClone(state),
    timestamp = takeEffectTimestamp(next);
  next.damagePreventions.push(
    timedDamagePreventionSchema.parse({
      id: `effect:${timestamp}`,
      timestamp,
      sourceId,
      expiresAfterTurn: state.turn.number,
      kind: "prevent-all-damage",
      ...(characterId === undefined
        ? {}
        : {
            character: {
              instanceId: characterId,
              incarnation: state.objects[characterId].incarnation,
            },
          }),
    }),
  );
  return next;
}

/** CR 613.5/614/615: call at this effect's prevention step, after replacements.
 * The release evaluator supplies the current prevention prohibition and handles ordering
 * against other prevention abilities; this helper never bypasses their choices.
 * Multiple identical unlimited effects have the same result and do not stack numerically. */
export function applyTimedDamagePrevention(
  state: GameState,
  packets: readonly EvaluatedDamage[],
  canPreventDamage: boolean,
): EvaluatedDamage[] {
  if (typeof canPreventDamage !== "boolean")
    throw new Error("Damage prevention permission unavailable");
  return packets.map((packet) => {
    const active = state.damagePreventions.some(
      (effect) =>
        effect.kind === "prevent-all-damage" &&
        effect.expiresAfterTurn >= state.turn.number &&
        (!effect.character ||
          (packet.recipient === "character" &&
            packet.instanceId === effect.character.instanceId &&
            state.arena.includes(packet.instanceId) &&
            state.objects[packet.instanceId]?.incarnation ===
              effect.character.incarnation)),
    );
    if (
      !Number.isSafeInteger(packet.amount) ||
      packet.amount < 0 ||
      !Number.isSafeInteger(packet.prevented) ||
      packet.prevented < 0 ||
      packet.prevented > packet.amount ||
      (!canPreventDamage && packet.prevented > 0)
    )
      throw new Error("Invalid damage prevention input");
    return {
      ...structuredClone(packet),
      prevented: active && canPreventDamage ? packet.amount : packet.prevented,
    };
  });
}

export function expireTimedDamagePrevention(state: GameState): GameState {
  const next = structuredClone(state);
  next.damagePreventions = next.damagePreventions.filter(
    (effect) => effect.expiresAfterTurn > state.turn.number,
  );
  return next;
}
