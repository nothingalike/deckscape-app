import type { GameState } from "./game-state";
import type { AbilityChoices } from "./activate-ability";
import type { ActivatedBehavior } from "./resolve-ability";
import type { CharacterTargetEvaluation } from "./character-status-effects";
import { isCurrentActionTarget } from "./action-targets";

export interface BloodInTheWaterEffects extends CharacterTargetEvaluation {
  /** Applies ordinary destruction prohibitions and replacements. */
  destroy(state: GameState, sourceId: string, targetId: string): GameState;
}
function target(choices: AbilityChoices): string {
  if (
    choices.targets.length !== 1 ||
    choices.modes.length ||
    choices.x !== null ||
    choices.playerTarget !== undefined
  )
    throw new Error("Invalid Blood in the Water choices");
  return choices.targets[0];
}
export function damagedCharacterTargets(
  state: GameState,
  sourceId: string,
  evaluated: CharacterTargetEvaluation,
): string[] {
  const current = evaluated.characteristics(structuredClone(state));
  return state.arena.filter(
    (id) =>
      current.get(id)?.cardType === "character" &&
      state.objects[id].lastDamagedTurn === state.turn.number &&
      evaluated.canTarget(structuredClone(state), sourceId, id),
  );
}
export function validateBloodInTheWater(
  state: GameState,
  sourceId: string,
  choices: AbilityChoices,
  evaluated: CharacterTargetEvaluation,
): void {
  if (
    !damagedCharacterTargets(state, sourceId, evaluated).includes(
      target(choices),
    )
  )
    throw new Error("Illegal Blood in the Water target");
}
export function bloodInTheWater(
  effects: BloodInTheWaterEffects,
): ActivatedBehavior {
  const behavior: ActivatedBehavior = {
    hasLegalTargets(state, action) {
      const id = target(action.activatedAbility.choices);
      return (
        isCurrentActionTarget(state, action, id) &&
        damagedCharacterTargets(state, action.sourceId, effects).includes(id)
      );
    },
    resolve(state, action) {
      if (!behavior.hasLegalTargets(state, action)) return state;
      return effects.destroy(
        state,
        action.sourceId,
        target(action.activatedAbility.choices),
      );
    },
  };
  return behavior;
}
