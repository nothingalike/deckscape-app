import type { GameState } from "./game-state";
import type { AbilityChoices } from "./activate-ability";
import type { ActivatedBehavior } from "./resolve-ability";
import type { CharacterTargetEvaluation } from "./character-status-effects";
import { isCurrentActionTarget } from "./action-targets";

export interface SeveranceEffects extends CharacterTargetEvaluation {
  /** Current keyword evaluator, including grants and removals; link count is not proof of TETHER. */
  tether(state: GameState, id: string): boolean;
  destroy(state: GameState, sourceId: string, id: string): GameState;
}
function target(choices: AbilityChoices) {
  if (
    choices.targets.length !== 1 ||
    choices.modes.length ||
    choices.x !== null ||
    choices.playerTarget !== undefined
  )
    throw new Error("Invalid Severance choices");
  return choices.targets[0];
}
export function severanceTargets(
  state: GameState,
  sourceId: string,
  effects: SeveranceEffects,
) {
  const current = effects.characteristics(structuredClone(state));
  return state.arena.filter(
    (id) =>
      current.get(id)?.cardType === "gear" &&
      effects.tether(structuredClone(state), id) &&
      effects.canTarget(structuredClone(state), sourceId, id),
  );
}
export function severance(effects: SeveranceEffects) {
  const behavior: ActivatedBehavior = {
    hasLegalTargets: (state, action) =>
      isCurrentActionTarget(
        state,
        action,
        target(action.activatedAbility.choices),
      ) &&
      severanceTargets(state, action.sourceId, effects).includes(
        target(action.activatedAbility.choices),
      ),
    resolve: (state, action) =>
      effects.destroy(
        state,
        action.sourceId,
        target(action.activatedAbility.choices),
      ),
  };
  return {
    behavior,
    validate(state: GameState, sourceId: string, choices: AbilityChoices) {
      if (!severanceTargets(state, sourceId, effects).includes(target(choices)))
        throw new Error("Illegal Severance target");
    },
  };
}
