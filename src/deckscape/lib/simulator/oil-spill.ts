import {
  validateUntargetedScript,
  type ScriptBehavior,
} from "./resolve-script";
import type { CharacterCounterEffects } from "./character-counter-abilities";

export function oilSpill(
  effects: Pick<CharacterCounterEffects, "characteristics" | "putCounters">,
): ScriptBehavior {
  return {
    hasLegalTargets(_state, action) {
      validateUntargetedScript(action);
      return true;
    },
    resolve(state, action, resources) {
      validateUntargetedScript(action);
      const current = effects.characteristics(state);
      const placements = state.arena
        .filter((id) => current.get(id)?.cardType === "character")
        .map((instanceId) => ({ instanceId, counter: "-1/-1", amount: 1 }));
      let next = placements.length
        ? effects.putCounters(state, action.sourceId, placements)
        : state;
      for (let i = 0; i < 2 && !next.outcome; i++)
        next = resources.install(next, action.controller, true);
      return next;
    },
  };
}
