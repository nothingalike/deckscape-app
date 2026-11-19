import type { GameState } from "./game-state";
import type { TimedStatEffect } from "./timed-stat-effects";

export function statEffectActive(
  state: GameState,
  effect: TimedStatEffect,
): boolean {
  return (
    (effect.targetId === null || state.arena.includes(effect.targetId)) &&
    (effect.targetIncarnation === undefined ||
      (effect.targetId !== null &&
        state.objects[effect.targetId]?.incarnation ===
          effect.targetIncarnation)) &&
    (effect.expiresAfterTurn === null
      ? state.arena.includes(effect.sourceId) &&
        state.objects[effect.sourceId]?.incarnation === effect.sourceIncarnation
      : effect.expiresAfterTurn >= state.turn.number)
  );
}
