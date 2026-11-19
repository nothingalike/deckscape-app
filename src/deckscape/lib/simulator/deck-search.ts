import { assertGameZones, type GameState } from "./game-state";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import type { Seat } from "./setup";
import type { CacheAction } from "./priority";

export interface DeckSearchDecision {
  type: "deck-search";
  id: string;
  player: Seat;
  sourceId: string;
  actionId: string;
  handler: string;
  inspected: string[];
  candidates: string[];
  allowFail: boolean;
}
export interface PublicCardReveal {
  player: Seat;
  definitionVersion: string;
  characteristics: CardCharacteristics;
}
export interface DeckSearchEvaluation {
  characteristics: ReadonlyMap<string, CardCharacteristics>;
  /** Applies the retained effect's reveal/move/shuffle/follow-up through its interpreter. */
  complete(
    state: GameState,
    decision: DeckSearchDecision,
    selected: string | null,
  ): GameState;
}

/** Search candidates are selected by the trusted effect, never a client filter. */
export function beginDeckSearch(
  state: GameState,
  action: CacheAction,
  handler: string,
  candidates: readonly string[],
  allowFail: boolean,
): GameState {
  if (
    state.outcome ||
    state.pendingDecision ||
    state.priorityWindow?.resolving?.id !== action.id ||
    !handler
  )
    throw new Error("Deck search is unavailable");
  const inspected = state.players[action.controller].zones.cyberdeck;
  if (
    new Set(candidates).size !== candidates.length ||
    candidates.some((id) => !inspected.includes(id))
  )
    throw new Error("Invalid deck search candidates");
  const next = structuredClone(state);
  next.pendingDecision = {
    type: "deck-search",
    id: `search:${action.id}`,
    player: action.controller,
    sourceId: action.sourceId,
    actionId: action.id,
    handler,
    inspected: [...inspected],
    candidates: [...candidates],
    allowFail,
  };
  return next;
}

export function validateDeckSearchContinuation(
  state: GameState,
  decision: DeckSearchDecision,
): void {
  const action = state.priorityWindow?.resolving;
  const deck = state.players[decision.player].zones.cyberdeck;
  if (
    !action ||
    state.priorityWindow?.mode !== "drain" ||
    state.priorityWindow.priority !== null ||
    action.id !== decision.actionId ||
    action.sourceId !== decision.sourceId ||
    action.controller !== decision.player ||
    decision.id !== `search:${action.id}` ||
    deck.length !== decision.inspected.length ||
    deck.some((id, index) => id !== decision.inspected[index]) ||
    new Set(decision.candidates).size !== decision.candidates.length ||
    decision.candidates.some((id) => !deck.includes(id))
  )
    throw new Error("Invalid deck search continuation");
}

/** Reveal history records identity/text, not an instance ID that could track a
 * subsequently hidden card. It remains visible across asynchronous polling.
 */
export function revealSearchedCard(
  state: GameState,
  player: Seat,
  id: string,
  characteristics: ReadonlyMap<string, CardCharacteristics>,
): GameState {
  const card = characteristics.get(id),
    object = state.objects[id];
  if (!object || !card || !state.players[player].zones.cyberdeck.includes(id))
    throw new Error("Searched card is unavailable");
  const next = structuredClone(state);
  next.reveals.push({
    player,
    definitionVersion: object.definitionVersion,
    characteristics: characteristicsSchema.parse(card),
  });
  return next;
}

export function answerDeckSearch(
  state: GameState,
  userId: string,
  revision: number,
  decisionId: string,
  selected: string | null,
  evaluated: DeckSearchEvaluation,
): GameState {
  const decision = state.pendingDecision;
  if (
    state.outcome ||
    state.revision !== revision ||
    decision?.type !== "deck-search" ||
    decision.id !== decisionId
  )
    throw new Error("Deck search decision unavailable");
  if (state.players[decision.player].userId !== userId)
    throw new Error("Not the deciding player");
  validateDeckSearchContinuation(state, decision);
  if (
    selected === null
      ? !decision.allowFail && decision.candidates.length > 0
      : !decision.candidates.includes(selected)
  )
    throw new Error("Invalid search selection");
  let next = structuredClone(state);
  next.pendingDecision = null;
  next = evaluated.complete(next, structuredClone(decision), selected);
  if (next.priorityWindow?.resolving?.id !== decision.actionId)
    throw new Error("Search continuation changed the resolving action");
  next.priorityWindow.resolutionApplied = true;
  next.revision++;
  assertGameZones(next);
  return next;
}
