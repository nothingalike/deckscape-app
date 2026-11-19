import { assertGameZones, type GameState } from "./game-state";
import { advanceObjectIncarnation } from "./object-incarnation";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";
import { requireCurrentCardSource } from "./cache-source";
import { isCurrentActionTarget } from "./action-targets";
import {
  captureEventObservation,
  type EventObservation,
} from "./event-observation";

export interface ProtocolEvent extends Partial<EventObservation> {
  type: "protocol-entered" | "protocol-binned" | "protocol-moved";
  player: Seat;
  instanceId: string;
  mainframeId: string;
}

/** CR 302.2c.5 and 701.9: movement within the arena retains identity and control.
 * The caller supplies attachment permission, not targeting permission: an effect
 * that says "attach to a different mainframe" does not target that mainframe.
 */
export function moveProtocol(
  state: GameState,
  id: string,
  host: string,
  evaluated: ProtocolEvaluation,
): GameState {
  const object = state.objects[id],
    card = evaluated.characteristics.get(id);
  if (
    state.outcome ||
    !state.arena.includes(id) ||
    card?.cardType !== "program" ||
    card.subtype !== "protocol" ||
    !object ||
    object.attachments.filter((a) => a.kind === "protocol").length !== 1
  )
    throw Error("Protocol movement unavailable");
  if (!legalHost(state, host, evaluated))
    throw Error("Invalid protocol destination");
  if (
    object.attachments.some((a) => a.kind === "protocol" && a.hostId === host)
  )
    return state;
  if (
    state.arena.filter((other) =>
      state.objects[other].attachments.some(
        (a) => a.kind === "protocol" && a.hostId === host,
      ),
    ).length >= 3
  )
    return state;
  const next = structuredClone(state);
  next.objects[id].attachments = object.attachments.map((a) =>
    a.kind === "protocol" ? { ...a, hostId: host } : a,
  );
  next.pendingRuleEvents.push({
    type: "protocol-moved",
    ...captureEventObservation(next),
    player: object.controller,
    instanceId: id,
    mainframeId: host,
  });
  assertGameZones(next);
  return next;
}
export interface ProtocolEvaluation {
  characteristics: ReadonlyMap<string, CardCharacteristics>;
  /** Printed target overrides and restrictions are evaluated by the card handler. */
  permittedMainframes: ReadonlySet<string>;
}
function legalHost(
  state: GameState,
  id: string,
  evaluated: ProtocolEvaluation,
) {
  return (
    evaluated.characteristics.get(id)?.cardType === "mainframe" &&
    state.players.some((p) => p.zones.mainframe.includes(id)) &&
    evaluated.permittedMainframes.has(id)
  );
}

/** CR 303.3b: a full Mainframe is an illegal protocol target. */
export function hasOpenProtocolSlot(state: GameState, host: string): boolean {
  return state.arena.filter((id) => state.objects[id].attachments.some(
    (link) => link.kind === "protocol" && link.hostId === host,
  )).length < 3;
}

/** Validate both targeting permission and current attachment capacity. */
export function validateProtocolTarget(
  state: GameState,
  id: string,
  host: string,
  evaluated: ProtocolEvaluation,
): void {
  const card = evaluated.characteristics.get(id);
  if (card?.cardType !== "program" || card.subtype !== "protocol")
    throw new Error("Card is not a protocol");
  if (!legalHost(state, host, evaluated) || !hasOpenProtocolSlot(state, host))
    throw new Error("Invalid protocol target");
}

export function ownMainframeTargets(
  state: GameState,
  controller: Seat,
): Set<string> {
  return new Set(state.players[controller].zones.mainframe);
}

/** CR 302.3c.5-7: attach in arena under resolving controller, or bin if unavailable. */
export function resolveProtocolEntry(
  state: GameState,
  evaluated: ProtocolEvaluation,
): GameState {
  const action = state.priorityWindow?.resolving;
  if (
    state.outcome ||
    !action ||
    action.kind !== "card" ||
    !action.protocolTarget ||
    state.pendingRuleEvents.length ||
    state.pendingTriggers.length
  )
    throw new Error("No protocol resolution ready");
  const id = action.sourceId,
    mainframeId = action.protocolTarget;
  requireCurrentCardSource(state, action);
  if (!state.cache.includes(id))
    throw new Error("Protocol is absent from cache");
  const card = evaluated.characteristics.get(id);
  if (card?.cardType !== "program" || card.subtype !== "protocol")
    throw new Error("Resolving card is not a protocol");
  const attached = state.arena.filter((objectId) =>
    state.objects[objectId].attachments.some(
      (link) => link.kind === "protocol" && link.hostId === mainframeId,
    ),
  );
  const next = structuredClone(state);
  next.cache = next.cache.filter((objectId) => objectId !== id);
  advanceObjectIncarnation(next, id, true);
  const object = next.objects[id];
  if (
    isCurrentActionTarget(state, action, mainframeId) &&
    legalHost(state, mainframeId, evaluated) &&
    attached.length < 3
  ) {
    object.controller = action.controller;
    object.attachments = [{ kind: "protocol", hostId: mainframeId }];
    next.arena.push(id);
    next.pendingRuleEvents.push({
      type: "protocol-entered",
      ...captureEventObservation(next),
      player: action.controller,
      instanceId: id,
      mainframeId,
    });
  } else {
    delete object.setRamCost;
    object.controller = object.owner;
    object.attachments = [];
    next.players[object.owner].zones.recycleBin.push(id);
    next.pendingRuleEvents.push({
      type: "protocol-binned",
      player: action.controller,
      instanceId: id,
      mainframeId,
    });
  }
  assertGameZones(next);
  return next;
}
