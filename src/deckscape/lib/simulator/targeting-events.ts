import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import {
  captureEventObservation,
  type EventObservation,
} from "./event-observation";

export interface ObjectTargetedEvent extends EventObservation {
  type: "object-targeted";
  sourceId: string;
  sourceController: Seat;
  instanceId: string;
  incarnation: number;
  player: Seat;
}

/** Record a completed targeting announcement, once per newly targeted object.
 * Retargeting callers supply the old target set; retaining a target is not a new event.
 * Player targets have no object incarnation and are outside this observation. */
export function recordObjectTargeting(
  state: GameState,
  sourceId: string,
  sourceController: Seat,
  targets: readonly string[],
  previousTargets: readonly string[] = [],
): void {
  if (!sourceId || (sourceController !== 0 && sourceController !== 1))
    throw new Error("Invalid targeting source");
  const added = [...new Set(targets)].filter(
    (id) => !previousTargets.includes(id),
  );
  for (const id of added)
    if (
      !state.objects[id] ||
      !Number.isSafeInteger(state.objects[id].incarnation) ||
      state.objects[id].incarnation < 0
    )
      throw new Error("Invalid targeting recipient");
  if (!added.length) return;
  const observation = captureEventObservation(state);
  for (const id of added)
    state.pendingRuleEvents.push({
      type: "object-targeted",
      sourceId,
      sourceController,
      instanceId: id,
      incarnation: state.objects[id].incarnation,
      player: state.objects[id].controller,
      ...structuredClone(observation),
    });
}
