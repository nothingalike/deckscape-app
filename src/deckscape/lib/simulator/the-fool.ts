import { validateWonderlandSizeChoices as validateUntargetedScript } from "./wonderland-size-scripts";
import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { PhishingEffects } from "./phishing";
import { finishScriptResolution, type ScriptBehavior } from "./resolve-script";
import {
  validateHandChoiceContinuation,
  type HandChoiceEvaluation,
} from "./hand-choice";

export function theFool(
  effects: Pick<PhishingEffects, "characteristics" | "discard"> & {
    draw(state: GameState, player: Seat, count: number): GameState;
  },
) {
  const handler = "script/the-fool";
  const behavior: ScriptBehavior = {
    hasLegalTargets(_state, action) {
      validateUntargetedScript(action.programChoices);
      return true;
    },
    resolve(state, action) {
      const next = effects.draw(structuredClone(state), action.controller, 1);
      if (next.pendingDecision)
        throw Error("Fool draw requires a replacement continuation");
      const inspected = [...next.players[action.controller].zones.hand];
      if (next.outcome || !inspected.length) return next;
      next.pendingDecision = {
        type: "hand-choice",
        id: `hand:${action.id}`,
        actionId: action.id,
        sourceId: action.sourceId,
        handler,
        player: action.controller,
        targetPlayer: action.controller,
        inspected,
        incarnations: Object.fromEntries(
          inspected.map((id) => [id, next.objects[id].incarnation]),
        ),
      };
      validateHandChoiceContinuation(next);
      return next;
    },
  };
  return {
    behavior,
    choice(state: GameState): HandChoiceEvaluation {
      const decision = validateHandChoiceContinuation(state);
      if (decision.handler !== handler) throw Error("Wrong Fool continuation");
      validateUntargetedScript(
        state.priorityWindow!.resolving!.programChoices!,
      );
      return {
        characteristics: effects.characteristics(state),
        complete(snapshot, saved, selected) {
          const next = effects.discard(
            snapshot,
            saved.sourceId,
            saved.player,
            selected,
          );
          if (next.pendingDecision)
            throw Error("Fool discard requires a replacement continuation");
          return finishScriptResolution(next);
        },
      };
    },
  };
}
