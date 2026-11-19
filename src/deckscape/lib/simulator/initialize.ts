import { assertGameZones, type GameState } from "./game-state";
import { expireSystemCheckImmunities } from "./psychosis-immunity";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";
import {
  captureEventObservation,
  type EventObservation,
} from "./event-observation";
import {
  changePersistentStatus,
  type PersistentStatusEvent,
} from "./persistent-status";

export type InitializeEvent =
  | ({
      type: "system-checked";
      player: Seat;
      underfunded: string[];
    } & Partial<EventObservation>)
  | PersistentStatusEvent;

function requireIdle(state: GameState): void {
  if (
    state.outcome ||
    state.cache.length ||
    state.priorityWindow ||
    state.pendingRuleEvents.length ||
    state.pendingTriggers.length
  )
    throw new Error("Initialize effects are pending or game has ended");
}

export interface SystemCheckEvaluation {
  definitions: ReadonlyMap<string, CardCharacteristics>;
  /** Effective upkeep commitment, including continuous cost changes. */
  requiredRam(state: GameState, instanceId: string): number;
  /** Must perform instability rolls and simultaneous destruction through the effect interpreter. */
  resolveInstability(state: GameState, player: Seat): GameState;
}

/** CR 501.2: inspect active player's characters before emitting on-system-check. */
export function performSystemCheck(
  state: GameState,
  evaluated: SystemCheckEvaluation,
): GameState {
  requireIdle(state);
  if (state.turn.step !== "system-check" || state.turn.systemCheckComplete)
    throw new Error("System check is not pending");
  state = expireSystemCheckImmunities(state);
  const player = state.turn.activePlayer;
  const underfunded: string[] = [];
  for (const id of state.arena) {
    const object = state.objects[id];
    if (object.controller !== player) continue;
    const card = evaluated.definitions.get(object.definitionVersion);
    if (!card) throw new Error("Missing system check definition");
    if (card.cardType !== "character") continue;
    const required = evaluated.requiredRam(structuredClone(state), id);
    if (!Number.isSafeInteger(required) || required < 0)
      throw new Error("Invalid required RAM");
    const committed = state.arena.filter((ramId) => {
      const ram = state.objects[ramId];
      return (
        evaluated.definitions.get(ram.definitionVersion)?.cardType === "ram" &&
        ram.attachments.some(
          (link) => link.kind === "ram" && link.hostId === id,
        )
      );
    }).length;
    if (committed < required) underfunded.push(id);
  }
  let next = structuredClone(state);
  if (underfunded.length) next = evaluated.resolveInstability(next, player);
  next.turn.systemCheckComplete = true;
  if (!next.outcome)
    next.pendingRuleEvents.push({
      type: "system-checked",
      ...captureEventObservation(next),
      player,
      underfunded,
    });
  assertGameZones(next);
  return next;
}

export interface RefreshEvaluation {
  canRefresh(state: GameState, instanceId: string): boolean;
  canReboot(state: GameState, instanceId: string): boolean;
}

/** CR 501.3: refresh and reboot controlled objects, then let their events resolve. */
export function enterRefresh(
  state: GameState,
  evaluated: RefreshEvaluation,
): GameState {
  requireIdle(state);
  if (state.turn.step !== "system-check" || !state.turn.systemCheckComplete)
    throw new Error("System check must complete before refresh");
  const active = state.turn.activePlayer;
  const ids = [
    ...state.arena,
    ...state.environment,
    ...state.players.flatMap((player) => [
      ...player.zones.mainframe,
      ...player.zones.ramBank,
    ]),
  ];
  const next = changePersistentStatus(
    state,
    null,
    ids
      .filter((id) => state.objects[id].controller === active)
      .flatMap((instanceId) => [
        { instanceId, operation: "refresh" as const },
        { instanceId, operation: "reboot" as const },
      ]),
    {
      allowed: (snapshot, id, operation) =>
        operation === "refresh"
          ? evaluated.canRefresh(snapshot, id)
          : evaluated.canReboot(snapshot, id),
    },
  );
  next.turn.step = "refresh";
  return next;
}
