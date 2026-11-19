import { assertGameZones, type GameObject, type GameState } from "./game-state";
import { requireCurrentCardSource } from "./cache-source";
import { advanceObjectIncarnation } from "./object-incarnation";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";
import { captureEventZones, type EventZones } from "./event-zones";
import type { TimedStatEffect } from "./timed-stat-effects";
import {
  captureEventObservation,
  type EventObservation,
} from "./event-observation";

export type EnvironmentEvent =
  | (Partial<EventObservation> & {
      type: "environment-entered" | "environment-binned";
      instanceId: string;
      player: Seat;
    })
  | {
      type: "environment-destroyed";
      instanceId: string;
      player: Seat;
      sourceId: string;
      previous: GameObject;
      /** Eligible observers before destruction; the incoming environment was not in play yet. */
      observers: GameObject[];
      zonesAtEvent: EventZones;
      statEffectsBefore: TimedStatEffect[];
    };

export interface EnvironmentEvaluation {
  definitions: ReadonlyMap<string, CardCharacteristics>;
  /** Evaluates active effects such as Multiverse, not a client-selected option. */
  allowsMultiple(state: GameState): boolean;
  /** Shared effect interpreter must apply destruction replacements/prevention here. */
  destroy(state: GameState, instanceId: string, sourceId: string): GameState;
}

/** Evaluated destruction primitive. Replaced destruction uses its replacement's action instead. */
export function destroyEnvironment(
  state: GameState,
  id: string,
  sourceId: string,
  prevented: boolean,
): GameState {
  if (state.outcome || !state.environment.includes(id))
    throw new Error("Environment is not in play");
  const next = structuredClone(state);
  if (prevented) return next;
  const previous = structuredClone(next.objects[id]);
  const observers = [
    ...state.arena,
    ...state.environment,
    ...state.players.flatMap((player) => [
      ...player.zones.mainframe,
      ...player.zones.ramBank,
    ]),
  ].map((objectId) => structuredClone(state.objects[objectId]));
  next.environment = next.environment.filter((objectId) => objectId !== id);
  next.players[previous.owner].zones.recycleBin.push(id);
  advanceObjectIncarnation(next, id);
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
  next.pendingRuleEvents.push({
    type: "environment-destroyed",
    instanceId: id,
    player: previous.controller,
    sourceId,
    previous,
    observers,
    zonesAtEvent: captureEventZones(state),
    statEffectsBefore: structuredClone(state.statEffects),
  });
  assertGameZones(next);
  return next;
}

/** CR 302.3a/404.3: replace the existing environment; if it cannot leave, bin the incoming card. */
export function resolveEnvironmentEntry(
  state: GameState,
  evaluated: EnvironmentEvaluation,
): GameState {
  const action = state.priorityWindow?.resolving;
  if (
    state.outcome ||
    !action ||
    action.kind !== "card" ||
    state.pendingRuleEvents.length ||
    state.pendingTriggers.length
  )
    throw new Error("No environment resolution ready");
  const id = action.sourceId;
  requireCurrentCardSource(state, action);
  const object = state.objects[id];
  const card = object && evaluated.definitions.get(object.definitionVersion);
  if (
    !state.cache.includes(id) ||
    card?.cardType !== "program" ||
    card.subtype !== "environment"
  )
    throw new Error("Resolving card is not a cached environment");
  let next = structuredClone(state);
  if (!evaluated.allowsMultiple(structuredClone(next))) {
    // Multiple environments without an active exception need state-based cleanup before resolution.
    if (next.environment.length > 1)
      throw new Error("Environment state-based actions are pending");
    const existing = next.environment[0];
    if (existing) next = evaluated.destroy(next, existing, id);
  }
  // A replacement may have moved the incoming card or ended the game.
  if (next.outcome || !next.cache.includes(id)) {
    assertGameZones(next);
    return next;
  }
  const hasSpace =
    next.environment.length === 0 ||
    evaluated.allowsMultiple(structuredClone(next));
  next.cache = next.cache.filter((objectId) => objectId !== id);
  advanceObjectIncarnation(next, id, hasSpace);
  if (hasSpace) {
    next.objects[id].controller = action.controller;
    next.objects[id].running = false;
    next.objects[id].abilitySpent = false;
    next.environment.push(id);
  } else {
    next.objects[id].controller = next.objects[id].owner;
    next.objects[id].faceDown = false;
    next.objects[id].attachments = [];
    next.players[next.objects[id].owner].zones.recycleBin.push(id);
  }
  next.pendingRuleEvents.push({
    type: hasSpace ? "environment-entered" : "environment-binned",
    ...captureEventObservation(next),
    instanceId: id,
    player: action.controller,
  });
  assertGameZones(next);
  return next;
}
