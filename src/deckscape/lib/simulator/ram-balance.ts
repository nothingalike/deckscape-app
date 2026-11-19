import { assertGameZones, type GameState } from "./game-state";
import { advanceObjectIncarnation } from "./object-incarnation";
import type { Seat } from "./setup";
import type { CardCharacteristics } from "./characteristics";
import {
  captureEventObservation,
  type EventObservation,
} from "./event-observation";

export interface RamBalanceDecision {
  type: "ram-balance";
  id: string;
  player: Seat;
  sourceId: string;
  hosts: { hostId: string; required: number; committed: string[] }[];
  available: string[];
}
export interface RamAllocation {
  hostId: string;
  ram: string[];
}
export interface RamBalanceEvaluation {
  characteristics: ReadonlyMap<string, CardCharacteristics>;
}
export interface RamCommitmentEvent extends Partial<EventObservation> {
  type: "ram-commitments-changed";
  player: Seat;
  attached: { ramId: string; hostId: string }[];
  detached: { ramId: string; hostId: string }[];
  before?: EventObservation;
}

function requirements(
  state: GameState,
  player: Seat,
  evaluated: RamBalanceEvaluation,
) {
  const hosts: RamBalanceDecision["hosts"] = [];
  for (const hostId of state.arena) {
    if (state.objects[hostId].controller !== player) continue;
    const card = evaluated.characteristics.get(hostId);
    if (!card) throw new Error("Missing RAM balance characteristics");
    if (card.cardType !== "character") continue;
    if (!Number.isSafeInteger(card.ramCost) || card.ramCost < 0)
      throw new Error("Invalid RAM requirement");
    const committed = Object.values(state.objects)
      .filter((object) =>
        object.attachments.some(
          (link) => link.kind === "ram" && link.hostId === hostId,
        ),
      )
      .map((object) => object.id);
    if (committed.length !== card.ramCost)
      hosts.push({ hostId, required: card.ramCost, committed });
  }
  const available = state.players[player].zones.ramBank.filter((id) => {
    const object = state.objects[id];
    const card = evaluated.characteristics.get(id);
    if (!card) throw new Error("Missing bank RAM characteristics");
    return (
      object.controller === player &&
      !object.attachments.length &&
      card.cardType === "ram"
    );
  });
  return { hosts, available };
}

/** CR 106.4f-g: capture all of one controller's changed requirements in one choice.
 * With no spendable bank RAM and no excess commitments, no decision is required.
 */
export function beginRamBalance(
  state: GameState,
  player: Seat,
  evaluated: RamBalanceEvaluation,
): GameState {
  if (state.outcome || state.pendingDecision || (player !== 0 && player !== 1))
    throw new Error("RAM balance unavailable");
  const { hosts, available } = requirements(state, player, evaluated);
  const next = structuredClone(state);
  if (
    !hosts.some(
      (host) =>
        host.committed.length > host.required ||
        (available.length > 0 && host.committed.length < host.required),
    )
  )
    return next;
  next.pendingDecision = {
    type: "ram-balance",
    id: `ram-balance:${state.revision}:${player}`,
    player,
    sourceId: state.players[player].zones.mainframe[0],
    hosts,
    available,
  };
  return next;
}

export function validateRamBalanceContinuation(
  state: GameState,
  decision: RamBalanceDecision,
): void {
  if (
    !decision.hosts.length ||
    new Set(decision.hosts.map((host) => host.hostId)).size !==
      decision.hosts.length ||
    new Set(decision.available).size !== decision.available.length ||
    decision.sourceId !== state.players[decision.player].zones.mainframe[0]
  )
    throw new Error("Invalid RAM balance continuation");
  for (const host of decision.hosts) {
    if (
      !state.arena.includes(host.hostId) ||
      state.objects[host.hostId].controller !== decision.player ||
      host.committed.length === host.required
    )
      throw new Error("Invalid RAM balance host");
    const committed = Object.values(state.objects)
      .filter((object) =>
        object.attachments.some(
          (link) => link.kind === "ram" && link.hostId === host.hostId,
        ),
      )
      .map((object) => object.id);
    if (JSON.stringify(committed) !== JSON.stringify(host.committed))
      throw new Error("Stale RAM commitments");
  }
  for (const id of decision.available) {
    const object = state.objects[id];
    if (
      !object ||
      !state.players[decision.player].zones.ramBank.includes(id) ||
      object.controller !== decision.player ||
      object.attachments.length
    )
      throw new Error("Stale available RAM");
  }
}

