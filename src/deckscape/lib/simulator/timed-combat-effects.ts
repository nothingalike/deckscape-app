import { z } from "zod";
import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import { takeEffectTimestamp } from "./effect-timestamp";
import { recordPsychosisGrant } from "./game-log-record";

const keyword = z.enum(["STAMINA", "STEALTH", "VISION", "OVERRUN"]);
export const timedCombatEffectSchema = z
  .object({
    id: z.string().min(1),
    timestamp: z.number().int().nonnegative(),
    sourceId: z.string().min(1),
    sourceIncarnation: z.number().int().nonnegative().optional(),
    targetId: z.string().min(1).nullable(),
    targetIncarnation: z.number().int().nonnegative().nullable(),
    /** null is a grant tied to its source incarnation rather than turn end. */
    expiresAfterTurn: z.number().int().positive().nullable(),
    change: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("grant-keyword"), keyword }).strict(),
      z.object({ kind: z.literal("cannot-block") }).strict(),
      z.object({ kind: z.literal("must-attack") }).strict(),
      z.object({ kind: z.literal("must-block") }).strict(),
      z.object({ kind: z.literal("grant-character-hit-copy") }).strict(),
      z.object({ kind: z.literal("grant-smash-and-grab") }).strict(),
      z.object({ kind: z.literal("grant-unchained-rage") }).strict(),
      z
        .object({
          kind: z.literal("grant-psychosis"),
          amount: z.number().int().positive(),
        })
        .strict(),
    ]),
  })
  .strict()
  .refine(
    (e) =>
      e.targetId === null
        ? e.targetIncarnation === null &&
          e.expiresAfterTurn !== null &&
          (e.change.kind === "must-attack" || e.change.kind === "must-block")
        : e.targetIncarnation !== null,
    "Global combat obligations require a turn duration",
  )
  .refine(
    (effect) =>
      effect.expiresAfterTurn !== null ||
      ((effect.change.kind === "grant-psychosis" ||
        effect.change.kind === "grant-keyword") &&
        effect.sourceIncarnation !== undefined),
    "Source-bound grants require a source incarnation",
  );
export type TimedCombatEffect = z.infer<typeof timedCombatEffectSchema>;

export function addSourceBoundKeywordEffect(
  state: GameState,
  sourceId: string,
  targetId: string,
  grantedKeyword: z.infer<typeof keyword>,
  current: ReadonlyMap<string, CardCharacteristics>,
): GameState {
  if (!state.arena.includes(sourceId))
    throw Error("Source-bound keyword requires an in-play source");
  const next = addUntilTurnEndCombatEffect(
    state,
    sourceId,
    targetId,
    { kind: "grant-keyword", keyword: grantedKeyword },
    current,
  );
  const effect = next.combatEffects.at(-1)!;
  effect.expiresAfterTurn = null;
  effect.sourceIncarnation = state.objects[sourceId].incarnation;
  return next;
}

/** Resolution fixes the recipient; later source departure or control changes do not
 * end the effect. Target zone changes do, and turn-end cleanup removes the duration. */
function addCombatEffect(
  state: GameState,
  sourceId: string,
  targetId: string,
  change: TimedCombatEffect["change"],
  current: ReadonlyMap<string, CardCharacteristics>,
  duration: "turn" | "in-play",
): GameState {
  const target = state.objects[targetId];
  if (
    state.outcome ||
    !sourceId ||
    !target ||
    !state.arena.includes(targetId) ||
    current.get(targetId)?.cardType !== "character"
  )
    throw new Error("Invalid temporary combat-effect target");
  const next = structuredClone(state),
    timestamp = takeEffectTimestamp(next);
  const effect = timedCombatEffectSchema.parse({
    id: `effect:${timestamp}`,
    timestamp,
    sourceId,
    targetId,
    targetIncarnation: target.incarnation,
    expiresAfterTurn: state.turn.number,
    change,
  });
  next.combatEffects.push(effect);
  if (change.kind !== "cannot-block")
    next.objects[targetId].timestamp = timestamp;
  if (change.kind === "grant-psychosis")
    recordPsychosisGrant(
      next,
      sourceId,
      targetId,
      change.amount,
      duration,
      current,
    );
  return next;
}

export function addUntilTurnEndCombatEffect(
  state: GameState,
  sourceId: string,
  targetId: string,
  change: TimedCombatEffect["change"],
  current: ReadonlyMap<string, CardCharacteristics>,
): GameState {
  return addCombatEffect(state, sourceId, targetId, change, current, "turn");
}

export function activeCombatEffects(
  state: GameState,
): readonly TimedCombatEffect[] {
  return state.combatEffects.filter(
    (effect) =>
      (effect.expiresAfterTurn === null ||
        effect.expiresAfterTurn >= state.turn.number) &&
      (effect.expiresAfterTurn !== null ||
        (state.arena.includes(effect.sourceId) &&
          state.objects[effect.sourceId]?.incarnation ===
            effect.sourceIncarnation)) &&
      (effect.targetId === null ||
        (state.arena.includes(effect.targetId) &&
          state.objects[effect.targetId]?.incarnation ===
            effect.targetIncarnation)),
  );
}

export function expireTimedCombatEffects(state: GameState): GameState {
  const next = structuredClone(state);
  const losing = new Set(
    activeCombatEffects(state)
      .filter(
        (effect) =>
          effect.expiresAfterTurn !== null &&
          effect.expiresAfterTurn <= state.turn.number &&
          effect.change.kind !== "cannot-block",
      )
      .map((effect) => effect.targetId),
  );
  next.combatEffects = next.combatEffects.filter(
    (effect) =>
      effect.expiresAfterTurn === null ||
      effect.expiresAfterTurn > state.turn.number,
  );
  for (const id of losing)
    if (id !== null) next.objects[id].timestamp = takeEffectTimestamp(next);
  return next;
}

/** The owning card binding supplies the resolved duration explicitly. */
export function grantPsychosis(
  state: GameState,
  sourceId: string,
  targetId: string,
  amount: number,
  duration: "turn" | "in-play",
  current: ReadonlyMap<string, CardCharacteristics>,
  sourceIncarnation = state.objects[sourceId]?.incarnation,
): GameState {
  if (
    duration === "in-play" &&
    (!state.arena.includes(sourceId) ||
      state.objects[sourceId]?.incarnation !== sourceIncarnation)
  )
    return state;
  const next = addCombatEffect(
    state,
    sourceId,
    targetId,
    { kind: "grant-psychosis", amount },
    current,
    duration,
  );
  if (duration === "in-play") {
    next.combatEffects[next.combatEffects.length - 1].expiresAfterTurn = null;
    next.combatEffects[next.combatEffects.length - 1].sourceIncarnation =
      sourceIncarnation;
  }
  return next;
}

/** Applies to all current and later characters until turn end. */
export function addUntilTurnEndCombatObligation(
  state: GameState,
  sourceId: string,
  kind: "must-attack" | "must-block",
): GameState {
  if (state.outcome || !state.objects[sourceId])
    throw Error("Invalid global combat obligation source");
  const next = structuredClone(state),
    timestamp = takeEffectTimestamp(next);
  next.combatEffects.push(
    timedCombatEffectSchema.parse({
      id: "effect:" + timestamp,
      timestamp,
      sourceId,
      targetId: null,
      targetIncarnation: null,
      expiresAfterTurn: state.turn.number,
      change: { kind },
    }),
  );
  return next;
}
