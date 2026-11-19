import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";
import { applyPlayerDamage, recordDamageObservations } from "./damage";
import type { EventObservation } from "./event-observation";
import type { CombatDamagePacket } from "./combat-damage";
import { sourceController } from "./source-controller";

export type EvaluatedDamage = CombatDamagePacket & { prevented: number };
export interface CharacterDamageEvent extends Partial<EventObservation> {
  /** Controller when damage was dealt, including a departed resolving source. */
  sourceController?: import("./setup").Seat | null;
  combat?: true;
  type: "character-damaged";
  player: Seat;
  instanceId: string;
  sourceId: string;
  channel: "MF" | "BF";
  amount: number;
}

/** Apply the whole evaluated event before state-based destruction. Character and player
 * recipients share validation and preserve their separate MF/BF damage channels.
 */
export function applyDamageBatch(
  state: GameState,
  packets: readonly EvaluatedDamage[],
  characteristics: ReadonlyMap<string, CardCharacteristics>,
): GameState {
  if (state.outcome) throw new Error("Game already ended");
  for (const packet of packets) {
    if (
      !packet.sourceId ||
      !["MF", "BF"].includes(packet.channel) ||
      !Number.isSafeInteger(packet.amount) ||
      packet.amount < 0 ||
      !Number.isSafeInteger(packet.prevented) ||
      packet.prevented < 0 ||
      packet.prevented > packet.amount ||
      (packet.sourceController !== undefined &&
        packet.sourceController !== null &&
        packet.sourceController !== 0 &&
        packet.sourceController !== 1)
    )
      throw new Error("Invalid evaluated damage packet");
    if (packet.recipient === "character") {
      if (
        !state.arena.includes(packet.instanceId) ||
        characteristics.get(packet.instanceId)?.cardType !== "character"
      )
        throw new Error("Invalid character damage recipient");
    } else if (
      packet.recipient !== "player" ||
      (packet.player !== 0 && packet.player !== 1)
    )
      throw new Error("Invalid player damage recipient");
  }
  const next = structuredClone(state);
  for (const packet of packets) {
    if (packet.recipient !== "character") continue;
    const dealt = packet.amount - packet.prevented;
    if (dealt === 0) continue;
    const object = next.objects[packet.instanceId];
    object.damage[packet.channel] += dealt;
    if (!Number.isSafeInteger(object.damage[packet.channel]))
      throw new Error("Damage total exceeds supported range");
    object.lastDamageSourceId = packet.sourceId;
    object.lastDamageController =
      packet.sourceController === undefined
        ? sourceController(state, packet.sourceId)
        : packet.sourceController;
    object.lastDamagedTurn = state.turn.number;
    next.pendingRuleEvents.push({
      type: "character-damaged",
      ...(packet.combat ? { combat: true as const } : {}),
      player: object.controller,
      instanceId: object.id,
      sourceId: packet.sourceId,
      sourceController: object.lastDamageController,
      channel: packet.channel,
      amount: dealt,
    });
  }
  const resolved = applyPlayerDamage(
    next,
    packets.flatMap((packet) =>
      packet.recipient === "player"
        ? [
            {
              sourceId: packet.sourceId,
              ...(packet.combat ? { combat: true as const } : {}),
              player: packet.player,
              channel: packet.channel,
              amount: packet.amount,
              prevented: packet.prevented,
            },
          ]
        : [],
    ),
  );
  recordDamageObservations(resolved, state.pendingRuleEvents.length);
  return resolved;
}

/** CR 117.3b/705.6a: caller evaluates defence after damage and handles destruction replacements. */
export function lethalCharacters(
  state: GameState,
  characteristics: ReadonlyMap<string, CardCharacteristics>,
): string[] {
  return state.arena.filter((id) => {
    const card = characteristics.get(id);
    if (!card)
      throw new Error(`Missing lethal-check characteristics for ${id}`);
    const damage = state.objects[id].damage;
    return (
      card.cardType === "character" &&
      card.defence > 0 &&
      damage.MF + damage.BF >= card.defence
    );
  });
}
