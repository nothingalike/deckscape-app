import type { GameState } from "./game-state";
import type { CacheAction } from "./priority";

/** Card actions belong to the object announced in the cache, never a later use of
 * its physical card ID. Activated abilities instead retain their own source snapshot.
 */
export function isCurrentCardSource(
  state: GameState,
  action: CacheAction,
): boolean {
  if (
    action.kind !== "card" ||
    !Number.isSafeInteger(action.sourceIncarnation) ||
    action.sourceIncarnation! < 0
  )
    throw new Error("Missing or invalid cached source incarnation");
  return (
    state.cache.includes(action.sourceId) &&
    state.objects[action.sourceId]?.incarnation === action.sourceIncarnation
  );
}

export function requireCurrentCardSource(
  state: GameState,
  action: CacheAction,
): void {
  if (!isCurrentCardSource(state, action))
    throw new Error("Cached source is absent or a different object");
}
