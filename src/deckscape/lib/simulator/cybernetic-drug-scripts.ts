import type { GameState } from "./game-state";
import type { ProgramChoices } from "./play-program";
import type { ScriptBehavior } from "./resolve-script";
import type { ProgramPlayVariant } from "./program-play-option";
import type { CharacterTargetEvaluation } from "./character-status-effects";
import type { Seat } from "./setup";
import { isCurrentActionTarget } from "./action-targets";
import { addUntilTurnEndStatEffect } from "./timed-stat-effects";
import { addUntilTurnEndCombatEffect } from "./timed-combat-effects";

/** STIM PACK grants +1/+1 and STAMINA to any character.
 * REDLINE and MEGAROIDS have the same owned-character and non-CYBERNETIC condition,
 * with separate reviewed values. These are continuous grants, not physical counters. */
export function cyberneticDrug(
  kind: "redline" | "megaroids" | "stim-pack",
  effects: CharacterTargetEvaluation,
) {
  const values =
    kind === "redline"
      ? { attack: 7, defence: -1, psychosis: 8 }
      : kind === "stim-pack"
        ? { attack: 1, defence: 1, psychosis: 0 }
        : { attack: 4, defence: 4, psychosis: 5 };
  const shape = (choices: ProgramChoices) => {
    if (
      choices.targets.length !== 1 ||
      choices.modes.length ||
      choices.reversed ||
      choices.x !== null ||
      choices.mainframeTarget ||
      choices.playerTarget !== undefined
    )
      throw new Error("Invalid cybernetic drug choices");
    return choices.targets[0];
  };
  const targets = (state: GameState, sourceId: string, controller: Seat) => {
    const current = effects.characteristics(structuredClone(state));
    return state.arena.filter(
      (id) =>
        current.get(id)?.cardType === "character" &&
        (kind === "stim-pack" || state.objects[id].controller === controller) &&
        effects.canTarget(structuredClone(state), sourceId, id),
    );
  };
  const behavior: ScriptBehavior = {
    hasLegalTargets(state, action) {
      const id = shape(action.programChoices);
      return (
        isCurrentActionTarget(state, action, id) &&
        targets(state, action.sourceId, action.controller).includes(id)
      );
    },
    resolve(state, action) {
      const id = shape(action.programChoices),
        current = effects.characteristics(structuredClone(state));
      const card = current.get(id);
      if (card?.cardType !== "character")
        throw new Error("Drug target characteristics unavailable");
      const amount =
        values.psychosis + (card.factions.includes("CYBERNETIC") ? 0 : 5);
      const boosted = addUntilTurnEndStatEffect(
        state,
        action.sourceId,
        id,
        {
          layer: "7d",
          operation: "add",
          attack: values.attack,
          defence: values.defence,
        },
        current,
      );
      return addUntilTurnEndCombatEffect(
        boosted,
        action.sourceId,
        id,
        kind === "stim-pack"
          ? { kind: "grant-keyword", keyword: "STAMINA" }
          : { kind: "grant-psychosis", amount },
        current,
      );
    },
  };
  return {
    behavior,
    validate(state: GameState, sourceId: string, choices: ProgramChoices) {
      if (
        !targets(state, sourceId, state.objects[sourceId].controller).includes(
          shape(choices),
        )
      )
        throw new Error("Illegal cybernetic drug target");
    },
    variants(state: GameState, sourceId: string): ProgramPlayVariant[] {
      return [
        {
          key: "normal",
          label: "Normal",
          modes: [],
          reversed: false,
          x: null,
          mainframes: null,
          targets: [
            {
              label:
                kind === "stim-pack"
                  ? "Target character"
                  : "Target character you control",
              minimum: 1,
              maximum: 1,
              candidates: targets(
                state,
                sourceId,
                state.objects[sourceId].controller,
              ),
            },
          ],
        },
      ];
    },
  };
}
