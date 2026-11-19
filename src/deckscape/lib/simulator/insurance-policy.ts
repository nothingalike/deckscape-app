import type { GameState } from "./game-state";
import type { Seat } from "./setup";

export function insurancePolicy(
  state: GameState,
  sourceId: string,
  player: Seat,
  install: (
    state: GameState,
    sourceId: string,
    player: Seat,
    running: boolean,
  ) => GameState,
): GameState {
  return install(state, sourceId, player, true);
}
