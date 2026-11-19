import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { CombatDamagePacket } from "./combat-damage";
import type { ActivatedBehavior } from "./resolve-ability";
import type { AbilityChoices } from "./activate-ability";
import { isCurrentActionTarget } from "./action-targets";
import { isCurrentIncarnation } from "./object-incarnation";
import {
  characterStatusTargets,
  type CharacterTargetEvaluation,
} from "./character-status-effects";

/** CR 702.18: use both current attack values/types, simultaneously. Running status,
 * normal block restrictions and OVERRUN do not change a duel's assignment. */
export function assignDuelDamage(
  state: GameState,
  first: string,
  second: string,
  current: ReadonlyMap<string, CardCharacteristics>,
): CombatDamagePacket[] {
  if (state.outcome) throw new Error("Duel unavailable after game end");
  const card = (id: string) => {
    if (!state.arena.includes(id)) return null;
    const value = current.get(id);
    if (!value)
      throw new Error("Dueling character characteristics unavailable");
    return value.cardType === "character" ? value : null;
  };
  const a = card(first),
    b = card(second);
  if (!a || !b) return [];
  const packet = (
    sourceId: string,
    instanceId: string,
    value: typeof a,
  ): CombatDamagePacket => {
    const amount = Math.max(0, value.attack);
    if (!Number.isSafeInteger(amount))
      throw new Error("Invalid dueling attack value");
    return {
      sourceId,
      instanceId,
      amount,
      channel: value.attackType,
      recipient: "character",
      combat: true,
    };
  };
  return first === second
    ? [packet(first, first, a)]
    : [packet(first, second, a), packet(second, first, b)];
}

export interface DuelEffects extends CharacterTargetEvaluation {
  damage(state: GameState, packets: readonly CombatDamagePacket[]): GameState;
}
export function duelAbility(effects: DuelEffects): ActivatedBehavior {
  const target = (choices: AbilityChoices) => {
    if (
      choices.targets.length !== 1 ||
      choices.modes.length ||
      choices.x !== null ||
      choices.playerTarget !== undefined
    )
      throw new Error("Invalid duel choices");
    return choices.targets[0];
  };
  return {
    hasLegalTargets(state, action) {
      const id = target(action.activatedAbility.choices);
      return (
        isCurrentActionTarget(state, action, id) &&
        characterStatusTargets(state, action.sourceId, effects).includes(id)
      );
    },
    resolve(state, action) {
      const id = target(action.activatedAbility.choices);
      if (!isCurrentIncarnation(state, action.activatedAbility.source))
        return state;
      const packets = assignDuelDamage(
        state,
        action.sourceId,
        id,
        effects.characteristics(structuredClone(state)),
      );
      return packets.length ? effects.damage(state, packets) : state;
    },
  };
}
