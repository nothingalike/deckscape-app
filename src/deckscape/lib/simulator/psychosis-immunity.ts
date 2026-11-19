import { z } from "zod";
import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import { takeEffectTimestamp } from "./effect-timestamp";
export const psychosisImmunitySchema = z
  .object({
    id: z.string().min(1),
    timestamp: z.number().int().nonnegative(),
    sourceId: z.string().min(1),
    targetId: z.string().min(1),
    targetIncarnation: z.number().int().nonnegative(),
    player: z.union([z.literal(0), z.literal(1)]),
    grantedTurn: z.number().int().positive(),
  })
  .strict();
export type PsychosisImmunity = z.infer<typeof psychosisImmunitySchema>;
export function grantPsychosisImmunity(
  s: GameState,
  sourceId: string,
  targetId: string,
  player: Seat,
) {
  if (s.outcome || !s.objects[sourceId] || !s.arena.includes(targetId))
    throw Error("Psychosis immunity target unavailable");
  const next = structuredClone(s),
    timestamp = takeEffectTimestamp(next);
  (next.psychosisImmunities ??= []).push(
    psychosisImmunitySchema.parse({
      id: `effect:${timestamp}`,
      timestamp,
      sourceId,
      targetId,
      targetIncarnation: s.objects[targetId].incarnation,
      player,
      grantedTurn: s.turn.number,
    }),
  );
  return next;
}
export function hasPsychosisImmunity(s: GameState, id: string) {
  return (
    s.arena.includes(id) &&
    (s.psychosisImmunities ?? []).some(
      (e) =>
        e.targetId === id && e.targetIncarnation === s.objects[id]?.incarnation,
    )
  );
}
/** Expire at the next check's start, before instability and SYSTEM CHECK triggers. */
export function expireSystemCheckImmunities(s: GameState) {
  const next = structuredClone(s);
  next.psychosisImmunities = (s.psychosisImmunities ?? []).filter(
    (e) => e.player !== s.turn.activePlayer || e.grantedTurn >= s.turn.number,
  );
  return next;
}
