import type { GameState } from "./game-state";

/** CR 705.6m: opposing counters cease in equal pairs; unrelated counters are unaffected. */
export function cancelOpposingCounters(state: GameState): {
  state: GameState;
  changed: boolean;
} {
  const next = structuredClone(state);
  let changed = false;
  for (const id of [
    ...state.arena,
    ...state.environment,
    ...state.players.flatMap((player) => player.zones.ramBank),
  ]) {
    const counters = next.objects[id].counters;
    const plus = counters["+1/+1"] ?? 0,
      minus = counters["-1/-1"] ?? 0;
    if (
      !Number.isSafeInteger(plus) ||
      !Number.isSafeInteger(minus) ||
      plus < 0 ||
      minus < 0
    )
      throw new Error("Invalid opposing counter quantities");
    const pairs = Math.min(plus, minus);
    if (!pairs) continue;
    changed = true;
    for (const key of ["+1/+1", "-1/-1"]) {
      counters[key] -= pairs;
      if (!counters[key]) delete counters[key];
    }
  }
  return { state: next, changed };
}
