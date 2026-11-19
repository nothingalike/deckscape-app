import { isDeepStrictEqual } from "node:util";
import { assertGameZones, type GameState } from "./game-state";
import type { Seat } from "./setup";
import { requireCurrentCardSource } from "./cache-source";

export interface FactionChoiceDecision {
  type: "faction-choice";
  id: string;
  sourceId: string;
  player: Seat;
  actionId: string;
  handler: string;
  factions: string[];
}
export interface FactionChoiceEvaluation {
  factions: readonly string[];
  complete(
    state: GameState,
    decision: FactionChoiceDecision,
    faction: string,
  ): GameState;
}

export function validateFactionChoiceContinuation(
  state: GameState,
): FactionChoiceDecision {
  const decision = state.pendingDecision,
    action = state.priorityWindow?.resolving;
  if (
    decision?.type !== "faction-choice" ||
    !action ||
    action.kind !== "card" ||
    !action.programChoices ||
    state.priorityWindow?.mode !== "drain" ||
    action.id !== decision.actionId ||
    action.sourceId !== decision.sourceId ||
    action.controller !== decision.player ||
    decision.id !== `faction:${action.id}` ||
    !decision.handler ||
    decision.factions.length === 0 ||
    decision.factions.length > 32 ||
    new Set(decision.factions).size !== decision.factions.length ||
    decision.factions.some((faction) => !faction.trim() || faction.length > 80)
  )
    throw new Error("Invalid faction choice continuation");
  requireCurrentCardSource(state, action);
  return decision;
}

export function answerFactionChoice(
  state: GameState,
  userId: string,
  revision: number,
  decisionId: string,
  faction: string,
  evaluated: FactionChoiceEvaluation,
): GameState {
  if (state.outcome || state.revision !== revision)
    throw new Error("Ended game or stale revision");
  const decision = validateFactionChoiceContinuation(state);
  if (
    state.players[decision.player].userId !== userId ||
    decision.id !== decisionId
  )
    throw new Error("Not the deciding player or decision");
  if (
    !isDeepStrictEqual(decision.factions, evaluated.factions) ||
    !decision.factions.includes(faction)
  )
    throw new Error("Invalid faction choice");
  let next = structuredClone(state);
  next.pendingDecision = null;
  next = evaluated.complete(next, structuredClone(decision), faction);
  if (
    next.priorityWindow?.resolving?.id !== decision.actionId ||
    next.revision !== revision ||
    next.pendingDecision ||
    next.engineVersion !== state.engineVersion ||
    next.rulesVersion !== state.rulesVersion
  )
    throw new Error("Faction choice changed the resolving action");
  next.priorityWindow.resolutionApplied = true;
  next.revision++;
  assertGameZones(next);
  return next;
}
