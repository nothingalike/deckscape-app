import type { AbilityChoices } from "./activate-ability";
import type { ActivationVariant } from "./activation-option";
import { isCurrentActionTarget } from "./action-targets";
import {
  destructionScriptTargets,
  type DestructionScriptEffects,
} from "./destruction-scripts";
import type { GameState } from "./game-state";
import type { ActivatedBehavior } from "./resolve-ability";
import { isCurrentIncarnation } from "./object-incarnation";
import { addUntilTurnEndStatEffect } from "./timed-stat-effects";
import { addUntilTurnEndCombatEffect } from "./timed-combat-effects";

export const isThrasherAbility = (id: string) =>
  [
    "bass-face",
    "count-in",
    "facemelting-solo",
    "blood-thirst",
    "guttural-roar",
    "savage-mindscape",
  ].includes(id);
export function thrasherAbility(id: string, effects: DestructionScriptEffects) {
  if (!isThrasherAbility(id)) throw Error("Unknown Thrasher activation");
  const targeted = id === "bass-face" || id === "blood-thirst";
  function shape(choices: AbilityChoices) {
    if (
      choices.targets.length !== (targeted ? 1 : 0) ||
      choices.modes.length ||
      choices.x !== null ||
      choices.playerTarget !== undefined
    )
      throw Error("Invalid Thrasher ability choices");
  }
  const targets = (s: GameState, sourceId: string) =>
    destructionScriptTargets(
      s,
      sourceId,
      id === "blood-thirst" ? "character" : "program",
      effects,
    ).filter((target) => id !== "blood-thirst" || s.objects[target].running);
  const behavior: ActivatedBehavior = {
    hasLegalTargets(s, a) {
      shape(a.activatedAbility.choices);
      return (
        !targeted ||
        (isCurrentActionTarget(s, a, a.activatedAbility.choices.targets[0]) &&
          targets(s, a.sourceId).includes(
            a.activatedAbility.choices.targets[0],
          ))
      );
    },
    resolve(s, a) {
      if (targeted)
        return effects.destroy(
          s,
          a.sourceId,
          a.activatedAbility.choices.targets[0],
        );
      const current = effects.characteristics(s);
      let next = s;
      for (const targetId of s.arena) {
        const c = current.get(targetId);
        if (c?.cardType !== "character") continue;
        const thrasher = c.factions.includes("THRASHER");
        if (id === "savage-mindscape") {
          if (!thrasher)
            next = addUntilTurnEndCombatEffect(
              next,
              a.sourceId,
              targetId,
              { kind: "grant-psychosis", amount: 10 },
              current,
            );
          continue;
        }
        if (id === "guttural-roar") {
          if (!thrasher || s.objects[targetId].controller !== a.controller)
            continue;
          next = addUntilTurnEndStatEffect(
            next,
            a.sourceId,
            targetId,
            { layer: "7d", operation: "add", attack: 2, defence: 0 },
            current,
          );
          next = addUntilTurnEndCombatEffect(
            next,
            a.sourceId,
            targetId,
            { kind: "grant-keyword", keyword: "OVERRUN" },
            current,
          );
          continue;
        }
        if (
          id === "count-in" &&
          (!thrasher ||
            s.objects[targetId].controller !== a.controller ||
            (targetId === a.sourceId &&
              isCurrentIncarnation(s, a.activatedAbility.source)))
        )
          continue;
        next = addUntilTurnEndStatEffect(
          next,
          a.sourceId,
          targetId,
          {
            layer: "7d",
            operation: "add",
            attack: id === "count-in" ? 1 : thrasher ? 2 : -1,
            defence: id === "count-in" ? 1 : thrasher ? 0 : -1,
          },
          current,
        );
      }
      return next;
    },
  };
  return {
    behavior,
    validate(s: GameState, sourceId: string, choices: AbilityChoices) {
      shape(choices);
      if (targeted && !targets(s, sourceId).includes(choices.targets[0]))
        throw Error("Illegal destruction target");
    },
    variants(s: GameState, sourceId: string): ActivationVariant[] {
      return [
        {
          key: "normal",
          label: "Normal",
          modes: [],
          x: null,
          targets: targeted
            ? [
                {
                  label:
                    id === "blood-thirst"
                      ? "Target running character"
                      : "Target program",
                  minimum: 1,
                  maximum: 1,
                  candidates: targets(s, sourceId),
                },
              ]
            : [],
        },
      ];
    },
  };
}
