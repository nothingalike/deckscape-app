import type { GameObject, GameState } from "./game-state";
import type { Seat } from "./setup";
import type { TimedStatEffect } from "./timed-stat-effects";
import { captureEventZones, type EventZones } from "./event-zones";
import {
  captureEventObservation,
  type EventObservation,
} from "./event-observation";

export type StatusOperation = "run" | "refresh" | "reboot";
export interface PersistentStatusEvent {
  type: "object-ran" | "object-refreshed" | "object-rebooted";
  player: Seat;
  instanceId: string;
  sourceId?: string | null;
  observers?: GameObject[];
  statEffectsBefore?: TimedStatEffect[];
  zonesAtEvent?: EventZones;
  batch?: {
    index: number;
    operations: { type: PersistentStatusEvent["type"]; instanceId: string }[];
    before: EventObservation;
  };
}
export interface StatusEvaluation {
  allowed(
    state: GameState,
    instanceId: string,
    operation: StatusOperation,
  ): boolean;
}

/** Capture a completed simultaneous batch. The caller has already validated and
 * performed each operation; event observation must include every payment/change.
 */
function recordStatusEvents(
  state: GameState,
  events: PersistentStatusEvent[],
  beforeState: GameState,
): GameState {
  const next = structuredClone(state);
  if (!events.length) return next;
  const inPlay = [
    ...next.arena,
    ...next.environment,
    ...next.players.flatMap((p) => [...p.zones.mainframe, ...p.zones.ramBank]),
  ];
  const observers = inPlay.map((id) => structuredClone(next.objects[id]));
  const zonesAtEvent = captureEventZones(next);
  const before = captureEventObservation(beforeState);
  const operations = events.map(({ type, instanceId }) => ({
    type,
    instanceId,
  }));
  for (const [index, event] of events.entries())
    next.pendingRuleEvents.push({
      ...event,
      observers: structuredClone(observers),
      statEffectsBefore: structuredClone(next.statEffects),
      zonesAtEvent: structuredClone(zonesAtEvent),
      batch: {
        index,
        operations: structuredClone(operations),
        before: structuredClone(before),
      },
    });
  return next;
}

/** Costs and attack declarations have their own legality checks. Record their run
 * operations only after the entire batch succeeds, without invoking effect prevention.
 * RAM run to pay for a character is now committed, so its final running flag is false.
 */
export function recordPersistentRuns(
  state: GameState,
  ids: readonly string[],
  beforeState: GameState,
): GameState {
  if (
    state.outcome ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !state.objects[id])
  )
    throw new Error("Invalid completed run batch");
  return recordStatusEvents(
    state,
    ids.map((instanceId) => ({
      type: "object-ran",
      player: state.objects[instanceId].controller,
      instanceId,
      sourceId: null,
    })),
    beforeState,
  );
}

/** CR 701.12/18. Refresh and reboot are independent. Already-satisfied or prohibited
 * operations do nothing; actual changes emit events after the whole evaluated batch.
 */
export function changePersistentStatus(
  state: GameState,
  sourceId: string | null,
  changes: readonly { instanceId: string; operation: StatusOperation }[],
  evaluated: StatusEvaluation,
): GameState {
  if (state.outcome) throw new Error("Game already ended");
  const inPlay = [
    ...state.arena,
    ...state.environment,
    ...state.players.flatMap((p) => [...p.zones.mainframe, ...p.zones.ramBank]),
  ];
  const keys = new Set<string>();
  for (const change of changes) {
    const key = JSON.stringify([change.instanceId, change.operation]);
    if (
      !inPlay.includes(change.instanceId) ||
      !state.objects[change.instanceId] ||
      !["run", "refresh", "reboot"].includes(change.operation) ||
      keys.has(key)
    )
      throw new Error("Invalid persistent status change");
    keys.add(key);
  }
  for (const change of changes)
    if (
      change.operation === "run" &&
      keys.has(JSON.stringify([change.instanceId, "refresh"]))
    )
      throw new Error("Contradictory status changes require resolution");
  const approved = changes.filter((change) => {
    const object = state.objects[change.instanceId];
    const needed =
      change.operation === "reboot"
        ? object.abilitySpent
        : object.running !== (change.operation === "run");
    return (
      needed &&
      evaluated.allowed(
        structuredClone(state),
        change.instanceId,
        change.operation,
      )
    );
  });
  const next = structuredClone(state);
  const events: PersistentStatusEvent[] = [];
  for (const change of approved) {
    const object = next.objects[change.instanceId];
    if (change.operation === "reboot") {
      if (!object.abilitySpent) continue;
      object.abilitySpent = false;
    } else {
      const running = change.operation === "run";
      if (object.running === running) continue;
      object.running = running;
    }
    events.push({
      type:
        change.operation === "run"
          ? "object-ran"
          : change.operation === "refresh"
            ? "object-refreshed"
            : "object-rebooted",
      instanceId: object.id,
      player: object.controller,
      sourceId,
    });
  }
  return recordStatusEvents(next, events, state);
}
