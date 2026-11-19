import type { GameState } from "./game-state";
import type { CombatDamagePacket } from "./combat-damage";
import type { Seat } from "./setup";

/** Declaration trigger, independent of later blocking or attack-hit damage. */
export function thePulse(
  state: GameState,
  sourceId: string,
  defendingPlayer: Seat,
  damage: (
    state: GameState,
    packets: readonly CombatDamagePacket[],
  ) => GameState,
): GameState {
  return damage(state, [
    {
      sourceId,
      recipient: "player",
      player: defendingPlayer,
      channel: "MF",
      amount: 1,
    },
  ]);
}
