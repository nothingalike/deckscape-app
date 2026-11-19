import type { GameObject, GameState } from "./game-state";
import {
  captureEventZones,
  restoreEventZones,
  type EventZones,
} from "./event-zones";
import type { TimedStatEffect } from "./timed-stat-effects";

export interface EventObservation {
  observers: GameObject[];
  statEffectsBefore: TimedStatEffect[];
  zonesAtEvent: EventZones;
}

/** Read-only reconstruction for transition conditions; effects still apply to current state. */
export function observeCapturedEvent(
  state: GameState,
  observation: EventObservation,
): GameState {
  const snapshot = structuredClone(state);
  snapshot.statEffects = structuredClone(observation.statEffectsBefore);
  restoreEventZones(snapshot, observation.zonesAtEvent);
  return snapshot;
}

/** Record the completed event before later SBAs or other effects can change synergy.
 * Only canonical event storage receives this snapshot; player views never include it. */
export function captureEventObservation(state: GameState): EventObservation {
  const ids = [
    ...state.arena,
    ...state.environment,
    ...state.players.flatMap((player) => [
      ...player.zones.mainframe,
      ...player.zones.ramBank,
    ]),
  ];
  return {
    observers: ids.map((id) => structuredClone(state.objects[id])),
    statEffectsBefore: structuredClone(state.statEffects),
    zonesAtEvent: captureEventZones(state),
  };
}
