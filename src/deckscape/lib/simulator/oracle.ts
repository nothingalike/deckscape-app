import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { CardCharacteristics } from "./characteristics";

/** A live permission, never a lasting grant to a previously inspected card.
 * Looking does not reveal, draw, move, or change the incarnation of that card. */
export function oracleTop(
  state: GameState,
  player: Seat,
  version: string | undefined,
  effects: {
    characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
    hasAbility(s: GameState, id: string): boolean;
  },
): string | undefined {
  const top = state.players[player].zones.cyberdeck[0];
  if (!version || !top) return undefined;
  const cards = effects.characteristics(state);
  return state.arena.some(
    (id) =>
      state.objects[id].definitionVersion === version &&
      state.objects[id].controller === player &&
      cards.get(id)?.cardType === "character" &&
      effects.hasAbility(state, id),
  )
    ? top
    : undefined;
}
