import { isDeepStrictEqual } from "node:util";
import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { CardCharacteristics } from "./characteristics";
import {
  beginTopCards,
  completeTopCards,
  validateTopCardsContinuation,
  type TopCardsEvaluation,
  type TopCardsEffects,
} from "./top-cards";
import {
  beginDeckSearch,
  revealSearchedCard,
  validateDeckSearchContinuation,
  type DeckSearchEvaluation,
} from "./deck-search";
import {
  finishScriptResolution,
  validateUntargetedScript,
  type ScriptAction,
  type ScriptBehavior,
} from "./resolve-script";
import { requireCurrentCardSource } from "./cache-source";

export type SearchScriptKind = "the-star" | "the-sun" | "the-world";
export interface SearchScriptEffects extends TopCardsEffects {
  canSearch(state: GameState, player: Seat): boolean;
  shuffleDeck(state: GameState, player: Seat): GameState;
}

/** Decisions reuse the existing private trays. Criteria come from the captured play, not the client. */
export function searchScript(
  kind: SearchScriptKind,
  effects: SearchScriptEffects,
) {
  const handler = `script/${kind}`;
  function captured(state: GameState): ScriptAction {
    const action = state.priorityWindow?.resolving;
    if (action?.kind !== "card" || !action.programChoices)
      throw Error("Search script is not resolving");
    requireCurrentCardSource(state, action);
    const result = { ...action, programChoices: action.programChoices };
    validateUntargetedScript(result, kind === "the-sun");
    return result;
  }
  function candidates(
    state: GameState,
    action: ScriptAction,
    current: ReadonlyMap<string, CardCharacteristics>,
  ) {
    return state.players[action.controller].zones.cyberdeck.filter((id) => {
      const card = current.get(id);
      if (!card) throw Error("Search characteristics unavailable");
      if (state.objects[id].token || card.cardType !== "program") return false;
      return kind === "the-world"
        ? card.subtype === "environment"
        : action.programChoices.reversed || card.tags.includes("TAROT");
    });
  }
  const behavior: ScriptBehavior = {
    hasLegalTargets(_state, action) {
      validateUntargetedScript(action, kind === "the-sun");
      return true;
    },
    resolve(state, action) {
      validateUntargetedScript(action, kind === "the-sun");
      if (kind === "the-star")
        return beginTopCards(
          state,
          action.controller,
          action.sourceId,
          action.id,
          handler,
          { kind: "divine", count: 3 },
          effects,
        );
      if (!effects.canSearch(state, action.controller)) return state;
      return beginDeckSearch(
        state,
        action,
        handler,
        candidates(state, action, effects.characteristics(state)),
        true,
      );
    },
  };
  return {
    behavior,
    topCards(state: GameState): TopCardsEvaluation {
      const action = captured(state),
        saved = state.pendingDecision;
      if (
        kind !== "the-star" ||
        saved?.type !== "top-cards" ||
        saved.trigger ||
        saved.handler !== handler ||
        saved.kind !== "divine" ||
        saved.count !== 3
      )
        throw Error("Invalid Star continuation");
      validateTopCardsContinuation(state, saved);
      return {
        characteristics: effects.characteristics(state),
        complete(snapshot, decision, selected) {
          if (!isDeepStrictEqual(saved, decision))
            throw Error("Star decision changed");
          if (captured(snapshot).id !== action.id)
            throw Error("Star action changed");
          return finishScriptResolution(
            completeTopCards(snapshot, decision, selected, effects),
          );
        },
      };
    },
    deckSearch(state: GameState): DeckSearchEvaluation {
      const action = captured(state),
        saved = state.pendingDecision;
      if (
        kind === "the-star" ||
        saved?.type !== "deck-search" ||
        saved.handler !== handler ||
        !saved.allowFail
      )
        throw Error("Invalid search script continuation");
      validateDeckSearchContinuation(state, saved);
      const current = effects.characteristics(state);
      if (
        !isDeepStrictEqual(saved.candidates, candidates(state, action, current))
      )
        throw Error("Search criteria changed");
      return {
        characteristics: current,
        complete(snapshot, decision, selected) {
          if (!isDeepStrictEqual(saved, decision))
            throw Error("Search decision changed");
          let next = snapshot;
          if (selected !== null) {
            next = revealSearchedCard(
              next,
              action.controller,
              selected,
              effects.characteristics(next),
            );
            next = effects.moveToHand(next, action.controller, selected);
          }
          next = effects.shuffleDeck(next, action.controller);
          return finishScriptResolution(next);
        },
      };
    },
  };
}
