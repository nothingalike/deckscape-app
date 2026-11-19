import type { GameState } from "./game-state";
import { isCurrentCardSource } from "./cache-source";
import type { CardCharacteristics } from "./characteristics";
import type { ProgramChoices } from "./play-program";
import type { ProgramPlayVariant } from "./program-play-option";

export type CounterProgram = "high-priestess" | "hierophant";
export interface CounterTargetEvaluation {
  characteristics: ReadonlyMap<string, CardCharacteristics>;
  /** Current targeting restrictions, independent of whether the effect can be countered. */
  permittedTargets: ReadonlySet<string>;
}

/** Type changes, current cache membership and targeting permission are checked at
 * both announcement and resolution. An uncounterable card can still be targeted.
 */
export function counterProgramTargets(
  state: GameState,
  sourceId: string,
  program: CounterProgram,
  reversed: boolean,
  evaluated: CounterTargetEvaluation,
): string[] {
  return (state.priorityWindow?.stack ?? []).flatMap((action) => {
    const id = action.sourceId;
    if (
      action.kind !== "card" ||
      !isCurrentCardSource(state, action) ||
      id === sourceId ||
      !state.cache.includes(id) ||
      !evaluated.permittedTargets.has(id)
    )
      return [];
    const card = evaluated.characteristics.get(id);
    if (!card) throw new Error("Missing counter target characteristics");
    return program === "hierophant" ||
      card.cardType === (reversed ? "program" : "character")
      ? [id]
      : [];
  });
}

export function counterProgramHasLegalTarget(
  state: GameState,
  sourceId: string,
  program: CounterProgram,
  choices: ProgramChoices,
  evaluated: CounterTargetEvaluation,
): boolean {
  if (
    choices.targets.length !== 1 ||
    choices.modes.length ||
    choices.x !== null ||
    choices.playerTarget !== undefined ||
    choices.mainframeTarget
  )
    throw new Error("Invalid counter program choices");
  return counterProgramTargets(
    state,
    sourceId,
    program,
    choices.reversed,
    evaluated,
  ).includes(choices.targets[0]);
}

/** This permission applies when choosing reversal, not later when resolving it. */
export function validateCounterProgramChoices(
  state: GameState,
  sourceId: string,
  program: CounterProgram,
  choices: ProgramChoices,
  evaluated: CounterTargetEvaluation,
  allowReversed: boolean,
): void {
  if (choices.reversed && !allowReversed)
    throw new Error("Reversed play is not permitted");
  if (
    !counterProgramHasLegalTarget(state, sourceId, program, choices, evaluated)
  )
    throw new Error("Illegal counter program target");
}

export function counterProgramVariants(
  state: GameState,
  sourceId: string,
  program: CounterProgram,
  evaluated: CounterTargetEvaluation,
  allowReversed: boolean,
): ProgramPlayVariant[] {
  return (allowReversed ? [false, true] : [false]).map((reversed) => ({
    key: reversed ? "reversed" : "normal",
    label:
      program === "high-priestess"
        ? reversed
          ? "Reversed — counter a program"
          : "Normal — counter a character"
        : reversed
          ? "Reversed — counter unless 3 RAM is paid"
          : "Normal — counter unless 1 RAM is paid",
    modes: [],
    reversed,
    x: null,
    mainframes: null,
    targets: [
      {
        label: "Counter target",
        minimum: 1,
        maximum: 1,
        candidates: counterProgramTargets(
          state,
          sourceId,
          program,
          reversed,
          evaluated,
        ),
      },
    ],
  }));
}
