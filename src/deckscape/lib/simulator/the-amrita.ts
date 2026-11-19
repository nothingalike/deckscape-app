import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";

/** Count current controlled DUSTRUNNER characters when the NETCHECK trigger resolves. */
export function theAmrita(
  state: GameState,
  sourceId: string,
  player: Seat,
  effects: {
    characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
    gainHealth(
      state: GameState,
      sourceId: string,
      player: Seat,
      amount: number,
    ): GameState;
  },
): GameState {
  const cards = effects.characteristics(structuredClone(state));
  const count = state.arena.filter((id) => {
    const card = cards.get(id);
    if (!card) throw new Error("THE AMRITA characteristics unavailable");
    return (
      state.objects[id].controller === player &&
      card.cardType === "character" &&
      card.factions.includes("DUSTRUNNER")
    );
  }).length;
  return count ? effects.gainHealth(state, sourceId, player, count) : state;
}
