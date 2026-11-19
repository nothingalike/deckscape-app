import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";
import { takeEffectTimestamp } from "./effect-timestamp";
import { changePersistentControl } from "./control";

export const timedControlSchema = z
  .object({
    sourceId: z.string().min(1),
    targetId: z.string().min(1),
    incarnation: z.number().int().nonnegative(),
    controller: z.union([z.literal(0), z.literal(1)]),
    timestamp: z.number().int().nonnegative(),
    expiresAfterTurn: z.number().int().positive(),
  })
  .strict();
export type TimedControl = z.infer<typeof timedControlSchema>;
export type ContinuousControl = Omit<TimedControl, "expiresAfterTurn">;

/** Keep the underlying controller once, then evaluate all surviving layer-2
 * effects in timestamp order. Expiring several temporary steals together must
 * not restore an intermediate controller whose effect also expired. */
export function normalizeControl(
  state: GameState,
  continuous: readonly ContinuousControl[],
  characteristics: ReadonlyMap<string, CardCharacteristics>,
) {
  const current = (e: ContinuousControl) =>
    state.arena.includes(e.targetId) &&
    state.objects[e.targetId]?.incarnation === e.incarnation;
  const timed = (state.timedControl ?? []).filter(
    (e) => current(e) && e.expiresAfterTurn >= state.turn.number,
  );
  const active = [...continuous.filter(current), ...timed];
  const bases = (state.attachmentControl ?? [])
    .filter(
      (b) =>
        state.arena.includes(b.hostId) &&
        state.objects[b.hostId]?.incarnation === b.incarnation,
    )
    .map((b) => ({ ...b }));
  if (
    !active.length &&
    !state.attachmentControl?.length &&
    !state.timedControl?.length
  )
    return { state, changed: false };
  for (const e of active)
    if (!bases.some((b) => b.hostId === e.targetId))
      bases.push({
        hostId: e.targetId,
        incarnation: e.incarnation,
        controller: state.objects[e.targetId].controller,
      });
  let next = structuredClone(state);
  for (const base of bases) {
    const latest = active
      .filter((e) => e.targetId === base.hostId)
      .sort((a, b) => a.timestamp - b.timestamp)
      .at(-1);
    const controller = latest?.controller ?? base.controller;
    if (next.objects[base.hostId].controller !== controller)
      next = changePersistentControl(
        next,
        latest?.sourceId ?? base.hostId,
        [{ instanceId: base.hostId, controller }],
        characteristics,
      );
  }
  next.attachmentControl = bases.filter((b) =>
    active.some((e) => e.targetId === b.hostId),
  );
  if (state.timedControl) next.timedControl = timed;
  return { state: next, changed: !isDeepStrictEqual(state, next) };
}

export function grantTurnControl(
  state: GameState,
  sourceId: string,
  targetId: string,
  controller: Seat,
): GameState {
  if (!state.arena.includes(targetId))
    throw Error("Temporary control target is not in play");
  const next = structuredClone(state);
  (next.timedControl ??= []).push({
    sourceId,
    targetId,
    incarnation: state.objects[targetId].incarnation,
    controller,
    timestamp: takeEffectTimestamp(next),
    expiresAfterTurn: state.turn.number,
  });
  return next;
}
