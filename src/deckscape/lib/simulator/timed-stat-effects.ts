import { z } from "zod";
import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import { evaluateCharacterStats, type StatEffect } from "./stat-layers";
import { takeEffectTimestamp } from "./effect-timestamp";
const id = z.string().min(1);
const metadata = {
  id,
  timestamp: z.number().int().nonnegative(),
  dependsOn: z.array(id),
  layer: z.enum(["7a", "7b", "7c", "7d", "7f"]),
};
export const timedStatEffectSchema = z
  .object({
    targetId: id.nullable(),
    faction: id.optional(),
    sourceId: id,
    expiresAfterTurn: z.number().int().positive().nullable(),
    sourceIncarnation: z.number().int().nonnegative().optional(),
    targetIncarnation: z.number().int().nonnegative().optional(),
    effect: z.union([
      z
        .object({
          ...metadata,
          operation: z.enum(["set", "add", "multiply"]),
          attack: z.number().int().optional(),
          defence: z.number().int().optional(),
        })
        .strict(),
      z.object({ ...metadata, operation: z.literal("swap") }).strict(),
    ]),
  })
  .strict()
  .refine(
    (item) =>
      item.targetId === null
        ? !!item.faction &&
          item.expiresAfterTurn !== null &&
          item.targetIncarnation === undefined
        : item.faction === undefined,
    "Invalid stat effect scope",
  )
  .refine(
    (item) =>
      item.expiresAfterTurn !== null ||
      (item.sourceIncarnation !== undefined &&
        item.targetIncarnation !== undefined),
    "Source-bound stats require both incarnations",
  );
export type TimedStatEffect = z.infer<typeof timedStatEffectSchema>;
export type StatEffectChange = { layer: StatEffect["layer"] } & (
  | { operation: "set" | "add" | "multiply"; attack?: number; defence?: number }
  | { operation: "swap" }
);

/** A faction-wide duration includes later arrivals and current faction changes.
 * Its source may already have left play, as with Wall of Death's purge. */
export function addUntilTurnEndFactionStatEffect(
  state: GameState,
  sourceId: string,
  faction: string,
  change: StatEffectChange,
): GameState {
  if (state.outcome || !state.objects[sourceId] || !faction)
    throw Error("Invalid faction stat effect");
  const next = structuredClone(state),
    timestamp = takeEffectTimestamp(next);
  const item = timedStatEffectSchema.parse({
    targetId: null,
    faction,
    sourceId,
    expiresAfterTurn: state.turn.number,
    effect: { id: `effect:${timestamp}`, timestamp, dependsOn: [], ...change },
  });
  evaluateCharacterStats({ attack: 0, defence: 0 }, {}, [item.effect]);
  next.statEffects.push(item);
  return next;
}

/** Fixed-target resolution effects survive source departure but not target departure. */
export function addUntilTurnEndStatEffect(
  state: GameState,
  sourceId: string,
  targetId: string,
  change: StatEffectChange,
  characteristics: ReadonlyMap<string, CardCharacteristics>,
): GameState {
  if (
    state.outcome ||
    !sourceId ||
    !state.arena.includes(targetId) ||
    characteristics.get(targetId)?.cardType !== "character"
  )
    throw new Error("Invalid timed stat effect target");
  if (
    !Number.isSafeInteger(state.nextEffectNumber) ||
    state.nextEffectNumber < 0 ||
    !Number.isSafeInteger(state.nextEffectNumber + 1)
  )
    throw new Error("Effect identity sequence exhausted");
  const effect = {
    id: `effect:${state.nextEffectNumber}`,
    timestamp: state.nextEffectNumber,
    dependsOn: [],
    ...change,
  };
  evaluateCharacterStats({ attack: 0, defence: 0 }, {}, [effect]);
  const next = structuredClone(state);
  takeEffectTimestamp(next);
  next.statEffects.push({
    targetId,
    sourceId,
    expiresAfterTurn: state.turn.number,
    effect,
  });
  return next;
}

/** Called after turn-end damage cleanup, before other expiry effects are evaluated. */
export function expireTimedStatEffects(state: GameState): GameState {
  const next = structuredClone(state);
  next.statEffects = next.statEffects.filter(
    (item) =>
      item.expiresAfterTurn === null ||
      item.expiresAfterTurn > state.turn.number,
  );
  return next;
}

/** Captured source/target identities prevent this duration from surviving either object's departure. */
export function addSourceBoundStatEffect(
  state: GameState,
  sourceId: string,
  targetId: string,
  change: StatEffectChange,
  characteristics: ReadonlyMap<string, CardCharacteristics>,
): GameState {
  if (!state.arena.includes(sourceId))
    throw Error("Source-bound stat source is not in play");
  const next = addUntilTurnEndStatEffect(
    state,
    sourceId,
    targetId,
    change,
    characteristics,
  );
  const effect = next.statEffects.at(-1)!;
  effect.expiresAfterTurn = null;
  effect.sourceIncarnation = state.objects[sourceId].incarnation;
  effect.targetIncarnation = state.objects[targetId].incarnation;
  return next;
}
