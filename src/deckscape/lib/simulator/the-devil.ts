import type { StrengthEvaluation } from "./strength";
import { strengthScript } from "./strength";
import type { ScriptBehavior } from "./resolve-script";
import { addUntilTurnEndCombatEffect } from "./timed-combat-effects";

export function theDevil(e: StrengthEvaluation): ScriptBehavior {
  return {
    hasLegalTargets: strengthScript(e).hasLegalTargets,
    resolve(s, action) {
      const id = action.programChoices.targets[0],
        current = e.characteristics(s);
      const next = addUntilTurnEndCombatEffect(
        s,
        action.sourceId,
        id,
        {
          kind: "grant-psychosis",
          amount: action.programChoices.reversed ? 15 : 10,
        },
        current,
      );
      return addUntilTurnEndCombatEffect(
        next,
        action.sourceId,
        id,
        { kind: "must-attack" },
        current,
      );
    },
  };
}
