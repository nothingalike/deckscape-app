import type { GameState } from "./game-state";
import { isCurrentActionTarget } from "./action-targets";
import type { CardCharacteristics } from "./characteristics";
import type { ProgramChoices } from "./play-program";
import type { ScriptBehavior } from "./resolve-script";
import { addUntilTurnEndStatEffect } from "./timed-stat-effects";

export interface StrengthEvaluation {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  canTarget(state: GameState, sourceId: string, targetId: string): boolean;
}
function requireChoices(choices: ProgramChoices): string {
  if (
    choices.targets.length !== 1 ||
    choices.modes.length ||
    choices.x !== null ||
    choices.playerTarget !== undefined ||
    choices.mainframeTarget
  )
    throw new Error("Invalid Strength choices");
  return choices.targets[0];
}
function legal(
  state: GameState,
  sourceId: string,
  targetId: string,
  evaluated: StrengthEvaluation,
): boolean {
  return (
    state.arena.includes(targetId) &&
    evaluated.characteristics(structuredClone(state)).get(targetId)
      ?.cardType === "character" &&
    evaluated.canTarget(structuredClone(state), sourceId, targetId)
  );
}
export function validateStrengthChoices(
  state: GameState,
  sourceId: string,
  choices: ProgramChoices,
  evaluated: StrengthEvaluation,
): void {
  if (!legal(state, sourceId, requireChoices(choices), evaluated))
    throw new Error("Illegal Strength target");
}

export function strengthTargets(
  state: GameState,
  sourceId: string,
  evaluated: StrengthEvaluation,
): string[] {
  return state.arena.filter((id) => legal(state, sourceId, id, evaluated));
}

/** Reviewed GEN Strength: target character gets +2/+2 until turn end; reversed -2/-2.
 * Reversal is captured at announcement. No controller restriction or card-only restriction.
 */
export function strengthScript(evaluated: StrengthEvaluation): ScriptBehavior {
  return {
    hasLegalTargets: (state, action) =>
      isCurrentActionTarget(
        state,
        action,
        requireChoices(action.programChoices),
      ) &&
      legal(
        state,
        action.sourceId,
        requireChoices(action.programChoices),
        evaluated,
      ),
    resolve(state, action) {
      const amount = action.programChoices.reversed ? -2 : 2;
      return addUntilTurnEndStatEffect(
        state,
        action.sourceId,
        action.programChoices.targets[0],
        { layer: "7d", operation: "add", attack: amount, defence: amount },
        evaluated.characteristics(structuredClone(state)),
      );
    },
  };
}
