import {
  validateUntargetedScript,
  type ScriptBehavior,
} from "./resolve-script";
import { preventAllDamageUntilTurnEnd } from "./timed-damage-prevention";

export const quantumEncryption: ScriptBehavior = {
  hasLegalTargets(_state, action) {
    validateUntargetedScript(action);
    return true;
  },
  resolve(state, action) {
    validateUntargetedScript(action);
    return preventAllDamageUntilTurnEnd(state, action.sourceId);
  },
};
