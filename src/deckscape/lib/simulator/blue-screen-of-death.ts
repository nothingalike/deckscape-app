import type { GameState } from "./game-state";
import type { ProgramChoices } from "./play-program";
import type { ProgramPlayVariant } from "./program-play-option";
import type { ScriptBehavior } from "./resolve-script";
import type { Seat } from "./setup";

/** UNSTABLE resolves immediately through the same roll procedure as system check. */
export interface BlueScreenEffects {
  canTargetPlayer(state: GameState, sourceId: string, player: Seat): boolean;
  resolve(state: GameState, player: Seat): GameState;
}
export function blueScreenOfDeath(effects: BlueScreenEffects) {
  const players = (state: GameState, sourceId: string) =>
    ([0, 1] as const).filter((player) =>
      effects.canTargetPlayer(structuredClone(state), sourceId, player),
    );
  const checkShape = (choices: ProgramChoices) => {
    if (
      choices.reversed ||
      choices.modes.length ||
      choices.x !== null ||
      choices.mainframeTarget ||
      choices.targets.length !== 0 ||
      (choices.playerTarget !== 0 && choices.playerTarget !== 1)
    )
      throw new Error("Invalid Blue Screen of Death choices");
  };
  const legal = (
    state: GameState,
    sourceId: string,
    choices: ProgramChoices,
  ) => {
    checkShape(choices);
    return players(state, sourceId).includes(choices.playerTarget!);
  };
  const behavior: ScriptBehavior = {
    hasLegalTargets: (state, action) =>
      legal(state, action.sourceId, action.programChoices),
    resolve(state, action) {
      return effects.resolve(state, action.programChoices.playerTarget!);
    },
  };
  return {
    behavior,
    validate(state: GameState, sourceId: string, choices: ProgramChoices) {
      if (!legal(state, sourceId, choices))
        throw new Error("Illegal Blue Screen of Death target");
    },
    variants(state: GameState, sourceId: string): ProgramPlayVariant[] {
      const base = { modes: [], reversed: false, x: null, mainframes: null };
      return [
        {
          ...base,
          key: "player",
          label: "Target a player",
          targets: [],
          playerTargets: players(state, sourceId).map((player) => ({
            player,
            label:
              player === state.objects[sourceId].controller
                ? "You"
                : "Opponent",
          })),
        },
      ];
    },
  };
}
