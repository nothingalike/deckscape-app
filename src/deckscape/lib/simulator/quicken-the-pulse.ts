import type { ActivatedBehavior } from "./resolve-ability";
import { validateUntargetedCharacterEffect } from "./character-sweep-effects";
import { addUntilTurnEndEnvironmentTrigger } from "./timed-trigger-effects";

/** Reviewed Ashara activation. Applies to qualifying environments controlled by
 * either player, including ones that enter after this activation resolves. */
export const quickenThePulse: ActivatedBehavior = {
  hasLegalTargets(_state, action) {
    validateUntargetedCharacterEffect(action.activatedAbility.choices);
    return true;
  },
  resolve: (state, action) =>
    addUntilTurnEndEnvironmentTrigger(state, action.sourceId, "DUSTRUNNER"),
};
