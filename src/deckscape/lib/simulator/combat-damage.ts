import { z } from "zod";
import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";
import { applyDamageBatch, type EvaluatedDamage } from "./damage-batch";

export type CombatDamagePacket = {
  /** Omitted for noncombat effects sharing this packet shape. */
  combat?: true;
  sourceId: string;
  /** Explicit last-known controller for effects resolving from a departed trigger source. */
  sourceController?: Seat | null;
  channel: "MF" | "BF";
  amount: number;
} & (
  | { recipient: "character"; instanceId: string }
  | { recipient: "player"; player: Seat }
);

export interface CombatDamageEvaluation {
  characteristics: ReadonlyMap<string, CardCharacteristics>;
  overrun: ReadonlySet<string>;
  prepare(
    state: GameState,
    packets: readonly CombatDamagePacket[],
  ): { state: GameState; packets: EvaluatedDamage[] };
}
const splitsSchema = z.array(
  z
    .object({
      attackerId: z.string().min(1),
      assignments: z.array(
        z
          .object({
            blockerId: z.string().min(1),
            amount: z.number().int().nonnegative(),
          })
          .strict(),
      ),
    })
    .strict(),
);

/** Current combatants and pre-prevention damage values, shared with the deciding
 * player's split prompt. Departed, changed-type and changed-control objects no longer
 * participate; a running blocker has stopped blocking.
 */
export function combatDamageGroups(
  state: GameState,
  characteristics: ReadonlyMap<string, CardCharacteristics>,
  overrun: ReadonlySet<string>,
) {
  if (!state.combat) throw new Error("Missing combat state");
  if (!overrun) throw new Error("Combat keyword evaluation unavailable");
  const current = (id: string, player: Seat) => {
    if (!state.arena.includes(id) || state.objects[id].controller !== player)
      return null;
    const card = characteristics.get(id);
    if (!card) throw new Error(`Missing combat characteristics for ${id}`);
    if (card.cardType !== "character") return null;
    const amount = Math.max(0, card.attack);
    if (!Number.isSafeInteger(amount)) throw new Error("Invalid attack value");
    const remainingDefence = Math.max(
      0,
      card.defence - state.objects[id].damage.MF - state.objects[id].damage.BF,
    );
    if (!Number.isSafeInteger(remainingDefence))
      throw new Error("Invalid remaining defence");
    return { id, amount, channel: card.attackType, remainingDefence };
  };
  return state.combat.attackers.flatMap((id) => {
    const attacker = current(id, state.turn.activePlayer);
    if (!attacker) return [];
    const blockers = state
      .combat!.blockers.filter((link) => link.attackerId === id)
      .flatMap((link) => {
        const blocker = current(
          link.blockerId,
          (1 - state.turn.activePlayer) as Seat,
        );
        return blocker && !state.objects[blocker.id].running ? [blocker] : [];
      });
    const defence = blockers.reduce(
      (sum, blocker) => sum + blocker.remainingDefence,
      0,
    );
    if (!Number.isSafeInteger(defence))
      throw new Error("Blocking defence exceeds supported range");
    const excess =
      blockers.length && overrun.has(id)
        ? Math.max(0, attacker.amount - defence)
        : 0;
    return [{ attacker, blockers, excess }];
  });
}

/** CR 504.4: build the entire simultaneous batch before applying damage or checking losses.
 * Effective characteristics and later damage replacement/prevention are engine-owned.
 */
export function assignCombatDamage(
  state: GameState,
  userId: string,
  revision: number,
  input: unknown,
  characteristics: ReadonlyMap<string, CardCharacteristics>,
  overrun: ReadonlySet<string> = new Set(),
): CombatDamagePacket[] {
  if (
    state.outcome ||
    state.turn.step !== "combat" ||
    state.combat?.stage !== "damage" ||
    state.priorityWindow ||
    state.pendingRuleEvents.length ||
    state.pendingTriggers.length ||
    state.cache.length
  )
    throw new Error("Combat damage is not ready");
  if (state.players[state.turn.activePlayer].userId !== userId)
    throw new Error("Not the assigning player");
  if (state.revision !== revision) throw new Error("Stale revision");
  const splits = splitsSchema.parse(input);
  if (new Set(splits.map((split) => split.attackerId)).size !== splits.length)
    throw new Error("Duplicate damage split");
  const supplied = new Map(
    splits.map((split) => [split.attackerId, split.assignments]),
  );
  const used = new Set<string>();
  const packets: CombatDamagePacket[] = [];
  const defender = (1 - state.turn.activePlayer) as Seat;
  for (const group of combatDamageGroups(state, characteristics, overrun)) {
    const attackerId = group.attacker.id;
    const blockers = group.blockers.map((blocker) => blocker.id);
    const amount = group.attacker.amount;
    if (blockers.length === 0) {
      packets.push({
        sourceId: attackerId,
        channel: group.attacker.channel,
        amount,
        recipient: "player",
        player: defender,
      });
    } else {
      const assignments =
        group.excess > 0
          ? group.blockers.map((blocker) => ({
              blockerId: blocker.id,
              amount: blocker.remainingDefence,
            }))
          : blockers.length === 1
            ? [{ blockerId: blockers[0], amount }]
            : supplied.get(attackerId);
      if (!assignments) throw new Error("Damage split required");
      if (blockers.length > 1 && group.excess === 0) used.add(attackerId);
      if (
        assignments.length !== blockers.length ||
        new Set(assignments.map((a) => a.blockerId)).size !== blockers.length ||
        assignments.some((a) => !blockers.includes(a.blockerId)) ||
        assignments.reduce((sum, a) => sum + a.amount, 0) + group.excess !==
          amount
      )
        throw new Error("Invalid combat damage split");
      for (const assignment of assignments)
        packets.push({
          sourceId: attackerId,
          channel: group.attacker.channel,
          amount: assignment.amount,
          recipient: "character",
          instanceId: assignment.blockerId,
        });
      if (group.excess > 0)
        packets.push({
          sourceId: attackerId,
          channel: group.attacker.channel,
          amount: group.excess,
          recipient: "player",
          player: defender,
        });
      for (const blocker of group.blockers) {
        packets.push({
          sourceId: blocker.id,
          channel: blocker.channel,
          amount: blocker.amount,
          recipient: "character",
          instanceId: attackerId,
        });
      }
    }
  }
  if (splits.some((split) => !used.has(split.attackerId)))
    throw new Error("Unexpected damage split");
  return packets.map((packet) => ({ ...packet, combat: true }));
}

/** Server command boundary: replacements/prevention prepare the event, then one batch applies.
 * Damage triggers and state-based actions must complete before combat end.
 */
export function resolveCombatDamage(
  state: GameState,
  userId: string,
  revision: number,
  input: unknown,
  evaluated: CombatDamageEvaluation,
): GameState {
  if (!evaluated.overrun)
    throw new Error("Combat keyword evaluation unavailable");
  const assigned = assignCombatDamage(
    state,
    userId,
    revision,
    input,
    evaluated.characteristics,
    evaluated.overrun,
  );
  const prepared = evaluated.prepare(structuredClone(state), assigned);
  const next = prepared.state.outcome
    ? prepared.state
    : applyDamageBatch(
        prepared.state,
        prepared.packets,
        evaluated.characteristics,
      );
  next.combat!.stage = "damage-applied";
  next.revision = state.revision + 1;
  return next;
}
