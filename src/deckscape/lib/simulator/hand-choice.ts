import { isDeepStrictEqual } from "node:util";
import { assertGameZones, type GameState } from "./game-state";
import type { Seat } from "./setup";
import type { CardCharacteristics } from "./characteristics";
import { requireCurrentCardSource } from "./cache-source";

export interface HandChoiceDecision {
  type: "hand-choice";
  id: string;
  sourceId: string;
  actionId: string;
  handler: string;
  player: Seat;
  targetPlayer: Seat;
  inspected: string[];
  incarnations: Record<string, number>;
}
export interface HandChoiceEvaluation {
  characteristics: ReadonlyMap<string, CardCharacteristics>;
  complete(
    state: GameState,
    decision: HandChoiceDecision,
    selected: string,
  ): GameState;
}

export function validateHandChoiceContinuation(
  state: GameState,
): HandChoiceDecision {
  const decision = state.pendingDecision,
    action = state.priorityWindow?.resolving;
  if (
    decision?.type !== "hand-choice" ||
    !action ||
    action.kind !== "card" ||
    state.priorityWindow?.mode !== "drain" ||
    action.id !== decision.actionId ||
    action.sourceId !== decision.sourceId ||
    action.controller !== decision.player ||
    (decision.handler === "script/the-fool"
      ? action.programChoices?.playerTarget !== undefined ||
        decision.targetPlayer !== action.controller
      : action.programChoices?.playerTarget !== decision.targetPlayer) ||
    decision.id !== `hand:${action.id}` ||
    !decision.handler ||
    !decision.inspected.length ||
    !isDeepStrictEqual(
      decision.inspected,
      state.players[decision.targetPlayer].zones.hand,
    ) ||
    !isDeepStrictEqual(
      Object.keys(decision.incarnations).sort(),
      [...decision.inspected].sort(),
    ) ||
    decision.inspected.some(
      (id) => state.objects[id]?.incarnation !== decision.incarnations[id],
    )
  )
    throw new Error("Invalid hand choice continuation");
  requireCurrentCardSource(state, action);
  return decision;
}

export function answerHandChoice(
  state: GameState,
  userId: string,
  revision: number,
  decisionId: string,
  selected: string,
  evaluated: HandChoiceEvaluation,
): GameState {
  if (state.outcome || revision !== state.revision)
    throw new Error("Ended game or stale revision");
  const decision = validateHandChoiceContinuation(state);
  if (
    state.players[decision.player].userId !== userId ||
    decision.id !== decisionId
  )
    throw new Error("Not the deciding player or decision");
  if (!decision.inspected.includes(selected))
    throw new Error("Invalid hand card choice");
  let next = structuredClone(state);
  next.pendingDecision = null;
  next = evaluated.complete(next, structuredClone(decision), selected);
  if (
    next.revision !== revision ||
    next.pendingDecision ||
    next.priorityWindow?.resolving?.id !== decision.actionId ||
    next.engineVersion !== state.engineVersion ||
    next.rulesVersion !== state.rulesVersion
  )
    throw new Error("Hand choice changed the resolving action");
  next.priorityWindow.resolutionApplied = true;
  next.revision++;
  assertGameZones(next);
  return next;
}
