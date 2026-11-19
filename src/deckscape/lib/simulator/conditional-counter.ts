import type { GameState } from "./game-state";
import { isCurrentCardSource } from "./cache-source";
import { isCurrentActionTarget } from "./action-targets";
import type { Seat } from "./setup";
import type { CardCharacteristics } from "./characteristics";
import { finishScriptResolution, type ScriptBehavior } from "./resolve-script";
import { payRam } from "./ram";
import {
  counterProgramHasLegalTarget,
  type CounterTargetEvaluation,
} from "./counter-program-choices";

export interface CounterPaymentDecision {
  type: "counter-payment";
  id: string;
  player: Seat;
  ramCost: number;
  sourceId: string;
  targetActionId: string;
}
export function hierophantScript(
  evaluateTargets: (
    state: GameState,
    sourceId: string,
  ) => CounterTargetEvaluation,
): ScriptBehavior {
  return {
    hasLegalTargets(state, action) {
      return (
        isCurrentActionTarget(
          state,
          action,
          action.programChoices.targets[0],
        ) &&
        counterProgramHasLegalTarget(
          state,
          action.sourceId,
          "hierophant",
          action.programChoices,
          evaluateTargets(structuredClone(state), action.sourceId),
        )
      );
    },
    resolve(state, action) {
      if (state.pendingDecision) throw new Error("Another decision is pending");
      const target = state.priorityWindow!.stack.find(
        (item) =>
          item.kind === "card" &&
          item.sourceId === action.programChoices.targets[0],
      )!;
      const next = structuredClone(state);
      next.pendingDecision = {
        type: "counter-payment",
        id: `counter-payment:${action.id}`,
        player: target.controller,
        ramCost: action.programChoices.reversed ? 3 : 1,
        sourceId: action.sourceId,
        targetActionId: target.id,
      };
      return next;
    },
  };
}
export interface CounterPaymentEvaluation {
  definitions: ReadonlyMap<string, CardCharacteristics>;
  counter(state: GameState, actionId: string, sourceId: string): GameState;
}

/** Only the targeted card's controller answers; no priority or other actions intervene. */
export function answerCounterPayment(
  state: GameState,
  userId: string,
  revision: number,
  decisionId: string,
  pay: boolean,
  ram: string[],
  evaluated: CounterPaymentEvaluation,
): GameState {
  const decision = state.pendingDecision;
  if (
    state.outcome ||
    state.revision !== revision ||
    decision?.type !== "counter-payment" ||
    decision.id !== decisionId
  )
    throw new Error("Counter payment decision unavailable");
  if (state.players[decision.player].userId !== userId)
    throw new Error("Not the deciding player");
  if (
    !state.priorityWindow?.resolving ||
    state.priorityWindow.resolving.sourceId !== decision.sourceId ||
    !isCurrentCardSource(state, state.priorityWindow.resolving) ||
    !state.priorityWindow.stack.some(
      (item) =>
        item.id === decision.targetActionId &&
        item.kind === "card" &&
        isCurrentCardSource(state, item),
    )
  )
    throw new Error("Invalid counter continuation");
  if (!pay && ram.length) throw new Error("Declining payment cannot spend RAM");
  let next = structuredClone(state);
  next.pendingDecision = null;
  if (pay)
    next = payRam(
      next,
      decision.player,
      decision.ramCost,
      ram,
      evaluated.definitions,
    );
  else
    next = evaluated.counter(next, decision.targetActionId, decision.sourceId);
  next = finishScriptResolution(next);
  next.priorityWindow!.resolutionApplied = true;
  next.revision++;
  return next;
}
