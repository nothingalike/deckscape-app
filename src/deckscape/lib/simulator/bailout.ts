import type { ProgramChoices } from "./program-choices";
import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { CardCharacteristics } from "./characteristics";
import type { ScriptBehavior } from "./resolve-script";
import type { PersistentDeparture } from "./destruction";
import { takeEffectTimestamp } from "./effect-timestamp";
import {
  applyHealthChanges,
  applyHealthLosses,
  healthChangesToSetTotals,
} from "./health";

export const bailoutId = "e535bad3-0200-4068-b05a-66f747b4041c";
export const bailoutDecisionSchema = z
  .object({
    type: z.literal("bailout"),
    id: z.string().min(1),
    sourceId: z.string().min(1),
    effectId: z.string().min(1),
    player: z.union([z.literal(0), z.literal(1)]),
    ram: z.array(z.string().min(1)).min(2),
    count: z.number().int().positive(),
  })
  .strict();
export type BailoutDecision = z.infer<typeof bailoutDecisionSchema>;
export interface BailoutEffects {
  characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
  depart(
    s: GameState,
    source: string,
    intents: readonly PersistentDeparture[],
  ): GameState;
}
export function bailoutRam(
  s: GameState,
  player: Seat,
  current: ReadonlyMap<string, CardCharacteristics>,
) {
  const inPlay = new Set([
    ...s.arena,
    ...s.players.flatMap((p) => p.zones.ramBank),
  ]);
  return [...inPlay]
    .filter(
      (id) =>
        s.objects[id]?.controller === player &&
        current.get(id)?.cardType === "ram",
    )
    .sort();
}
export function validateBailoutChoices(c: ProgramChoices) {
  if (
    c.reversed ||
    c.targets.length ||
    c.modes.length ||
    c.x !== null ||
    c.playerTarget !== undefined ||
    c.mainframeTarget !== undefined
  )
    throw Error("Invalid Bailout choices");
}
export const bailoutScript: ScriptBehavior = {
  hasLegalTargets(_s, a) {
    validateBailoutChoices(a.programChoices);
    return true;
  },
  resolve(s, a) {
    const next = structuredClone(s),
      timestamp = takeEffectTimestamp(next);
    next.triggerEffects.push({
      kind: "bailout",
      id: `effect:${timestamp}`,
      timestamp,
      sourceId: a.sourceId,
      controller: a.controller,
      expiresAfterTurn: s.turn.number,
    });
    return next;
  },
};

/** An until-turn-end replacement, not a triggered ability or a new priority window.
 * Concessions bypass this boundary. Winning by a card effect is not a health loss.
 */
export function replaceBailoutHealthLoss(
  s: GameState,
  losing: readonly Seat[],
  effects: Pick<BailoutEffects, "characteristics">,
) {
  for (const player of [
    s.turn.activePlayer,
    (1 - s.turn.activePlayer) as Seat,
  ]) {
    if (!losing.includes(player)) continue;
    const grant = s.triggerEffects.find(
      (e) =>
        e.kind === "bailout" &&
        e.controller === player &&
        e.expiresAfterTurn >= s.turn.number,
    );
    if (!grant) continue;
    const next = applyHealthChanges(
      s,
      grant.sourceId,
      healthChangesToSetTotals(s, [
        { player, channel: "MF", amount: 1 },
        { player, channel: "BF", amount: 1 },
      ]),
    );
    const ram = bailoutRam(next, player, effects.characteristics(next));
    const count = Math.floor(ram.length / 2);
    if (count)
      next.pendingDecision = {
        type: "bailout",
        id: `bailout:${takeEffectTimestamp(next)}`,
        sourceId: grant.sourceId,
        effectId: grant.id,
        player,
        ram,
        count,
      };
    return {
      state: next,
      changed: true,
      decisionPending: !!next.pendingDecision,
    };
  }
  return {
    state: applyHealthLosses(s, losing),
    changed: true,
    decisionPending: false,
  };
}
export function validateBailoutDecision(s: GameState): BailoutDecision {
  const d = s.pendingDecision;
  if (
    d?.type !== "bailout" ||
    !s.triggerEffects.some(
      (e) =>
        e.kind === "bailout" &&
        e.id === d.effectId &&
        e.sourceId === d.sourceId &&
        e.controller === d.player &&
        e.expiresAfterTurn >= s.turn.number,
    ) ||
    new Set(d.ram).size !== d.ram.length ||
    d.count !== Math.floor(d.ram.length / 2) ||
    !d.count ||
    d.ram.some((id) => !s.objects[id])
  )
    throw Error("Invalid Bailout continuation");
  return d;
}
export function answerBailout(
  s: GameState,
  user: string,
  revision: number,
  decisionId: string,
  selected: readonly string[],
  effects: BailoutEffects,
) {
  const d = validateBailoutDecision(s);
  if (
    s.outcome ||
    s.revision !== revision ||
    d.id !== decisionId ||
    s.players[d.player].userId !== user
  )
    throw Error("Stale or unauthorized Bailout choice");
  if (
    !isDeepStrictEqual(
      d.ram,
      bailoutRam(s, d.player, effects.characteristics(s)),
    ) ||
    selected.length !== d.count ||
    new Set(selected).size !== selected.length ||
    selected.some((id) => !d.ram.includes(id))
  )
    throw Error("Choose exactly half your RAM, rounded down");
  let next = structuredClone(s);
  next.pendingDecision = null;
  next = effects.depart(
    next,
    d.sourceId,
    selected.map((id) => ({
      id,
      kind: "destroy" as const,
      sourceId: d.sourceId,
      reason: "normal" as const,
      destroyedBy: d.player,
    })),
  );
  next.revision++;
  return next;
}
