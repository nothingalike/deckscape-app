import type { GameObject, GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";
import type { TimedStatEffect } from "./timed-stat-effects";
import { captureEventZones, type EventZones } from "./event-zones";

export interface CounterPlacement {
  instanceId: string;
  counter: string;
  amount: number;
}
export interface CounterAddedEvent extends CounterPlacement {
  type: "counters-added";
  sourceId: string;
  player: Seat;
  observers: GameObject[];
  statEffectsBefore: TimedStatEffect[];
  zonesAtEvent: EventZones;
}

/** Apply an already replacement-evaluated simultaneous batch before any SBA check. */
export function putCharacterCounters(
  state: GameState,
  sourceId: string,
  placements: readonly CounterPlacement[],
  characteristics: ReadonlyMap<string, CardCharacteristics>,
): GameState {
  return putCounters(state, sourceId, placements, characteristics, "character");
}

/** Mainframe counters retain the same simultaneous event and replacement boundary. */
export function putMainframeCounters(
  state: GameState,
  sourceId: string,
  placements: readonly CounterPlacement[],
  characteristics: ReadonlyMap<string, CardCharacteristics>,
): GameState {
  return putCounters(state, sourceId, placements, characteristics, "mainframe");
}

/** Self-references can place counters on a persistent even if its current type changed. */
export function putInPlayCounters(
  state: GameState,
  sourceId: string,
  placements: readonly CounterPlacement[],
  characteristics: ReadonlyMap<string, CardCharacteristics>,
): GameState {
  return putCounters(state, sourceId, placements, characteristics, "in-play");
}

function putCounters(
  state: GameState,
  sourceId: string,
  placements: readonly CounterPlacement[],
  characteristics: ReadonlyMap<string, CardCharacteristics>,
  kind: "character" | "mainframe" | "in-play",
): GameState {
  if (state.outcome || !sourceId)
    throw new Error("Counter placement unavailable");
  const zone =
    kind === "in-play"
      ? [
          ...state.arena,
          ...state.environment,
          ...state.players.flatMap((player) => [
            ...player.zones.mainframe,
            ...player.zones.ramBank,
          ]),
        ]
      : kind === "character"
        ? state.arena
        : state.players.flatMap((player) => player.zones.mainframe);
  for (const item of placements)
    if (
      !zone.includes(item.instanceId) ||
      (kind === "in-play"
        ? !characteristics.has(item.instanceId)
        : characteristics.get(item.instanceId)?.cardType !== kind) ||
      !item.counter ||
      !Number.isSafeInteger(item.amount) ||
      item.amount < 0
    )
      throw new Error(`Invalid ${kind} counter placement`);
  const next = structuredClone(state);
  for (const item of placements) {
    if (!item.amount) continue;
    const counters = next.objects[item.instanceId].counters;
    const total = (counters[item.counter] ?? 0) + item.amount;
    if (!Number.isSafeInteger(total) || total < 0)
      throw new Error("Counter total exceeds supported range");
    counters[item.counter] = total;
  }
  const observers = [
    ...next.arena,
    ...next.environment,
    ...next.players.flatMap((player) => [
      ...player.zones.mainframe,
      ...player.zones.ramBank,
    ]),
  ].map((id) => structuredClone(next.objects[id]));
  for (const item of placements)
    if (item.amount)
      next.pendingRuleEvents.push({
        ...item,
        type: "counters-added",
        sourceId,
        player: state.objects[item.instanceId].controller,
        observers: structuredClone(observers),
        statEffectsBefore: structuredClone(state.statEffects),
        zonesAtEvent: captureEventZones(next),
      });
  return next;
}
