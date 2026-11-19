import { assertGameZones, type GameState } from "./game-state";
import type { Seat } from "./setup";
import { openPriority } from "./priority";

export interface DeployEvent {
  type: "deploy-started";
  player: Seat;
}
export interface ForceQuitEvaluation {
  canForceQuit(state: GameState, id: string): boolean;
  /** All selected persistents are attempted once together, with replacement effects applied. */
  destroySimultaneously(
    state: GameState,
    ids: readonly string[],
    player: Seat,
  ): GameState;
}
function requireIdle(state: GameState): void {
  if (
    state.outcome ||
    state.cache.length ||
    state.priorityWindow ||
    state.pendingRuleEvents.length ||
    state.pendingTriggers.length
  )
    throw new Error("Pending effects or ended game");
}

/** CR 501.5: one complete selection, including choosing none, with no response window. */
export function chooseForceQuit(
  state: GameState,
  userId: string,
  revision: number,
  ids: readonly string[],
  evaluated: ForceQuitEvaluation,
): GameState {
  requireIdle(state);
  if (revision !== state.revision) throw new Error("Stale revision");
  const player = state.turn.activePlayer;
  if (state.players[player].userId !== userId)
    throw new Error("Not the active player");
  if (state.turn.step !== "force-quit" || state.turn.forceQuitComplete)
    throw new Error("Force quit is not pending");
  if (new Set(ids).size !== ids.length)
    throw new Error("Duplicate force-quit selection");
  const inPlay = new Set([
    ...state.arena,
    ...state.environment,
    ...state.players.flatMap((p) => p.zones.ramBank),
  ]);
  for (const id of ids) {
    if (
      !inPlay.has(id) ||
      state.objects[id].controller !== player ||
      !evaluated.canForceQuit(structuredClone(state), id)
    )
      throw new Error(`Illegal force-quit selection: ${id}`);
  }
  let next = structuredClone(state);
  if (ids.length)
    next = evaluated.destroySimultaneously(next, [...ids], player);
  next.turn.forceQuitComplete = true;
  next.revision++;
  assertGameZones(next);
  return next;
}

/** CR 501.6/502.2: deploy triggers resolve before giving the active player priority. */
export function enterDeploy(state: GameState): GameState {
  requireIdle(state);
  if (state.turn.step !== "force-quit" || !state.turn.forceQuitComplete)
    throw new Error("Force quit must complete");
  const next = structuredClone(state);
  next.turn.step = "deploy";
  next.pendingRuleEvents.push({
    type: "deploy-started",
    player: state.turn.activePlayer,
  });
  return next;
}

export function beginDeployPriority(state: GameState): GameState {
  requireIdle(state);
  if (state.turn.step !== "deploy") throw new Error("Not in deploy");
  const next = structuredClone(state);
  next.priorityWindow = openPriority(state.turn.activePlayer, "deploy");
  return next;
}
