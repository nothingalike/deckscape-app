import { z } from "zod";
import type { GameState } from "./game-state";
import { takeEffectTimestamp } from "./effect-timestamp";

export const destructionProtectionSchema = z
  .object({
    id: z.string().min(1),
    timestamp: z.number().int().nonnegative(),
    sourceId: z.string().min(1),
    targetId: z.string().min(1),
    targetIncarnation: z.number().int().nonnegative(),
    expiresAfterTurn: z.number().int().positive(),
  })
  .strict();
export type DestructionProtection = z.infer<typeof destructionProtectionSchema>;
export function protectFromDestruction(
  s: GameState,
  sourceId: string,
  targetId: string,
): GameState {
  if (
    s.outcome ||
    !s.objects[sourceId] ||
    ![...s.arena, ...s.environment].includes(targetId)
  )
    throw Error("Destruction protection target unavailable");
  const next = structuredClone(s),
    timestamp = takeEffectTimestamp(next);
  (next.destructionProtections ??= []).push(
    destructionProtectionSchema.parse({
      id: `effect:${timestamp}`,
      timestamp,
      sourceId,
      targetId,
      targetIncarnation: s.objects[targetId].incarnation,
      expiresAfterTurn: s.turn.number,
    }),
  );
  return next;
}
export function canDestroyPersistent(s: GameState, id: string): boolean {
  return !(s.destructionProtections ?? []).some(
    (e) =>
      e.targetId === id &&
      e.targetIncarnation === s.objects[id]?.incarnation &&
      e.expiresAfterTurn >= s.turn.number &&
      [...s.arena, ...s.environment].includes(id),
  );
}
export function expireDestructionProtection(s: GameState): GameState {
  const next = structuredClone(s);
  next.destructionProtections = (next.destructionProtections ?? []).filter(
    (e) => e.expiresAfterTurn > s.turn.number,
  );
  return next;
}
