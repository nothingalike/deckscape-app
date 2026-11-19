import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import {
  validateUntargetedScript,
  type ScriptBehavior,
} from "./resolve-script";
import { evaluatePlayerSynergy } from "./synergy";

/** Reviewed MARKET MANIPULATION. X is computed at resolution, not announced or paid. */
export function marketManipulation(effects: {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
}): ScriptBehavior {
  return {
    hasLegalTargets(_state, action) {
      validateUntargetedScript(action);
      return true;
    },
    resolve(state, action, resources) {
      const count =
        evaluatePlayerSynergy(
          state,
          effects.characteristics(structuredClone(state)),
        )[action.controller].factions.CORPO ?? 0;
      // CR 119.5: fix X once, but evaluate each installation against the current state.
      let next = state;
      for (let i = 0; i < count && !next.outcome; i++) {
        next = resources.install(next, action.controller, true);
        if (next.pendingDecision)
          throw new Error(
            "Market Manipulation requires a resumable RAM replacement interpreter",
          );
      }
      return next;
    },
  };
}
