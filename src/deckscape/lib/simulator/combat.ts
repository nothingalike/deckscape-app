import { canSatisfyMoreBlocks } from "./mandatory-blocking";
import { assertGameZones, type GameState } from "./game-state";
import type { Seat } from "./setup";
import type { CardCharacteristics } from "./characteristics";
import { openPriority } from "./priority";
import { recordPersistentRuns } from "./persistent-status";
import { resolvePsychosis, type PsychosisEvaluation } from "./psychosis";
import {
  captureEventObservation,
  type EventObservation,
} from "./event-observation";

export interface CombatState {
  stage:
    | "attackers-window"
    | "attackers"
    | "blockers-window"
    | "blockers"
    | "damage-window"
    | "damage"
    | "damage-applied"
    | "end";
  attackers: string[];
  blockers: { blockerId: string; attackerId: string }[];
}
export type CombatEvent =
  | ({
      type: "netcheck-started" | "combat-started";
      player: Seat;
    } & Partial<EventObservation>)
  | ({
      type: "character-attacked";
      player: Seat;
      instanceId: string;
      defendingPlayer: Seat;
    } & Partial<EventObservation>)
  | ({
      type: "character-blocked";
      player: Seat;
      instanceId: string;
      attackerId: string;
      blockingGroup?: string[];
      /** The whole simultaneous declaration, for "one or more" blocked triggers. */
      blockingBatch?: { blockerId: string; attackerId: string }[];
    } & Partial<EventObservation>);

function requireSettled(state: GameState): void {
  if (
    state.outcome ||
    state.cache.length ||
    state.pendingRuleEvents.length ||
    state.pendingTriggers.length
  )
    throw new Error("Combat or phase effects are pending");
}
function completedWindow(state: GameState): void {
  requireSettled(state);
  const window = state.priorityWindow;
  if (
    !window ||
    window.mode !== "complete" ||
    window.resolving ||
    window.stack.length ||
    window.triggers.length
  )
    throw new Error("Priority window is not complete");
}

export function enterNetcheck(state: GameState): GameState {
  completedWindow(state);
  if (state.turn.step !== "deploy" || state.priorityWindow?.origin !== "deploy")
    throw new Error("Deploy has not ended");
  const next = structuredClone(state);
  next.priorityWindow = null;
  next.turn.step = "netcheck";
  next.pendingRuleEvents.push({
    type: "netcheck-started",
    ...captureEventObservation(next),
    player: state.turn.activePlayer,
  });
  return next;
}

export function enterCombat(state: GameState): GameState {
  requireSettled(state);
  if (state.turn.step !== "netcheck" || state.priorityWindow)
    throw new Error("Netcheck has not ended");
  const next = structuredClone(state);
  next.turn.step = "combat";
  next.combat = { stage: "attackers-window", attackers: [], blockers: [] };
  next.pendingRuleEvents.push({
    type: "combat-started",
    player: state.turn.activePlayer,
  });
  return next;
}

export function beginCombatWindow(state: GameState): GameState {
  requireSettled(state);
  if (
    state.turn.step !== "combat" ||
    state.priorityWindow ||
    !state.combat ||
    !state.combat.stage.endsWith("-window")
  )
    throw new Error("No combat window pending");
  const next = structuredClone(state);
  next.priorityWindow = openPriority(state.turn.activePlayer, "combat");
  return next;
}

export function finishCombatWindow(state: GameState): GameState {
  completedWindow(state);
  const stage = state.combat?.stage;
  if (
    state.turn.step !== "combat" ||
    state.priorityWindow?.origin !== "combat" ||
    !stage?.endsWith("-window")
  )
    throw new Error("No combat window to finish");
  const next = structuredClone(state);
  next.priorityWindow = null;
  next.combat!.stage =
    stage === "attackers-window"
      ? "attackers"
      : stage === "blockers-window"
        ? "blockers"
        : "damage";
  return next;
}

export interface CombatEvaluation {
  mustBlock?(state: GameState, blockerId: string): boolean;
  minimumBlockers?(state: GameState, attackerId: string): number;
  mustAttack?(state: GameState, id: string): boolean;
  /** Required by releases containing PSYCHOSIS; absent only for pools without it. */
  psychosis?: PsychosisEvaluation;
  characteristics: ReadonlyMap<string, CardCharacteristics>;
  canAttack(state: GameState, id: string): boolean;
  hasStamina(state: GameState, id: string): boolean;
  canBlock(state: GameState, blockerId: string, attackerId: string): boolean;
}
function requireDecision(
  state: GameState,
  userId: string,
  revision: number,
  stage: "attackers" | "blockers",
  player: Seat,
): void {
  requireSettled(state);
  if (
    state.turn.step !== "combat" ||
    state.combat?.stage !== stage ||
    state.priorityWindow
  )
    throw new Error("Combat decision unavailable");
  if (state.players[player].userId !== userId)
    throw new Error("Not the deciding player");
  if (state.revision !== revision) throw new Error("Stale revision");
}
function refreshedCharacter(
  state: GameState,
  id: string,
  player: Seat,
  evaluated: CombatEvaluation,
): boolean {
  const object = state.objects[id];
  return (
    !!object &&
    state.arena.includes(id) &&
    object.controller === player &&
    !object.running &&
    evaluated.characteristics.get(id)?.cardType === "character"
  );
}

