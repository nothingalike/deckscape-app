import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { ProgramChoices, ProgramPlayEvaluation } from "./play-program";
import type { ProgramPlayVariant } from "./program-play-option";
import type { PsychosisEvaluation } from "./psychosis";
import type { ScriptBehavior } from "./resolve-script";

export interface CombTheDesertEffects {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  canRun(state: GameState, id: string): boolean;
  psychosis: PsychosisEvaluation;
}

export function combTheDesert(effects: CombTheDesertEffects) {
  const shape = (choices: ProgramChoices) => {
    if (
      choices.reversed ||
      choices.targets.length ||
      choices.modes.length ||
      choices.mainframeTarget !== undefined ||
      choices.playerTarget !== undefined ||
      choices.x === null ||
      !Number.isSafeInteger(choices.x) ||
      choices.x < 0 ||
      !choices.runCharacters ||
      choices.runCharacters.length !== choices.x ||
      new Set(choices.runCharacters).size !== choices.runCharacters.length
    )
      throw new Error("Invalid COMB THE DESERT choices or additional cost");
    return choices.x;
  };
  const candidates = (state: GameState, sourceId: string) => {
    const current = effects.characteristics(structuredClone(state));
    return state.arena.filter((id) => {
      const object = state.objects[id],
        card = current.get(id);
      return (
        object.controller === state.objects[sourceId].controller &&
        !object.running &&
        card?.cardType === "character" &&
        card.factions.includes("DUSTRUNNER") &&
        effects.canRun(structuredClone(state), id)
      );
    });
  };
  const behavior: ScriptBehavior = {
    hasLegalTargets(_state, action) {
      shape(action.programChoices);
      return true;
    },
    resolve(state, action, resources) {
      const count = shape(action.programChoices);
      // The paid X survives later changes to the characters used for its cost.
      return resources.draw(state, action.controller, count);
    },
  };
  return {
    behavior,
    validate(state: GameState, sourceId: string, choices: ProgramChoices) {
      shape(choices);
      const available = new Set(candidates(state, sourceId));
      if (choices.runCharacters!.some((id) => !available.has(id)))
        throw new Error("COMB THE DESERT run-cost character unavailable");
    },
    runCost(
      choices: ProgramChoices,
    ): NonNullable<ProgramPlayEvaluation["runCost"]> {
      return {
        sources: [...(choices.runCharacters ?? [])],
        psychosis: effects.psychosis,
      };
    },
    variants(state: GameState, sourceId: string): ProgramPlayVariant[] {
      const available = candidates(state, sourceId);
      return [
        {
          key: "normal",
          label: "Run characters and draw X",
          modes: [],
          targets: [],
          reversed: false,
          x: { minimum: 0, maximum: available.length },
          mainframes: null,
          runCharacters: {
            label: "Run DUSTRUNNER characters",
            candidates: available,
          },
        },
      ];
    },
  };
}
