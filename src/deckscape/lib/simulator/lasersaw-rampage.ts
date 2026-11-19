import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { ActivatedBehavior } from "./resolve-ability";
import type { TriggerBehavior } from "./resolve-trigger";
import { isCurrentIncarnation } from "./object-incarnation";
import { addUntilTurnEndStatEffect } from "./timed-stat-effects";
import { evaluatePlayerSynergy } from "./synergy";
import { scheduleTurnEndDestruction } from "./delayed-triggers";

export interface RampageEffects {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  /** Applies destruction prohibitions and replacements to this ordinary effect. */
  destroy(state: GameState, sourceId: string, targetId: string): GameState;
}

export function lasersawRampage(
  version: string,
  handler: string,
  effects: RampageEffects,
) {
  const activated: ActivatedBehavior = {
    hasLegalTargets(_state, action) {
      const choice = action.activatedAbility.choices;
      if (
        choice.targets.length ||
        choice.modes.length ||
        choice.x !== null ||
        choice.playerTarget !== undefined
      )
        throw new Error("Invalid Rampage choices");
      return true;
    },
    resolve(state, action) {
      const current = effects.characteristics(structuredClone(state));
      let next = state;
      if (
        isCurrentIncarnation(state, action.activatedAbility.source) &&
        state.arena.includes(action.sourceId) &&
        current.get(action.sourceId)?.cardType === "character"
      ) {
        const count =
          evaluatePlayerSynergy(state, current)[action.controller].factions
            .CYBERNETIC ?? 0;
        next = addUntilTurnEndStatEffect(
          state,
          action.sourceId,
          action.sourceId,
          { layer: "7d", operation: "add", attack: count * 2, defence: 0 },
          current,
        );
      }
      return scheduleTurnEndDestruction(next, action);
    },
  };
  const triggered: TriggerBehavior = {
    resolve(state, trigger) {
      const delay = trigger.delayed;
      if (
        !delay ||
        delay.kind !== "next-turn-end-destroy" ||
        trigger.event.type !== "turn-ending" ||
        delay.sourceDefinitionVersion !== version ||
        trigger.handler !== handler ||
        delay.handler !== handler ||
        trigger.sourceId !== delay.sourceId ||
        trigger.controller !== delay.controller ||
        delay.targetId !== delay.sourceId
      )
        throw new Error("Invalid retained Rampage delayed trigger");
      if (
        !state.arena.includes(delay.targetId) ||
        state.objects[delay.targetId]?.incarnation !== delay.targetIncarnation
      )
        return state;
      return effects.destroy(state, delay.sourceId, delay.targetId);
    },
  };
  return { activated, triggered };
}
