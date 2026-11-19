import { assertGameZones, type GameState } from "./game-state";
import type { Seat } from "./setup";
import { requireCurrentCardSource } from "./cache-source";

export interface RamCostChoiceDecision {
  type: "ram-cost-choice";
  id: string;
  sourceId: string;
  player: Seat;
  actionId: string;
  handler: string;
}
export interface RamCostChoiceEvaluation {
  complete(
    state: GameState,
    decision: RamCostChoiceDecision,
    cost: number,
  ): GameState;
}
/** A blind declaration during resolution, not X or a choice made while announcing. */
export function validateRamCostChoiceContinuation(
  state: GameState,
): RamCostChoiceDecision {
  const decision = state.pendingDecision,
    action = state.priorityWindow?.resolving;
  if (
    decision?.type !== "ram-cost-choice" ||
    !action ||
    action.kind !== "card" ||
    !action.programChoices ||
    state.priorityWindow?.mode !== "drain" ||
    action.id !== decision.actionId ||
    action.sourceId !== decision.sourceId ||
    action.controller !== decision.player ||
    decision.id !== "ram-cost:" + action.id ||
    !decision.handler
  )
    throw Error("Invalid RAM cost choice continuation");
  requireCurrentCardSource(state, action);
  return decision;
}
export function answerRamCostChoice(
  state: GameState,
  userId: string,
  revision: number,
  decisionId: string,
  cost: number,
  evaluated: RamCostChoiceEvaluation,
): GameState {
  if (state.outcome || state.revision !== revision)
    throw Error("Ended game or stale revision");
  const decision = validateRamCostChoiceContinuation(state);
  if (
    state.players[decision.player].userId !== userId ||
    decision.id !== decisionId
  )
    throw Error("Not the deciding player or decision");
  if (!Number.isSafeInteger(cost) || cost < 0)
    throw Error("Invalid named RAM cost");
  let next = structuredClone(state);
  next.pendingDecision = null;
  next = evaluated.complete(next, structuredClone(decision), cost);
  if (
    next.priorityWindow?.resolving?.id !== decision.actionId ||
    next.revision !== revision ||
    next.pendingDecision ||
    next.engineVersion !== state.engineVersion ||
    next.rulesVersion !== state.rulesVersion
  )
    throw Error("RAM cost choice changed the resolving action");
  next.priorityWindow.resolutionApplied = true;
  next.revision++;
  assertGameZones(next);
  return next;
}
