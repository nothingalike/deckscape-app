import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { ProgramChoices } from "./play-program";
import type { ProgramPlayVariant } from "./program-play-option";
import type { ScriptBehavior } from "./resolve-script";
import type { DestructionScriptEffects } from "./destruction-scripts";
import { isCurrentActionTarget } from "./action-targets";

export interface AntivirusEffects extends DestructionScriptEffects {
  /** Evaluate counter-removal restrictions/replacements for the original caster. */
  removeCounters(state: GameState, sourceId: string, player: Seat): GameState;
}

/** The mode is chosen on announcement. Removing counters does not target a
 * mainframe; destroying a program targets any program attached to your mainframe. */
export function antivirus(effects: AntivirusEffects) {
  function mode(choices: ProgramChoices): 0 | 1 {
    const selected = choices.modes[0];
    if (
      choices.modes.length !== 1 ||
      (selected !== 0 && selected !== 1) ||
      choices.targets.length !== (selected === 0 ? 1 : 0) ||
      choices.reversed ||
      choices.x !== null ||
      choices.mainframeTarget ||
      choices.playerTarget !== undefined
    )
      throw new Error("Invalid ANTIVIRUS choices");
    return selected;
  }
  function targets(state: GameState, sourceId: string, player: Seat) {
    const current = effects.characteristics(structuredClone(state)),
      mainframes = state.players[player].zones.mainframe;
    return state.arena.filter(
      (id) =>
        current.get(id)?.cardType === "program" &&
        state.objects[id].attachments.some(
          (link) =>
            link.kind === "protocol" && mainframes.includes(link.hostId),
        ) &&
        effects.canTarget(structuredClone(state), sourceId, id),
    );
  }
  const behavior: ScriptBehavior = {
    hasLegalTargets(state, action) {
      return (
        mode(action.programChoices) === 1 ||
        (isCurrentActionTarget(
          state,
          action,
          action.programChoices.targets[0],
        ) &&
          targets(state, action.sourceId, action.controller).includes(
            action.programChoices.targets[0],
          ))
      );
    },
    resolve(state, action) {
      if (!behavior.hasLegalTargets(state, action)) return state;
      return mode(action.programChoices) === 0
        ? effects.destroy(
            state,
            action.sourceId,
            action.programChoices.targets[0],
          )
        : effects.removeCounters(state, action.sourceId, action.controller);
    },
  };
  return {
    behavior,
    validate(state: GameState, sourceId: string, choices: ProgramChoices) {
      if (
        mode(choices) === 0 &&
        !targets(state, sourceId, state.objects[sourceId].controller).includes(
          choices.targets[0],
        )
      )
        throw new Error("Illegal ANTIVIRUS target");
    },
    variants(state: GameState, sourceId: string): ProgramPlayVariant[] {
      return [
        {
          key: "destroy-program",
          label: "Destroy attached program",
          modes: [0],
          reversed: false,
          x: null,
          mainframes: null,
          targets: [
            {
              label: "Program attached to your mainframe",
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
        {
          key: "remove-counters",
          label: "Remove all mainframe counters",
          modes: [1],
          reversed: false,
          x: null,
          mainframes: null,
          targets: [],
        },
      ];
    },
  };
}
