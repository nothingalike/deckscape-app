import { assertGameZones, type GameObject, type GameState } from "./game-state";
import type { Seat } from "./setup";
import { advanceObjectIncarnation } from "./object-incarnation";
import type { TimedStatEffect } from "./timed-stat-effects";
import { captureEventZones, type EventZones } from "./event-zones";
import type { CardCharacteristics } from "./characteristics";
import { captureDepartingActivatedSources } from "./activated-source-information";
import { sourceController } from "./source-controller";

export interface DestructionEvent {
  /** Members of the same simultaneous destruction, with individual attribution. */
  destructionBatch?: { instanceId: string; destroyedBy: Seat | null }[];
  zonesAtEvent: EventZones;
  statEffectsBefore: TimedStatEffect[];
  type: "persistent-destroyed";
  instanceId: string;
  player: Seat;
  sourceId: string | null;
  destroyedBy: Seat | null;
  previous: GameObject;
  observers: GameObject[];
}
export interface PersistentBinEvent {
  zonesAtEvent: EventZones;
  statEffectsBefore: TimedStatEffect[];
  type: "persistent-binned";
  instanceId: string;
  player: Seat;
  previous: GameObject;
  observers: GameObject[];
}
export type DepartureZone =
  "hand" | "recycleBin" | "purge" | "cyberdeck" | "ramDeck";
export interface PersistentMovedEvent {
  replacement?: "spirit" | "zen-garden";
  zonesAtEvent: EventZones;
  statEffectsBefore: TimedStatEffect[];
  type: "persistent-moved";
  instanceId: string;
  player: Seat;
  destination: DepartureZone;
  previous: GameObject;
  observers: GameObject[];
}
export type PersistentDeparture =
  | {
      id: string;
      kind: "destroy";
      sourceId: string | null;
      /** Explicit last-known responsible player, including null for rule-driven destruction. */
      destroyedBy?: Seat | null;
      reason: "normal" | "force-quit" | "cost";
    }
  | { id: string; kind: "bin" }
  | {
      id: string;
      kind: "move";
      destination: DepartureZone;
      position?: "top" | "bottom";
      replacement?: "spirit" | "zen-garden";
    };

/** Applies an already evaluated simultaneous destruction batch. Replacement actions are
 * resolved before this primitive; only objects actually being destroyed belong in ids.
 * Attachment state-based actions, tether following, and token cleanup follow this event.
 */
export function applyDestructionBatch(
  state: GameState,
  ids: readonly string[],
  sourceId: string | null,
  reason: "normal" | "force-quit" | "cost",
  characteristics?: ReadonlyMap<string, CardCharacteristics>,
): GameState {
  return applyPersistentDepartureBatch(
    state,
    ids.map((id) => ({ id, kind: "destroy", sourceId, reason })),
    characteristics,
  );
}

/** CR 705.4: evaluated destruction and binning happen in one simultaneous batch.
 * Binning does not emit a destruction event. Replacement evaluation belongs to the caller.
 * Runtimes must supply pre-departure effective characteristics when queued abilities
 * need last-known source information; announcement snapshots are not a substitute.
 */
