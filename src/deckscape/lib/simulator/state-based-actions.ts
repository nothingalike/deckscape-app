import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { SettlementRuntime } from "./settle";
import {
  performPersistentStateActions,
  type PersistentStateActionRuntime,
} from "./persistent-state-actions";
import { normalizeRamCommitments } from "./ram-state-actions";
import { cancelOpposingCounters } from "./counter-state-actions";
import { ceaseDepartedTokens } from "./token-lifecycle";
import { beginRamBalance } from "./ram-balance";
import { playersAtZeroHealth } from "./health";

export interface StateBasedActionRuntime extends PersistentStateActionRuntime {
  continuous?(state: GameState): { state: GameState; changed: boolean };
  /** Required loss-replacement boundary, evaluated before any losing player's
   * permanents depart. May replace the loss, prevent it, or apply simultaneous losses.
   */
  healthLoss(
    state: GameState,
    candidates: readonly Seat[],
  ): ReturnType<SettlementRuntime["stateBasedActions"]>;
}

/** Compose the implemented departure, commitment, counter and token checks. Settlement
 * repeats until stable before dispatching pending events or offering priority. Required
 * card-specific checks (e.g. face-down exceptions/replacements) still belong to the pinned
 * runtime; this runner is not a declaration that a card pool has complete rules support.
 */
export function createStateBasedActionRunner(
  runtime: StateBasedActionRuntime,
): SettlementRuntime["stateBasedActions"] {
  return (state: GameState) => {
    if (!state.outcome && !state.pendingDecision && runtime.continuous) {
      const result = runtime.continuous(state);
      if (result.changed) return { ...result, decisionPending: false };
    }
    if (!state.outcome && !state.pendingDecision) {
      const candidates = playersAtZeroHealth(state);
      if (candidates.length) {
        const loss = runtime.healthLoss(structuredClone(state), candidates);
        if (loss.state.outcome || loss.changed || loss.decisionPending)
          return loss;
        state = loss.state;
      }
    }
    const persistent = performPersistentStateActions(state, runtime);
    if (
      persistent.state.outcome ||
      persistent.changed ||
      persistent.decisionPending
    )
      return persistent;
    let next = persistent.state;
    const normalized = normalizeRamCommitments(
      next,
      runtime.evaluate(structuredClone(next)).characteristics,
    );
    if (normalized.changed) return { ...normalized, decisionPending: false };
    next = normalized.state;
    const counters = cancelOpposingCounters(next);
    if (counters.changed) return { ...counters, decisionPending: false };
    const tokens = ceaseDepartedTokens(counters.state);
    if (tokens.changed) return { ...tokens, decisionPending: false };
    next = tokens.state;
    // Each player's commitments draw only from their own bank. The active player handles
    // their choice first, with the other player's requirements reevaluated on resumption.
    for (const player of [
      next.turn.activePlayer,
      (1 - next.turn.activePlayer) as Seat,
    ]) {
      next = beginRamBalance(next, player, {
        characteristics: runtime.evaluate(structuredClone(next))
          .characteristics,
      });
      if (next.pendingDecision)
        return { state: next, changed: false, decisionPending: true };
    }
    return { state: next, changed: false, decisionPending: false };
  };
}