/** Shared by command validation and participant action projection. */
export function canDeclareAttacker(
  state: GameState,
  id: string,
  evaluated: CombatEvaluation,
): boolean {
  return (
    refreshedCharacter(state, id, state.turn.activePlayer, evaluated) &&
    evaluated.canAttack(structuredClone(state), id)
  );
}
export function canDeclareBlocker(
  state: GameState,
  blockerId: string,
  attackerId: string,
  evaluated: CombatEvaluation,
): boolean {
  return (
    refreshedCharacter(
      state,
      blockerId,
      (1 - state.turn.activePlayer) as Seat,
      evaluated,
    ) &&
    !!state.combat?.attackers.includes(attackerId) &&
    state.arena.includes(attackerId) &&
    state.objects[attackerId].controller === state.turn.activePlayer &&
    evaluated.characteristics.get(attackerId)?.cardType === "character" &&
    evaluated.canBlock(structuredClone(state), blockerId, attackerId)
  );
}

export function declareAttackers(
  state: GameState,
  userId: string,
  revision: number,
  ids: readonly string[],
  evaluated: CombatEvaluation,
): GameState {
  const player = state.turn.activePlayer;
  requireDecision(state, userId, revision, "attackers", player);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate attacker");
  for (const id of ids)
    if (!canDeclareAttacker(state, id, evaluated))
      throw new Error(`Illegal attacker: ${id}`);
  for (const id of state.arena)
    if (
      canDeclareAttacker(state, id, evaluated) &&
      evaluated.mustAttack?.(state, id) &&
      !ids.includes(id)
    )
      throw Error(`Required attacker omitted: ${id}`);
  let next = structuredClone(state);
  next.combat!.attackers = [...ids];
  next.combat!.stage = "blockers-window";
  const running = ids.filter(
    (id) => !evaluated.hasStamina(structuredClone(state), id),
  );
  for (const id of running) next.objects[id].running = true;
  next = recordPersistentRuns(next, running, state);
  if (evaluated.psychosis)
    next = resolvePsychosis(
      next,
      state,
      ids,
      { type: "attack" },
      evaluated.psychosis,
    );
  for (const id of next.outcome ? [] : next.combat!.attackers) {
    next.pendingRuleEvents.push({
      type: "character-attacked",
      ...captureEventObservation(next),
      player,
      instanceId: id,
      defendingPlayer: (1 - player) as Seat,
    });
  }
  next.revision++;
  assertGameZones(next);
  return next;
}

export function declareBlockers(
  state: GameState,
  userId: string,
  revision: number,
  assignments: readonly { blockerId: string; attackerId: string }[],
  evaluated: CombatEvaluation,
): GameState {
  const player = (1 - state.turn.activePlayer) as Seat;
  requireDecision(state, userId, revision, "blockers", player);
  if (
    new Set(assignments.map((assignment) => assignment.blockerId)).size !==
    assignments.length
  )
    throw new Error("Duplicate blocker");
  for (const { blockerId, attackerId } of assignments) {
    if (!canDeclareBlocker(state, blockerId, attackerId, evaluated))
      throw new Error("Illegal blocker assignment");
  }
  for (const attackerId of state.combat!.attackers) {
    const count = assignments.filter((a) => a.attackerId === attackerId).length;
    if (
      count > 0 &&
      count < (evaluated.minimumBlockers?.(state, attackerId) ?? 1)
    )
      throw Error("Attacker requires more blockers");
  }
  if (
    evaluated.mustBlock &&
    canSatisfyMoreBlocks(
      state.arena.map((id) => ({
        id,
        required: !!evaluated.mustBlock!(state, id),
        attackers: state.combat!.attackers.filter((attackerId) =>
          canDeclareBlocker(state, id, attackerId, evaluated),
        ),
      })),
      new Map(
        state.combat!.attackers.map((id) => [
          id,
          evaluated.minimumBlockers?.(state, id) ?? 1,
        ]),
      ),
      assignments,
    )
  )
    throw Error("An able character must block");
  const next = structuredClone(state);
  next.combat!.blockers = structuredClone([...assignments]);
  next.combat!.stage = "damage-window";
  for (const assignment of assignments)
    next.pendingRuleEvents.push({
      type: "character-blocked",
      ...captureEventObservation(next),
      blockingBatch: structuredClone([...assignments]),
      blockingGroup: assignments
        .filter((a) => a.attackerId === assignment.attackerId)
        .map((a) => a.blockerId),
      player,
      instanceId: assignment.blockerId,
      attackerId: assignment.attackerId,
    });
  next.revision++;
  return next;
}
