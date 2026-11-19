import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { ProgramChoices } from "./play-program";
import type { ProgramPlayVariant } from "./program-play-option";
import type { ScriptAction, ScriptBehavior } from "./resolve-script";
import type { Seat } from "./setup";
import type { CombatDamagePacket } from "./combat-damage";
import { isCurrentActionTarget } from "./action-targets";

export interface OverloadEffects {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  canTarget(state: GameState, sourceId: string, targetId: string): boolean;
  canTargetPlayer(state: GameState, sourceId: string, player: Seat): boolean;
  /** Apply the shared damage replacement/prevention evaluator before applying this batch. */
  damage(
    state: GameState,
    packets: readonly CombatDamagePacket[],
    source: CardCharacteristics,
  ): GameState;
}

/** Reviewed OVERLOAD MK. I / MK. II: two/four MF damage to one character or player. */
export function overload(amount: 2 | 4, effects: OverloadEffects) {
  const characters = (state: GameState, sourceId: string) => {
    const current = effects.characteristics(structuredClone(state));
    return state.arena.filter(
      (id) =>
        current.get(id)?.cardType === "character" &&
        effects.canTarget(structuredClone(state), sourceId, id),
    );
  };
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
      (choices.playerTarget === undefined
        ? choices.targets.length !== 1
        : choices.targets.length !== 0 ||
          (choices.playerTarget !== 0 && choices.playerTarget !== 1))
    )
      throw new Error("Invalid Overload choices");
  };
  const legal = (
    state: GameState,
    sourceId: string,
    choices: ProgramChoices,
  ) => {
    checkShape(choices);
    return choices.playerTarget === undefined
      ? characters(state, sourceId).includes(choices.targets[0])
      : players(state, sourceId).includes(choices.playerTarget);
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
      amount,
    };
    if (choices.playerTarget !== undefined)
      return [{ ...common, recipient: "player", player: choices.playerTarget }];
    return isCurrentActionTarget(state, action, choices.targets[0])
      ? [{ ...common, recipient: "character", instanceId: choices.targets[0] }]
      : [];
  };
  const behavior: ScriptBehavior = {
    hasLegalTargets: (state, action) => packets(state, action).length > 0,
    resolve(state, action) {
      const batch = packets(state, action);
      if (!batch.length) return state;
      const source = effects
        .characteristics(structuredClone(state))
        .get(action.sourceId);
      if (!source)
        throw new Error("Overload source characteristics unavailable");
      return effects.damage(state, batch, structuredClone(source));
    },
  };
  return {
    behavior,
    validate(state: GameState, sourceId: string, choices: ProgramChoices) {
      if (!legal(state, sourceId, choices))
        throw new Error("Illegal Overload target");
    },
    variants(state: GameState, sourceId: string): ProgramPlayVariant[] {
      const base = { modes: [], reversed: false, x: null, mainframes: null };
      return [
        {
          ...base,
          key: "character",
          label: "Target a character",
          targets: [
            {
              label: "Target character",
              minimum: 1,
              maximum: 1,
              candidates: characters(state, sourceId),
            },
          ],
        },
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
