import { z } from "zod";
import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import { takeEffectTimestamp } from "./effect-timestamp";

export const freeCardPlaySchema = z
  .object({
    id: z.string().min(1),
    timestamp: z.number().int().nonnegative(),
    sourceId: z.string().min(1),
    controller: z.union([z.literal(0), z.literal(1)]),
    expiresAfterTurn: z.number().int().positive(),
    remaining: z.number().int().min(1).max(2),
  })
  .strict();
export type FreeCardPlay = z.infer<typeof freeCardPlaySchema>;

/** A resolved duration survives its source leaving play or changing controller. */
export function grantFreeCardPlays(
  state: GameState,
  sourceId: string,
  controller: Seat,
): GameState {
  if (!state.objects[sourceId] || state.outcome)
    throw Error("Free play source unavailable");
  const next = structuredClone(state),
    timestamp = takeEffectTimestamp(next);
  (next.freeCardPlays ??= []).push({
    id: `effect:${timestamp}`,
    timestamp,
    sourceId,
    controller,
    expiresAfterTurn: state.turn.number,
    remaining: 2,
  });
  return next;
}

export function availableFreeCardPlays(state: GameState, player: Seat): number {
  return (state.freeCardPlays ?? [])
    .filter(
      (e) => e.controller === player && e.expiresAfterTurn >= state.turn.number,
    )
    .reduce((n, e) => n + e.remaining, 0);
}

/** Caller invokes only after a successful announcement, never for a quote.
 * Costs, timing and targets still use the normal play transaction. */
export function consumeFreeCardPlay(state: GameState, player: Seat): GameState {
  const next = structuredClone(state);
  const effect = next.freeCardPlays?.find(
    (e) => e.controller === player && e.expiresAfterTurn >= state.turn.number,
  );
  if (!effect) throw Error("No free card play remains");
  effect.remaining--;
  next.freeCardPlays = next.freeCardPlays!.filter((e) => e.remaining > 0);
  return next;
}

export function expireFreeCardPlays(state: GameState): GameState {
  if (!state.freeCardPlays) return state;
  const next = structuredClone(state);
  next.freeCardPlays = next.freeCardPlays!.filter(
    (e) => e.expiresAfterTurn > state.turn.number,
  );
  return next;
}

/** CR 107.4b: a RAM-cost waiver requires X=0; it is not a cost-setting effect. */
export function validateFreeCardPlay(
  state: GameState,
  player: Seat,
  x: number | null = null,
): void {
  if (!availableFreeCardPlays(state, player))
    throw Error("No free card play remains");
  if (x !== null && x !== 0)
    throw Error("X must be 0 when playing without paying the RAM cost");
}
