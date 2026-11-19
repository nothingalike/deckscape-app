import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import { applyHealthChanges } from "./health";
import {
  captureEventObservation,
  type EventObservation,
} from "./event-observation";

export interface PlayerDamage {
  combat?: true;
  sourceId: string;
  player: Seat;
  channel: "MF" | "BF";
  amount: number;
  /** Evaluated by the replacement/prevention interpreter before application. */
  prevented: number;
}
export interface PlayerDamageEvent extends Partial<EventObservation> {
  combat?: true;
  type: "player-damaged";
  sourceId: string;
  player: Seat;
  channel: "MF" | "BF";
  amount: number;
}

/** CR 117.4: apply the batch. The interpreter must run SBAs after the finalized
 * damage event, before resolving damage triggers or offering priority. */
export function applyPlayerDamage(
  state: GameState,
  packets: readonly PlayerDamage[],
): GameState {
  if (state.outcome) throw new Error("Game already ended");
  for (const packet of packets) {
    if (
      !packet.sourceId ||
      (packet.player !== 0 && packet.player !== 1) ||
      !["MF", "BF"].includes(packet.channel) ||
      !Number.isSafeInteger(packet.amount) ||
      packet.amount < 0 ||
      !Number.isSafeInteger(packet.prevented) ||
      packet.prevented < 0 ||
      packet.prevented > packet.amount
    )
      throw new Error("Invalid evaluated damage packet");
  }
  let next = structuredClone(state);
  for (const packet of packets) {
    const dealt = packet.amount - packet.prevented;
    if (!dealt) continue;
    next.pendingRuleEvents.push({
      type: "player-damaged",
      ...(packet.combat ? { combat: true as const } : {}),
      sourceId: packet.sourceId,
      player: packet.player,
      channel: packet.channel,
      amount: dealt,
    });
    next = applyHealthChanges(next, packet.sourceId, [
      {
        player: packet.player,
        channel: packet.channel,
        amount: dealt,
        operation: "lose",
        cause: "damage",
      },
    ]);
  }
  recordDamageObservations(next, state.pendingRuleEvents.length);
  return next;
}

/** Mutates a private damage transaction after the whole simultaneous batch, before
 * SBAs. Combined character/player batches replace inner observations with this final one. */
export function recordDamageObservations(
  state: GameState,
  firstEvent: number,
): void {
  const damaged = state.pendingRuleEvents
    .slice(firstEvent)
    .filter(
      (event) =>
        event.type === "character-damaged" || event.type === "player-damaged",
    );
  if (!damaged.length) return;
  const observation = captureEventObservation(state);
  for (const event of damaged)
    Object.assign(event, structuredClone(observation));
}
