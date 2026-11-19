import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { CardCharacteristics } from "./characteristics";
import type { PersistentDeparture } from "./destruction";
import { sourceController } from "./source-controller";

/** Evaluate before the simultaneous departure, while the character and protocol are in play. */
export function taxEvasion(
  state: GameState,
  controller: Seat,
  departure: PersistentDeparture,
  characteristics: ReadonlyMap<string, CardCharacteristics>,
): boolean {
  if (
    departure.kind !== "destroy" ||
    !state.arena.includes(departure.id) ||
    state.objects[departure.id].controller !== controller ||
    characteristics.get(departure.id)?.cardType !== "character"
  )
    return false;
  const opponent =
    departure.reason === "force-quit"
      ? state.turn.activePlayer
      : departure.destroyedBy === undefined
        ? sourceController(state, departure.sourceId)
        : departure.destroyedBy;
  return opponent !== null && opponent !== controller;
}