export function answerRamBalance(
  state: GameState,
  userId: string,
  revision: number,
  decisionId: string,
  allocations: readonly RamAllocation[],
  detach: readonly string[],
  evaluated: RamBalanceEvaluation,
): GameState {
  const decision = state.pendingDecision;
  if (
    state.outcome ||
    state.revision !== revision ||
    decision?.type !== "ram-balance" ||
    decision.id !== decisionId
  )
    throw new Error("RAM balance decision unavailable");
  if (state.players[decision.player].userId !== userId)
    throw new Error("Not the deciding player");
  validateRamBalanceContinuation(state, decision);
  const current = requirements(state, decision.player, evaluated);
  if (
    JSON.stringify(current) !==
    JSON.stringify({ hosts: decision.hosts, available: decision.available })
  )
    throw new Error("RAM requirements changed");
  const selected = allocations.flatMap((item) => item.ram);
  if (
    new Set(allocations.map((item) => item.hostId)).size !==
      allocations.length ||
    new Set(selected).size !== selected.length ||
    new Set(detach).size !== detach.length
  )
    throw new Error("Duplicate RAM allocation");
  const shortage = decision.hosts.reduce(
    (sum, host) => sum + Math.max(0, host.required - host.committed.length),
    0,
  );
  if (
    selected.length !== Math.min(shortage, decision.available.length) ||
    selected.some((id) => !decision.available.includes(id))
  )
    throw new Error("Allocate all required available RAM");
  const refreshed = decision.available.filter(
    (id) => !state.objects[id].running,
  ).length;
  if (
    selected.filter((id) => !state.objects[id].running).length !==
    Math.min(selected.length, refreshed)
  )
    throw new Error("Refreshed RAM must be committed first");
  for (const allocation of allocations) {
    const host = decision.hosts.find(
      (item) => item.hostId === allocation.hostId,
    );
    if (
      !host ||
      allocation.ram.length > Math.max(0, host.required - host.committed.length)
    )
      throw new Error("Invalid host allocation");
  }
  const excess = decision.hosts.flatMap((host) =>
    host.committed.length > host.required ? host.committed : [],
  );
  if (detach.some((id) => !excess.includes(id)))
    throw new Error("Invalid excess RAM selection");
  for (const host of decision.hosts)
    if (
      detach.filter((id) => host.committed.includes(id)).length !==
      Math.max(0, host.committed.length - host.required)
    )
      throw new Error("Detach exactly each host's excess RAM");
  const next = structuredClone(state);
  next.pendingDecision = null;
  const event: RamCommitmentEvent = {
    type: "ram-commitments-changed",
    player: decision.player,
    attached: [],
    detached: [],
  };
  for (const allocation of allocations)
    for (const id of allocation.ram) {
      next.players[decision.player].zones.ramBank = next.players[
        decision.player
      ].zones.ramBank.filter((item) => item !== id);
      next.arena.push(id);
      advanceObjectIncarnation(next, id);
      next.objects[id].running = false;
      next.objects[id].attachments = [
        { kind: "ram", hostId: allocation.hostId },
      ];
      event.attached.push({ ramId: id, hostId: allocation.hostId });
    }
  for (const id of detach) {
    const object = next.objects[id];
    event.detached.push({
      ramId: id,
      hostId: decision.hosts.find((host) => host.committed.includes(id))!
        .hostId,
    });
    next.arena = next.arena.filter((item) => item !== id);
    for (const player of next.players)
      player.zones.ramBank = player.zones.ramBank.filter((item) => item !== id);
    object.attachments = [];
    object.running = true;
    object.controller = object.owner;
    next.players[object.owner].zones.ramBank.push(id);
    if (state.arena.includes(id)) advanceObjectIncarnation(next, id);
  }
  next.pendingRuleEvents.push({
    ...event,
    ...captureEventObservation(next),
    before: captureEventObservation(state),
  });
  next.revision++;
  assertGameZones(next);
  return next;
}
