import type { GameState } from "./game-state";
import type { ProgramChoices } from "./program-choices";
import type { ScriptBehavior } from "./resolve-script";
import {
  characterDestructionCost,
  type CharacterDestructionCostEffects,
} from "./character-destruction-cost";
import {
  counterProgramTargets,
  counterProgramHasLegalTarget,
  type CounterTargetEvaluation,
} from "./counter-program-choices";
import { isCurrentActionTarget } from "./action-targets";
export function theHangedMan(
  e: CharacterDestructionCostEffects,
  targets: (s: GameState, id: string) => CounterTargetEvaluation,
  counter: (s: GameState, action: string, source: string) => GameState,
) {
  const cost = (id: string) => characterDestructionCost(e, id, "MYSTIC");
  const shape = (c: ProgramChoices) => {
    if (
      c.reversed ||
      c.sacrificeCharacters?.length !== 1 ||
      c.cacheActionId !== undefined ||
      c.runCharacters !== undefined
    )
      throw Error("Invalid Hanged Man choices");
  };
  const behavior: ScriptBehavior = {
    hasLegalTargets(s, a) {
      shape(a.programChoices);
      return (
        isCurrentActionTarget(s, a, a.programChoices.targets[0]) &&
        counterProgramHasLegalTarget(
          s,
          a.sourceId,
          "hierophant",
          a.programChoices,
          targets(s, a.sourceId),
        )
      );
    },
    resolve(s, a) {
      const target = s.priorityWindow!.stack.find(
        (x) => x.kind === "card" && x.sourceId === a.programChoices.targets[0],
      )!;
      return counter(s, target.id, a.sourceId);
    },
  };
  return {
    behavior,
    cost,
    validate(s: GameState, id: string, c: ProgramChoices) {
      shape(c);
      cost(id).validate(s, c);
      if (!counterProgramHasLegalTarget(s, id, "hierophant", c, targets(s, id)))
        throw Error("Invalid counter target");
    },
    variants(s: GameState, id: string) {
      return [
        {
          key: "normal",
          label: "Counter a card; destroy a MYSTIC character",
          modes: [],
          reversed: false,
          x: null,
          mainframes: null,
          targets: [
            {
              label: "Card to counter",
              minimum: 1,
              maximum: 1,
              candidates: counterProgramTargets(
                s,
                id,
                "hierophant",
                false,
                targets(s, id),
              ),
            },
            {
              label: "MYSTIC character to destroy",
              purpose: "sacrifice-character" as const,
              minimum: 1,
              maximum: 1,
              candidates: cost(id).candidates(s),
            },
          ],
        },
      ];
    },
  };
}
