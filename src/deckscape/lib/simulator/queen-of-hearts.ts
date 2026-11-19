import type { AbilityChoices } from "./activate-ability";
import type { ActivationVariant } from "./activation-option";
import type { GameState } from "./game-state";
import type { ActivatedBehavior, ActivatedAction } from "./resolve-ability";
import { isCurrentActionTarget } from "./action-targets";
import {
  destructionScriptTargets,
  type DestructionScriptEffects,
} from "./destruction-scripts";

export function offWithTheirHeads(
  effects: Pick<DestructionScriptEffects, "characteristics" | "canTarget"> & {
    destroyBatch(
      state: GameState,
      sourceId: string,
      ids: readonly string[],
    ): GameState;
  },
) {
  const shape = (choices: AbilityChoices) => {
    if (
      choices.targets.length > 2 ||
      new Set(choices.targets).size !== choices.targets.length ||
      choices.modes.length ||
      choices.x !== null ||
      choices.playerTarget !== undefined
    )
      throw Error("Invalid OFF WITH THEIR HEADS choices");
  };
  const candidates = (state: GameState, id: string) =>
    destructionScriptTargets(state, id, "character", effects);
  const legal = (state: GameState, action: ActivatedAction) => {
    shape(action.activatedAbility.choices);
    const allowed = new Set(candidates(state, action.sourceId));
    return action.activatedAbility.choices.targets.filter(
      (id) => allowed.has(id) && isCurrentActionTarget(state, action, id),
    );
  };
  const behavior: ActivatedBehavior = {
    hasLegalTargets: (state, action) =>
      legal(state, action).length > 0 ||
      action.activatedAbility.choices.targets.length === 0,
    resolve(state, action) {
      const ids = legal(state, action);
      return ids.length
        ? effects.destroyBatch(state, action.sourceId, ids)
        : state;
    },
  };
  return {
    behavior,
    validate(state: GameState, id: string, choices: AbilityChoices) {
      shape(choices);
      const allowed = new Set(candidates(state, id));
      if (choices.targets.some((target) => !allowed.has(target)))
        throw Error("Illegal character destruction target");
    },
    variant(state: GameState, id: string): ActivationVariant {
      return {
        key: "normal",
        label: "Up to two characters",
        modes: [],
        x: null,
        targets: [
          {
            label: "Characters to destroy",
            minimum: 0,
            maximum: 2,
            candidates: candidates(state, id),
          },
        ],
      };
    },
  };
}
