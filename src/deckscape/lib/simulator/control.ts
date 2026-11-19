import type { CardCharacteristics } from "./characteristics";
import type { GameObject, GameState } from "./game-state";
import type { Seat } from "./setup";
import type { TimedStatEffect } from "./timed-stat-effects";
import { captureEventZones, type EventZones } from "./event-zones";

export interface ControlChange {
  instanceId: string;
  controller: Seat;
}
export interface ControlChangedEvent {
  type: "control-changed";
  instanceId: string;
  sourceId: string;
  previousController: Seat;
  player: Seat;
  observers: GameObject[];
  statEffectsBefore: TimedStatEffect[];
  zonesAtEvent: EventZones;
}

/** Apply resolved layer-2 control changes together, before attachment SBAs (CR 612.1b). */
export function changePersistentControl(
  state: GameState,
  sourceId: string,
  changes: readonly ControlChange[],
  characteristics: ReadonlyMap<string, CardCharacteristics>,
): GameState {
  if (state.outcome || !sourceId) throw new Error("Control change unavailable");
  const inPlay = [
    ...state.arena,
    ...state.environment,
    ...state.players.flatMap((p) => [...p.zones.mainframe, ...p.zones.ramBank]),
  ];
  const seen = new Set<string>();
  for (const change of changes) {
    if (
      !inPlay.includes(change.instanceId) ||
      !state.objects[change.instanceId] ||
      !characteristics.has(change.instanceId) ||
      (change.controller !== 0 && change.controller !== 1) ||
      seen.has(change.instanceId)
    )
      throw new Error("Invalid persistent control change");
    seen.add(change.instanceId);
  }
  const next = structuredClone(state);
  const changed = changes.filter(
    (change) =>
      state.objects[change.instanceId].controller !== change.controller,
  );
  for (const change of changed) {
    next.objects[change.instanceId].controller = change.controller;
    if (
      next.combat &&
      characteristics.get(change.instanceId)?.cardType === "character"
    ) {
      next.combat.attackers = next.combat.attackers.filter(
        (id) => id !== change.instanceId,
      );
      next.combat.blockers = next.combat.blockers.filter(
        (block) =>
          block.blockerId !== change.instanceId &&
          block.attackerId !== change.instanceId,
      );
    }
  }
  const observers = inPlay.map((id) => structuredClone(next.objects[id]));
  for (const change of changed) {
    next.pendingRuleEvents.push({
      type: "control-changed",
      instanceId: change.instanceId,
      sourceId,
      previousController: state.objects[change.instanceId].controller,
      player: change.controller,
      observers: structuredClone(observers),
      statEffectsBefore: structuredClone(state.statEffects),
      zonesAtEvent: captureEventZones(next),
    });
  }
  return next;
}