export function applyPersistentDepartureBatch(
  state: GameState,
  departures: readonly PersistentDeparture[],
  characteristics?: ReadonlyMap<string, CardCharacteristics>,
  refreshedRamHosts: ReadonlySet<string> = new Set(),
): GameState {
  const ids = departures.map((item) => item.id);
  for (const item of departures)
    if (
      item.kind === "move" &&
      item.replacement === "spirit" &&
      item.destination !== "purge"
    )
      throw new Error("SPIRIT replacements must purge the character");
  for (const item of departures)
    if (
      item.kind === "destroy" &&
      item.destroyedBy !== undefined &&
      item.destroyedBy !== null &&
      item.destroyedBy !== 0 &&
      item.destroyedBy !== 1
    )
      throw new Error("Invalid destruction controller");
  for (const item of departures)
    if (
      item.kind === "move" &&
      (item.destination === "cyberdeck" || item.destination === "ramDeck") &&
      !item.position
    )
      throw new Error("Deck movement requires an evaluated position");
  if (state.outcome) throw new Error("Game already ended");
  if (new Set(ids).size !== ids.length)
    throw new Error("Duplicate destruction target");
  const inPlay = new Set([
    ...state.arena,
    ...state.environment,
    ...state.players.flatMap((p) => p.zones.ramBank),
  ]);
  for (const id of ids)
    if (!inPlay.has(id))
      throw new Error(`Destruction target is not in play: ${id}`);
  const doomed = new Set(ids);
  const destructionBatch = departures.flatMap((departure) =>
    departure.kind === "destroy"
      ? [
          {
            instanceId: departure.id,
            destroyedBy:
              departure.reason === "force-quit"
                ? state.turn.activePlayer
                : departure.destroyedBy === undefined
                  ? sourceController(state, departure.sourceId)
                  : departure.destroyedBy,
          },
        ]
      : [],
  );
  const observers = [
    ...inPlay,
    ...state.players.flatMap((p) => p.zones.mainframe),
  ].map((id) => structuredClone(state.objects[id]));
  const next = structuredClone(state);
  if (characteristics)
    captureDepartingActivatedSources(next, ids, characteristics);
  next.statEffects = next.statEffects.filter(
    (item) => item.targetId === null || !doomed.has(item.targetId),
  );
  // Remove every doomed object before releasing RAM, so a RAM destroyed in the same
  // batch cannot be returned to its bank by its host's departure.
  next.arena = next.arena.filter((id) => !doomed.has(id));
  next.environment = next.environment.filter((id) => !doomed.has(id));
  for (const player of next.players)
    player.zones.ramBank = player.zones.ramBank.filter((id) => !doomed.has(id));
  for (const departure of departures) {
    const { id } = departure;
    const previous = structuredClone(state.objects[id]);
    for (const trigger of next.pendingTriggers) {
      const observed =
        "observers" in trigger.event
          ? trigger.event.observers?.find((o) => o.id === id)
          : undefined;
      if (
        trigger.sourceId === id &&
        observed?.incarnation === previous.incarnation &&
        trigger.departedSourceCounters === undefined
      ) {
        trigger.departedSourceCounters = structuredClone(previous.counters);
        trigger.departedSourceHosts = previous.attachments
          .filter((a) => a.kind === "gear")
          .map((a) => ({
            id: a.hostId,
            incarnation: state.objects[a.hostId].incarnation,
          }));
      }
    }
    Object.assign(next.objects[id], {
      controller: previous.owner,
      running: false,
      abilitySpent: false,
      faceDown: false,
      damage: { MF: 0, BF: 0 },
      lastDamageSourceId: null,
      counters: {},
      attachments: [],
    });
    const destination =
      departure.kind === "move" ? departure.destination : "recycleBin";
    const zone = next.players[previous.owner].zones[destination];
    if (departure.kind === "move" && departure.position === "top")
      zone.unshift(id);
    else zone.push(id);
    advanceObjectIncarnation(next, id);
    const event = {
      zonesAtEvent: captureEventZones(state),
      statEffectsBefore: structuredClone(state.statEffects),
      instanceId: id,
      player: previous.controller,
      previous,
      observers: structuredClone(observers),
    };
    next.pendingRuleEvents.push(
      departure.kind === "destroy"
        ? {
            ...event,
            type: "persistent-destroyed",
            destructionBatch: structuredClone(destructionBatch),
            sourceId: departure.sourceId,
            destroyedBy:
              departure.reason === "force-quit"
                ? state.turn.activePlayer
                : departure.destroyedBy === undefined
                  ? sourceController(state, departure.sourceId)
                  : departure.destroyedBy,
          }
        : departure.kind === "bin"
          ? { ...event, type: "persistent-binned" }
          : {
              ...event,
              type: "persistent-moved",
              destination: departure.destination,
              ...(departure.replacement
                ? { replacement: departure.replacement }
                : {}),
            },
    );
  }
  for (const original of Object.values(state.objects)) {
    if (
      doomed.has(original.id) ||
      !original.attachments.some(
        (link) => link.kind === "ram" && doomed.has(link.hostId),
      )
    )
      continue;
    const ram = next.objects[original.id];
    next.arena = next.arena.filter((id) => id !== ram.id);
    for (const player of next.players)
      player.zones.ramBank = player.zones.ramBank.filter((id) => id !== ram.id);
    ram.attachments = [];
    ram.controller = ram.owner;
    const hostDeparture = departures.find((item) =>
      original.attachments.some(
        (link) => link.kind === "ram" && link.hostId === item.id,
      ),
    )!;
    ram.running = !(
      refreshedRamHosts.has(hostDeparture.id) ||
      (hostDeparture.kind === "destroy" &&
        hostDeparture.reason === "force-quit")
    );
    next.players[ram.owner].zones.ramBank.push(ram.id);
    if (state.arena.includes(ram.id)) advanceObjectIncarnation(next, ram.id);
  }
  assertGameZones(next);
  return next;
}
