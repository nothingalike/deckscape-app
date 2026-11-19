import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { AbilityChoices } from "./activate-ability";
import type { ActivatedBehavior } from "./resolve-ability";
import type { CharacterTargetEvaluation } from "./character-status-effects";
import { isCurrentActionTarget } from "./action-targets";
import { grantProgramReplay } from "./program-replay";

export function recoveryTargets(
  state: GameState,
  player: Seat,
  sourceId: string,
  evaluated: CharacterTargetEvaluation,
): string[] {
  const cards = evaluated.characteristics(structuredClone(state));
  return state.players[player].zones.recycleBin.filter((id) => {
    const card = cards.get(id);
    if (!card) throw new Error("Recovery target characteristics unavailable");
    return (
      card.cardType === "program" &&
      card.subtype === "script" &&
      card.factions.includes("HACKER") &&
      evaluated.canTarget(structuredClone(state), sourceId, id)
    );
  });
}
export function validateRecoveryChoices(
  state: GameState,
  player: Seat,
  sourceId: string,
  choices: AbilityChoices,
  evaluated: CharacterTargetEvaluation,
): void {
  if (
    choices.targets.length !== 1 ||
    choices.modes.length ||
    choices.x !== null ||
    !recoveryTargets(state, player, sourceId, evaluated).includes(
      choices.targets[0],
    )
  )
    throw new Error("Illegal Recovery target");
}
/** Reviewed Deep Diver — RECOVERY. The ongoing permission belongs to the selected
 * object and the activating player; removing Deep Diver does not end it. */
export function deepDiverRecovery(
  evaluated: CharacterTargetEvaluation,
): ActivatedBehavior {
  return {
    hasLegalTargets(state, action) {
      const choices = action.activatedAbility.choices;
      if (
        choices.targets.length !== 1 ||
        choices.modes.length ||
        choices.x !== null
      )
        throw new Error("Invalid Recovery choices");
      return (
        isCurrentActionTarget(state, action, choices.targets[0]) &&
        recoveryTargets(
          state,
          action.controller,
          action.sourceId,
          evaluated,
        ).includes(choices.targets[0])
      );
    },
    resolve: (state, action) =>
      grantProgramReplay(
        state,
        action.controller,
        action.activatedAbility.choices.targets[0],
      ),
  };
}
