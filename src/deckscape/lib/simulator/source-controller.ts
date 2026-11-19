import type { GameState } from "./game-state";
import type { Seat } from "./setup";

/** Resolving cache actions retain their controller even when their physical source has moved. */
export function sourceController(
  state: GameState,
  sourceId: string | null,
): Seat | null {
  if (sourceId === null) return null;
  const action = state.priorityWindow?.resolving;
  if (action?.sourceId === sourceId) return action.controller;
  return state.objects[sourceId]?.controller ?? null;
}
