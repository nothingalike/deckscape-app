import type { ScriptBehavior } from "./resolve-script";
import { isCurrentActionTarget } from "./action-targets";
import {
  characterStatusTargets,
  type CharacterTargetEvaluation,
} from "./character-status-effects";
import type { WonderlandSizeEvaluation } from "./wonderland-size-scripts";
import { captureEventObservation } from "./event-observation";

export function throughLookingGlass(
  effects: CharacterTargetEvaluation &
    Pick<WonderlandSizeEvaluation, "putCounters">,
): ScriptBehavior {
  return {
    hasLegalTargets(state, action) {
      const id = action.programChoices.targets[0];
      return (
        isCurrentActionTarget(state, action, id) &&
        characterStatusTargets(state, action.sourceId, effects).includes(id)
      );
    },
    resolve(state, action) {
      const id = action.programChoices.targets[0];
      const count = state.objects[id].counters.INVERT ?? 0;
      if (count === 0)
        return effects.putCounters(state, action.sourceId, [
          { instanceId: id, counter: "INVERT", amount: 1 },
        ]);
      const next = structuredClone(state);
      if (count === 1) delete next.objects[id].counters.INVERT;
      else next.objects[id].counters.INVERT = count - 1;
      next.pendingRuleEvents.push({
        type: "counters-removed",
        sourceId: action.sourceId,
        instanceId: id,
        player: next.objects[id].controller,
        counter: "INVERT",
        amount: 1,
        ...captureEventObservation(next),
      });
      return next;
    },
  };
}
