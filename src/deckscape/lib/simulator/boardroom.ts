import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";

/** Re-evaluate at resolution. A CORPO character contributes two, regardless of its other factions. */
export function boardroomPlayer(
  state: GameState,
  current: ReadonlyMap<string, CardCharacteristics>,
): Seat | null {
  const counts = [0, 0];
  for (const id of state.arena) {
    const card = current.get(id);
    if (!card) throw new Error("BOARDROOM characteristics unavailable");
    if (card.cardType === "character")
      counts[state.objects[id].controller] += card.factions.includes("CORPO")
        ? 2
        : 1;
  }
  return counts[0] === counts[1] ? null : counts[0] > counts[1] ? 0 : 1;
}

export function boardroom(
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
