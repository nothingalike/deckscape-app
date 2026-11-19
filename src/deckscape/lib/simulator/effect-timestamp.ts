import type { GameState } from "./game-state";

/** One saved chronology for object-zone changes and generated effects (CR 612.2).
 * Mutates only the caller's transaction copy; never reads a wall clock. */
export function takeEffectTimestamp(state: GameState): number {
  const timestamp = state.nextEffectNumber;
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    !Number.isSafeInteger(timestamp + 1)
  )
    throw new Error("Effect timestamp sequence exhausted");
  state.nextEffectNumber++;
  return timestamp;
}
