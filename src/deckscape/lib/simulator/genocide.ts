import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";
import {
  finishScriptResolution,
  validateUntargetedScript,
  type ScriptBehavior,
} from "./resolve-script";
import {
  validateFactionChoiceContinuation,
  type FactionChoiceDecision,
  type FactionChoiceEvaluation,
} from "./faction-choice";
import { ruleEventObservationState } from "./rule-events";

export interface GenocideEffects {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  factions(state: GameState): readonly string[];
  /** One simultaneous destruction intent batch, including current replacements/prohibitions. */
  destroyCharacters(
    state: GameState,
    sourceId: string,
    ids: readonly string[],
  ): GameState;
  /** One simultaneous MF/BF health-loss instruction, evaluated separately from damage. */
  loseHealth(
    state: GameState,
    sourceId: string,
    player: Seat,
    amount: number,
  ): GameState;
}

export function genocide(effects: GenocideEffects) {
  const handler = "script/genocide";
  const behavior: ScriptBehavior = {
    hasLegalTargets(_state, action) {
      validateUntargetedScript(action);
      return true;
    },
    resolve(state, action) {
      validateUntargetedScript(action);
      if (state.pendingDecision)
        throw new Error("GENOCIDE resolution unavailable");
      const next = structuredClone(state);
      next.pendingDecision = {
        type: "faction-choice",
        id: `faction:${action.id}`,
        player: action.controller,
        sourceId: action.sourceId,
        actionId: action.id,
        handler,
        factions: [...effects.factions(structuredClone(state))],
      };
      validateFactionChoiceContinuation(next);
      return next;
    },
  };
  function complete(
    state: GameState,
    decision: FactionChoiceDecision,
    faction: string,
  ): GameState {
    const current = effects.characteristics(structuredClone(state));
    const targets = state.arena.filter((id) => {
      const card = current.get(id);
      if (!card) throw new Error("GENOCIDE characteristics unavailable");
      return card.cardType === "character" && card.factions.includes(faction);
    });
    const firstEvent = state.pendingRuleEvents.length;
    let next = targets.length
      ? effects.destroyCharacters(state, decision.sourceId, targets)
      : state;
    if (next.pendingDecision)
      throw new Error(
        "GENOCIDE destruction requires a saved replacement continuation",
      );
    if (!next.outcome) {
      const destroyed = new Set(
        next.pendingRuleEvents.slice(firstEvent).flatMap((event) => {
          if (
            event.type !== "persistent-destroyed" ||
            event.sourceId !== decision.sourceId
          )
            return [];
          const card = effects
            .characteristics(ruleEventObservationState(next, event))
            .get(event.instanceId);
          if (!card)
            throw new Error("GENOCIDE destruction characteristics unavailable");
          return card.cardType === "character"
            ? [`${event.instanceId}:${event.previous.incarnation}`]
            : [];
        }),
      );
      if (destroyed.size)
        next = effects.loseHealth(
          next,
          decision.sourceId,
          decision.player,
          destroyed.size,
        );
    }
    if (next.pendingDecision)
      throw new Error(
        "GENOCIDE health loss requires a saved replacement continuation",
      );
    return finishScriptResolution(next);
  }
  return {
    behavior,
    choice(state: GameState): FactionChoiceEvaluation {
      const decision = validateFactionChoiceContinuation(state);
      if (decision.handler !== handler)
        throw new Error("Wrong GENOCIDE continuation");
      return {
        factions: [...effects.factions(structuredClone(state))],
        complete,
      };
    },
  };
}
