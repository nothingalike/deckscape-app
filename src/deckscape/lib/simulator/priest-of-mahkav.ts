import type { AbilityChoices } from "./ability-choices";
import type { ActivatedBehavior } from "./resolve-ability";
import type { GameState } from "./game-state";
import {
  characterDestructionCost,
  type CharacterDestructionCostEffects,
} from "./character-destruction-cost";
import { addUntilTurnEndStatEffect } from "./timed-stat-effects";
export function priestOfMahkav(e: CharacterDestructionCostEffects) {
  const shape = (c: AbilityChoices) => {
    if (
      c.targets.length ||
      c.modes.length ||
      c.x !== null ||
      c.playerTarget !== undefined ||
      c.sacrificeRam !== undefined ||
      c.cacheActionId !== undefined ||
      c.sacrificeCharacters?.length !== 1
    )
      throw Error("Invalid SACRIFICIAL OFFERING choices");
  };
  const cost = (id: string) => characterDestructionCost(e, id, undefined, true);
  const behavior: ActivatedBehavior = {
    hasLegalTargets: () => true,
    resolve(s, a) {
      shape(a.activatedAbility.choices);
      const cards = e.characteristics(s);
      let next = s;
      for (const id of s.arena) {
        const c = cards.get(id);
        if (
          s.objects[id].controller === a.controller &&
          c?.cardType === "character" &&
          c.factions.includes("DUSTRUNNER")
        )
          next = addUntilTurnEndStatEffect(
            next,
            a.sourceId,
            id,
            { layer: "7d", operation: "add", attack: 3, defence: 3 },
            cards,
          );
      }
      return next;
    },
  };
  return {
    cost,
    behavior,
    validate(s: GameState, id: string, c: AbilityChoices) {
      shape(c);
      cost(id).validate(s, c);
    },
    variants(s: GameState, id: string) {
      return [
        {
          key: "normal",
          label: "Sacrificial Offering",
          modes: [],
          x: null,
          targets: [
            {
              label: "Destroy another character",
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
