import type { GameState } from "./game-state";

/** CR v1.1 104.7 reveals identity, without turning a card face up or exposing
 * hands/decks. Both players have won/lost when a two-player game ends by loss. */
export function isEndgameRevealed(state: GameState, id: string): boolean {
  return (
    state.rulesVersion === "1.1" &&
    !!state.outcome &&
    state.outcome.type !== "abandoned" &&
    [
      ...state.arena,
      ...state.environment,
      ...state.players.flatMap((player) => [
        ...player.zones.ramBank,
        ...player.zones.purge,
      ]),
    ].includes(id)
  );
}
