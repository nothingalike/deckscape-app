import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";
import {
  captureEventObservation,
  type EventObservation,
} from "./event-observation";

export interface CounterRemovedEvent extends EventObservation {
  type: "counters-removed";
  sourceId: string;
  instanceId: string;
  player: Seat;
  counter: string;
  amount: number;
}

/** Apply an evaluated removal instruction as one batch. The caller handles any
 * replacement or prohibition before this primitive; zero counters is a legal no-op. */
export function removeAllMainframeCounters(
  state: GameState,
  sourceId: string,
  player: Seat,
  current: ReadonlyMap<string, CardCharacteristics>,
): GameState {
  if (state.outcome || !sourceId || (player !== 0 && player !== 1))
    throw new Error("Mainframe counter removal unavailable");
  const ids = state.players[player].zones.mainframe;
  if (ids.length !== 1 || current.get(ids[0])?.cardType !== "mainframe")
    throw new Error("Mainframe counter removal requires a mainframe");
  const id = ids[0],
    counters = state.objects[id]?.counters;
  if (
    !counters ||
    Object.entries(counters).some(
      ([name, amount]) => !name || !Number.isSafeInteger(amount) || amount < 0,
    )
  )
    throw new Error("Invalid mainframe counters");
  const next = structuredClone(state);
  next.objects[id].counters = {};
  const observed = captureEventObservation(next);
  for (const [counter, amount] of Object.entries(counters))
    if (amount > 0)
      next.pendingRuleEvents.push({
        type: "counters-removed",
        sourceId,
        instanceId: id,
        player: state.objects[id].controller,
        counter,
        amount,
        ...structuredClone(observed),
      });
  return next;
}
