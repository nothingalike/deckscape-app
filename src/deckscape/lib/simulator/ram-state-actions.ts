import { assertGameZones, type GameState } from "./game-state";
import { advanceObjectIncarnation } from "./object-incarnation";
import type { CardCharacteristics } from "./characteristics";
import type { RamCommitmentEvent } from "./ram-balance";
import type { Seat } from "./setup";
import { captureEventObservation } from "./event-observation";

/** CR 106.4b/i and 705.6g/r. Cached characters retain paid commitments in the bank;
 * in-play characters take their RAM into the arena; illegal hosts release RAM running.
 * This does not choose new commitments or detach excess: those use the controller decision.
 */
export function normalizeRamCommitments(
  state: GameState,
  characteristics: ReadonlyMap<string, CardCharacteristics>,
): { state: GameState; changed: boolean } {
  const next = structuredClone(state);
  if (state.outcome || state.pendingDecision)
    return { state: next, changed: false };
  let changed = false;
  const events = new Map<Seat, RamCommitmentEvent>();
  for (const id of [
    ...state.arena,
    ...state.players.flatMap((player) => player.zones.ramBank),
  ]) {
    const original = state.objects[id];
    const links = original.attachments.filter((link) => link.kind === "ram");
    if (!links.length) continue;
    if (
      links.length !== 1 ||
      original.attachments.length !== 1 ||
      characteristics.get(id)?.cardType !== "ram"
    )
      throw new Error("Invalid RAM commitment object");
    const hostId = links[0].hostId;
    const host = characteristics.get(hostId);
    const hostAvailable =
      state.arena.includes(hostId) || state.cache.includes(hostId);
    if (hostAvailable && !host)
      throw new Error("Missing commitment host characteristics");
    const object = next.objects[id];
    if (!hostAvailable || host?.cardType !== "character") {
      next.arena = next.arena.filter((item) => item !== id);
      for (const player of next.players)
        player.zones.ramBank = player.zones.ramBank.filter(
          (item) => item !== id,
        );
      next.players[object.owner].zones.ramBank.push(id);
      if (state.arena.includes(id)) advanceObjectIncarnation(next, id);
      object.attachments = [];
      object.controller = object.owner;
      object.running = true;
      const event = events.get(original.controller) ?? {
        type: "ram-commitments-changed",
        player: original.controller,
        attached: [],
        detached: [],
      };
      event.detached.push({ ramId: id, hostId });
      events.set(original.controller, event);
      changed = true;
    } else {
      if (object.running) {
        object.running = false;
        changed = true;
      }
      if (state.arena.includes(hostId) && !state.arena.includes(id)) {
        for (const player of next.players)
          player.zones.ramBank = player.zones.ramBank.filter(
            (item) => item !== id,
          );
        next.arena.push(id);
        advanceObjectIncarnation(next, id);
        changed = true;
      }
    }
  }
  if (events.size) {
    const after = captureEventObservation(next),
      before = captureEventObservation(state);
    next.pendingRuleEvents.push(
      ...[...events.values()].map((event) => ({
        ...event,
        ...structuredClone(after),
        before: structuredClone(before),
      })),
    );
  }
  assertGameZones(next);
  return { state: next, changed };
}
