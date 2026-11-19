import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import {
  validateUntargetedScript,
  type ScriptBehavior,
} from "./resolve-script";

export interface SavageDuststormEffects {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  /** Shared external-run evaluator handles prohibitions and replacements, including
   * PSYCHOSIS (CR 702.11e). Do not substitute targeting permissions for this evaluation. */
  run(
    state: GameState,
    sourceId: string,
    characterIds: readonly string[],
  ): GameState;
}

/** Reviewed SAVAGE DUSTSTORM affects both players and does not target. */
export function savageDuststorm(
  effects: SavageDuststormEffects,
): ScriptBehavior {
  return {
    hasLegalTargets(_state, action) {
      validateUntargetedScript(action);
      return true;
    },
    resolve(state, action) {
      const current = effects.characteristics(structuredClone(state));
      const ids = state.arena.filter((id) => {
        const card = current.get(id);
        if (!card)
          throw new Error("Duststorm recipient characteristics unavailable");
        return (
          card.cardType === "character" && !card.factions.includes("DUSTRUNNER")
        );
      });
      return ids.length ? effects.run(state, action.sourceId, ids) : state;
    },
  };
}
