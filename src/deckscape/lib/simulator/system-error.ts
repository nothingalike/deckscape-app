import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { CombatDamagePacket } from "./combat-damage";

export function systemError(
  state: GameState,
  sourceId: string,
  player: Seat,
  damage: (
    state: GameState,
    packets: readonly CombatDamagePacket[],
  ) => GameState,
): GameState {
  return damage(state, [
    { sourceId, recipient: "player", player, channel: "MF", amount: 2 },
  ]);
}
