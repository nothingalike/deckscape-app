import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { CombatDamagePacket } from "./combat-damage";
import type { Seat } from "./setup";

/** One simultaneous, untargeted BF damage instruction, evaluated at resolution. */
export function acidRain(
  state: GameState,
  sourceId: string,
  controller: Seat,
  effects: {
    characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
    damage(state: GameState, packets: readonly CombatDamagePacket[]): GameState;
  },
): GameState {
  const cards = effects.characteristics(structuredClone(state));
  const packets: CombatDamagePacket[] = state.arena.flatMap((id) => {
    const card = cards.get(id);
    if (!card) throw new Error("ACID RAIN characteristics unavailable");
    return card.cardType === "character"
      ? [
          {
            sourceId,
            sourceController: controller,
            recipient: "character" as const,
            instanceId: id,
            channel: "BF" as const,
            amount: 1,
          },
        ]
      : [];
  });
  return packets.length ? effects.damage(state, packets) : state;
}
