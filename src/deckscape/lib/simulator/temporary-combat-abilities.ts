import type { GameState } from "./game-state";
import type { AbilityChoices } from "./activate-ability";
import type { ActivatedBehavior } from "./resolve-ability";
import type { ActivationVariant } from "./activation-option";
import {
  characterStatusTargets,
  type CharacterTargetEvaluation,
} from "./character-status-effects";
import { isCurrentActionTarget } from "./action-targets";
import { isCurrentIncarnation } from "./object-incarnation";
import { addUntilTurnEndCombatEffect } from "./timed-combat-effects";
import { addUntilTurnEndStatEffect } from "./timed-stat-effects";

export type TemporaryCombatSpecification =
  | { kind: "stealth-self" }
  | { kind: "machina-mortis" }
  | { kind: "cannot-block"; maximumDefence: number };

export function temporaryCombatAbility(
  spec: TemporaryCombatSpecification,
  effects: CharacterTargetEvaluation,
) {
  const targets = (state: GameState, sourceId: string) => {
    if (spec.kind !== "cannot-block") return [];
    const current = effects.characteristics(structuredClone(state));
    return characterStatusTargets(state, sourceId, effects).filter((id) => {
      const card = current.get(id);
      return (
        card?.cardType === "character" && card.defence <= spec.maximumDefence
      );
    });
  };
  const shape = (choices: AbilityChoices) => {
    if (
      choices.modes.length ||
      choices.x !== null ||
      choices.playerTarget !== undefined ||
      choices.targets.length !== (spec.kind === "cannot-block" ? 1 : 0)
    )
      throw new Error("Invalid temporary combat choices");
  };
  const behavior: ActivatedBehavior = {
    hasLegalTargets(state, action) {
      const choices = action.activatedAbility.choices;
      shape(choices);
      return (
        spec.kind !== "cannot-block" ||
        (isCurrentActionTarget(state, action, choices.targets[0]) &&
          targets(state, action.sourceId).includes(choices.targets[0]))
      );
    },
    resolve(state, action) {
      const current = effects.characteristics(structuredClone(state));
      const id =
        spec.kind !== "cannot-block"
          ? action.sourceId
          : action.activatedAbility.choices.targets[0];
      if (
        spec.kind !== "cannot-block" &&
        (!isCurrentIncarnation(state, action.activatedAbility.source) ||
          !state.arena.includes(id) ||
          current.get(id)?.cardType !== "character")
      )
        return state;
      if (spec.kind === "machina-mortis") {
        const boosted = addUntilTurnEndStatEffect(
          state,
          action.sourceId,
          id,
          { layer: "7d", operation: "add", attack: 2, defence: 0 },
          current,
        );
        return addUntilTurnEndCombatEffect(
          boosted,
          action.sourceId,
          id,
          { kind: "grant-character-hit-copy" },
          current,
        );
      }
      return addUntilTurnEndCombatEffect(
        state,
        action.sourceId,
        id,
        spec.kind === "stealth-self"
          ? { kind: "grant-keyword", keyword: "STEALTH" }
          : { kind: "cannot-block" },
        current,
      );
    },
  };
  return {
    behavior,
    validate(state: GameState, sourceId: string, choices: AbilityChoices) {
      shape(choices);
      if (
        spec.kind === "cannot-block" &&
        !targets(state, sourceId).includes(choices.targets[0])
      )
        throw new Error("Illegal temporary combat target");
    },
    variant(state: GameState, sourceId: string): ActivationVariant {
      return {
        key: "normal",
        label: "Normal",
        modes: [],
        x: null,
        targets:
          spec.kind === "cannot-block"
            ? [
                {
                  label: `Character with ${spec.maximumDefence} or less defense`,
                  minimum: 1,
                  maximum: 1,
                  candidates: targets(state, sourceId),
                },
              ]
            : [],
      };
    },
  };
}
