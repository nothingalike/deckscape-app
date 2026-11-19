import type { GameState } from "./game-state";
import type { Seat } from "./setup";

/** The player who played the program draws, even if the program or environment later leaves. */
export function theNet(
  state: GameState,
  sourceId: string,
  player: Seat,
  draw: (
    state: GameState,
    sourceId: string,
    player: Seat,
    count: number,
  ) => GameState,
): GameState {
  return draw(state, sourceId, player, 1);
}
