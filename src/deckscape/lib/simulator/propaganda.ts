import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { ProgramChoices } from "./program-choices";
import type { ProgramPlayVariant } from "./program-play-option";
import { finishScriptResolution, type ScriptBehavior } from "./resolve-script";
import { isCurrentActionTarget } from "./action-targets";
import {
  validateRetargetChoiceContinuation,
  type RetargetChoiceEvaluation,
} from "./retarget-choice";
import type { ProgramRetargetSelection } from "./retarget-program";

export interface PropagandaEffects {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  canTarget(state: GameState, sourceId: string, targetId: string): boolean;
  options(state: GameState, targetActionId: string): ProgramRetargetSelection[];
  retarget(
    state: GameState,
    targetActionId: string,
    selection: ProgramRetargetSelection,
  ): GameState;
}

export function propaganda(effects: PropagandaEffects) {
  const target = (choices: ProgramChoices) => {
    if (
      choices.targets.length !== 1 ||
      choices.modes.length ||
      choices.reversed ||
      choices.x !== null ||
      choices.mainframeTarget !== undefined ||
      choices.playerTarget !== undefined ||
      choices.runCharacters?.length
    )
      throw new Error("Invalid PROPAGANDA choices");
    return choices.targets[0];
  };
  const pending = (state: GameState, sourceId: string, targetId: string) => {
    if (
      sourceId === targetId ||
      !state.cache.includes(targetId) ||
      state.objects[targetId]?.faceDown ||
      effects.characteristics(state).get(targetId)?.cardType !== "program" ||
      !effects.canTarget(state, sourceId, targetId)
    )
      return undefined;
    return state.priorityWindow?.stack.find(
      (a) =>
        a.kind === "card" &&
        a.sourceId === targetId &&
        a.programChoices &&
        a.sourceIncarnation === state.objects[targetId].incarnation,
    );
  };
  const behavior: ScriptBehavior = {
    hasLegalTargets(state, action) {
      const id = target(action.programChoices);
      return (
        !!pending(state, action.sourceId, id) &&
        isCurrentActionTarget(state, action, id)
      );
    },
    resolve(state, action) {
      const id = target(action.programChoices),
        original = pending(state, action.sourceId, id);
      if (!original || !isCurrentActionTarget(state, action, id)) return state;
      const options = effects.options(structuredClone(state), original.id);
      if (!options.length) return state;
      if (state.pendingDecision)
        throw new Error("Another resolution decision is pending");
      const next = structuredClone(state);
      next.pendingDecision = {
        type: "retarget-program",
        id: `retarget:${action.id}`,
        actionId: action.id,
        sourceId: action.sourceId,
        targetActionId: original.id,
        player: action.controller,
        options: structuredClone(options),
      };
      validateRetargetChoiceContinuation(next);
      return next;
    },
  };
  return {
    behavior,
    validate(state: GameState, sourceId: string, choices: ProgramChoices) {
      if (!pending(state, sourceId, target(choices)))
        throw new Error("Illegal PROPAGANDA target");
    },
    variants(state: GameState, sourceId: string): ProgramPlayVariant[] {
      return [
        {
          key: "normal",
          label: "Change program targets",
          modes: [],
          reversed: false,
          x: null,
          mainframes: null,
          targets: [
            {
              label: "Program on the cache",
              minimum: 1,
              maximum: 1,
              candidates: state.cache.filter((id) =>
                pending(state, sourceId, id),
              ),
            },
          ],
        },
      ];
    },
    choice(state: GameState): RetargetChoiceEvaluation {
      const saved = validateRetargetChoiceContinuation(state);
      target(state.priorityWindow!.resolving!.programChoices!);
      return {
        characteristics: effects.characteristics(state),
        options: effects.options,
        complete(snapshot, decision, selected) {
          if (
            decision.actionId !== saved.actionId ||
            decision.targetActionId !== saved.targetActionId
          )
            throw new Error("Wrong PROPAGANDA continuation");
          return finishScriptResolution(
            effects.retarget(snapshot, decision.targetActionId, selected),
          );
        },
      };
    },
  };
}
