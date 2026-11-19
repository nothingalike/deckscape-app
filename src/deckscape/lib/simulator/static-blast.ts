import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { ProgramChoices } from "./play-program";
import type { ProgramPlayVariant } from "./program-play-option";
import type { ScriptAction, ScriptBehavior } from "./resolve-script";
import type { Seat } from "./setup";
import type { CombatDamagePacket } from "./combat-damage";

import type { OverloadEffects } from "./overload";

/** The player is targeted; their current characters receive a single damage batch. */
export function staticBlast(effects: OverloadEffects) {
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
      throw new Error("Invalid Static Blast choices");
  };
  const legal = (
    state: GameState,
    sourceId: string,
    choices: ProgramChoices,
  ) => {
    checkShape(choices);
    return players(state, sourceId).includes(choices.playerTarget!);
  };
  const packets = (
    state: GameState,
    action: ScriptAction,
  ): CombatDamagePacket[] => {
    const choices = action.programChoices;
    if (!legal(state, action.sourceId, choices)) return [];
    const common = {
      sourceId: action.sourceId,
      channel: "MF" as const,
      amount: 1,
    };
    const current = effects.characteristics(state);
    return state.arena
      .filter(
        (id) =>
          current.get(id)?.cardType === "character" &&
          state.objects[id].controller === choices.playerTarget,
      )
      .map((instanceId) => ({
        ...common,
        recipient: "character" as const,
        instanceId,
      }));
  };
  const behavior: ScriptBehavior = {
    hasLegalTargets: (state, action) =>
      legal(state, action.sourceId, action.programChoices),
    resolve(state, action) {
      const batch = packets(state, action);
      if (!batch.length) return state;
      const source = effects
        .characteristics(structuredClone(state))
        .get(action.sourceId);
      if (!source)
        throw new Error("Static Blast source characteristics unavailable");
      return effects.damage(state, batch, structuredClone(source));
    },
  };
  return {
    behavior,
    validate(state: GameState, sourceId: string, choices: ProgramChoices) {
      if (!legal(state, sourceId, choices))
        throw new Error("Illegal Static Blast target");
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
