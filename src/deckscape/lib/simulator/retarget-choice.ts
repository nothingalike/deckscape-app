import { isDeepStrictEqual } from "node:util";
import { assertGameZones, type GameState } from "./game-state";
import type { Seat } from "./setup";
import { requireCurrentCardSource } from "./cache-source";
import type {
  ProgramRetargetSelection,
  ProgramRetargetObjectOption,
} from "./retarget-program";
import type { CardCharacteristics } from "./characteristics";

export interface RetargetChoiceDecision {
  type: "retarget-program";
  id: string;
  sourceId: string;
  actionId: string;
  targetActionId: string;
  player: Seat;
  options: ProgramRetargetSelection[];
  objectSlots?: ProgramRetargetObjectOption[][];
}
export interface RetargetChoiceEvaluation {
  characteristics: ReadonlyMap<string, CardCharacteristics>;
  options(state: GameState, targetActionId: string): ProgramRetargetSelection[];
  objectSlots?(
    state: GameState,
    targetActionId: string,
  ): ProgramRetargetObjectOption[][];
  completeObjects?(
    state: GameState,
    decision: RetargetChoiceDecision,
    indices: readonly number[],
  ): GameState;
  complete(
    state: GameState,
    decision: RetargetChoiceDecision,
    selected: ProgramRetargetSelection,
  ): GameState;
}

export function validateRetargetChoiceContinuation(
  state: GameState,
): RetargetChoiceDecision {
  const saved = state.pendingDecision,
    action = state.priorityWindow?.resolving;
  if (
    saved?.type !== "retarget-program" ||
    !action ||
    action.kind !== "card" ||
    state.priorityWindow?.mode !== "drain" ||
    action.id !== saved.actionId ||
    action.sourceId !== saved.sourceId ||
    action.controller !== saved.player ||
    saved.id !== `retarget:${action.id}` ||
    Boolean(saved.options.length) === Boolean(saved.objectSlots?.length)
  )
    throw new Error("Invalid retarget choice continuation");
  requireCurrentCardSource(state, action);
  const target = state.priorityWindow.stack.find(
    (a) => a.id === saved.targetActionId,
  );
  if (
    !target ||
    target.kind !== "card" ||
    !target.programChoices ||
    action.programChoices?.targets.length !== 1 ||
    action.programChoices.targets[0] !== target.sourceId ||
    action.targetIncarnations?.[target.sourceId] !== target.sourceIncarnation
  )
    throw new Error("Invalid retargeted program continuation");
  requireCurrentCardSource(state, target);
  if (
    saved.objectSlots &&
    (target.programChoices.mainframeTarget !== undefined ||
      target.programChoices.playerTarget !== undefined ||
      saved.objectSlots.length !== target.programChoices.targets.length ||
      saved.objectSlots.some(
        (slot, i) =>
          !slot.length ||
          slot[0].id !== target.programChoices!.targets[i] ||
          slot[0].incarnation !== target.targetIncarnations?.[slot[0].id] ||
          new Set(slot.map((o) => JSON.stringify([o.id, o.incarnation])))
            .size !== slot.length,
      ))
  )
    throw Error("Invalid retained object retarget slots");
  return saved;
}

export function answerRetargetChoice(
  state: GameState,
  userId: string,
  revision: number,
  decisionId: string,
  index: number,
  evaluated: RetargetChoiceEvaluation,
): GameState {
  if (state.outcome || revision !== state.revision)
    throw new Error("Ended game or stale revision");
  const saved = validateRetargetChoiceContinuation(state);
  if (saved.objectSlots)
    throw Error("This retarget decision requires grouped choices");
  if (state.players[saved.player].userId !== userId || saved.id !== decisionId)
    throw new Error("Not the deciding player or decision");
  const current = evaluated.options(
    structuredClone(state),
    saved.targetActionId,
  );
  if (
    !isDeepStrictEqual(current, saved.options) ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= current.length
  )
    throw new Error("Invalid or changed retarget options");
  let next = structuredClone(state);
  next.pendingDecision = null;
  next = evaluated.complete(
    next,
    structuredClone(saved),
    structuredClone(current[index]),
  );
  if (
    next.revision !== revision ||
    next.pendingDecision ||
    next.priorityWindow?.resolving?.id !== saved.actionId ||
    next.engineVersion !== state.engineVersion ||
    next.rulesVersion !== state.rulesVersion
  )
    throw new Error("Retarget choice changed the resolving action");
  next.priorityWindow.resolutionApplied = true;
  next.revision++;
  assertGameZones(next);
  return next;
}

/** Grouped counterpart to the legacy complete-option menu. Indices refer to
 * server-saved slots and are accepted only after revalidating those exact slots.
 * No client card incarnation, mode, cost or controller is accepted. */
export function answerRetargetObjectChoice(
  state: GameState,
  userId: string,
  revision: number,
  decisionId: string,
  indices: readonly number[],
  evaluated: RetargetChoiceEvaluation,
): GameState {
  if (state.outcome || revision !== state.revision)
    throw Error("Ended game or stale revision");
  const saved = validateRetargetChoiceContinuation(state);
  if (
    !saved.objectSlots ||
    !evaluated.objectSlots ||
    !evaluated.completeObjects
  )
    throw Error("Grouped retarget evaluator unavailable");
  if (state.players[saved.player].userId !== userId || saved.id !== decisionId)
    throw Error("Not the deciding player or decision");
  const current = evaluated.objectSlots(
    structuredClone(state),
    saved.targetActionId,
  );
  if (
    !isDeepStrictEqual(current, saved.objectSlots) ||
    indices.length !== current.length ||
    indices.some(
      (index, i) =>
        !Number.isSafeInteger(index) || index < 0 || index >= current[i].length,
    )
  )
    throw Error("Invalid or changed retarget slots");
  let next = structuredClone(state);
  next.pendingDecision = null;
  next = evaluated.completeObjects(next, structuredClone(saved), [...indices]);
  if (
    next.revision !== revision ||
    next.pendingDecision ||
    next.priorityWindow?.resolving?.id !== saved.actionId ||
    next.engineVersion !== state.engineVersion ||
    next.rulesVersion !== state.rulesVersion
  )
    throw Error("Retarget choice changed the resolving action");
  next.priorityWindow.resolutionApplied = true;
  next.revision++;
  assertGameZones(next);
  return next;
}
