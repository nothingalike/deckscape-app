import { assertGameZones, type GameState } from "./game-state";
import { recordCardPlay } from "./card-play-history";
import { recordObjectTargeting } from "./targeting-events";
import { requireCurrentCardSource } from "./cache-source";
import {
  captureTargetIncarnations,
  isCurrentActionTarget,
} from "./action-targets";
import { advanceObjectIncarnation } from "./object-incarnation";
import {
  attachGear,
  IllegalAttachment,
  type AttachmentEvaluation,
  type GearLink,
} from "./gear-attachment";
import {
  handPermanentPlayProblem,
  permanentPlayOrigin,
  type CharacterPlayEvaluation,
} from "./play-character";
import { payRam } from "./ram";
import { addPriorityAction } from "./priority";
import type { Seat } from "./setup";
import { gearPlayReasons } from "./gear-play-option";
import {
  captureEventObservation,
  type EventObservation,
} from "./event-observation";

export type GearEvent = {
  player: Seat;
  instanceId: string;
} & (
  | ({ type: "gear-played"; subtype: string } & EventObservation)
  | { type: "gear-entered" | "gear-failed-attachment" }
);

/** Base play path; target/port choices are retained on the cache action for revalidation. */
export function playGear(
  state: GameState,
  userId: string,
  revision: number,
  id: string,
  ram: string[],
  targets: GearLink[],
  evaluated: CharacterPlayEvaluation,
  attachment: AttachmentEvaluation,
): GameState {
  if (state.outcome || revision !== state.revision)
    throw new Error("Ended game or stale revision");
  const seat = state.players.findIndex((p) => p.userId === userId);
  if (seat !== 0 && seat !== 1) throw new Error("Not a match participant");
  const problem = handPermanentPlayProblem(state, seat, id, evaluated, "gear");
  if (problem) throw new Error(gearPlayReasons[problem]);
  const announced = attachment.characteristics.get(id);
  if (announced?.cardType !== "gear")
    throw new Error("Announced gear characteristics unavailable");
  const next = structuredClone(state);
  const origin = permanentPlayOrigin(state, seat, id, evaluated)!;
  next.players[seat].zones[origin] = next.players[seat].zones[origin].filter(
    (cardId) => cardId !== id,
  );
  next.objects[id].controller = seat;
  next.objects[id].faceDown = false;
  next.cache.push(id);
  advanceObjectIncarnation(next, id, true);
  attachGear(next, id, targets, attachment); // Validate announcement without retaining early entry.
  const paid = payRam(
    next,
    seat,
    evaluated.ramCost,
    ram,
    evaluated.definitions,
  );
  paid.priorityWindow = addPriorityAction(state.priorityWindow!, {
    id: `play:${state.revision}:${id}`,
    kind: "card",
    sourceId: id,
    controller: seat,
    gearTargets: structuredClone(targets),
    sourceIncarnation: paid.objects[id].incarnation,
    targetIncarnations: captureTargetIncarnations(
      state,
      targets.map((link) => link.hostId),
    ),
  });
  paid.pendingRuleEvents.push({
    type: "gear-played",
    subtype: announced.subtype,
    ...captureEventObservation(paid),
    player: seat,
    instanceId: id,
  });
  recordObjectTargeting(
    paid,
    id,
    seat,
    targets.map((link) => link.hostId),
  );
  recordCardPlay(paid, id, seat, announced);
  paid.revision++;
  assertGameZones(paid);
  return paid;
}

/** CR 304.3e: invalid attachment at resolution bins the gear; payment is not refunded. */
export function resolveGearEntry(
  state: GameState,
  evaluated: AttachmentEvaluation,
): GameState {
  const action = state.priorityWindow?.resolving;
  if (
    state.outcome ||
    !action ||
    action.kind !== "card" ||
    !action.gearTargets ||
    state.pendingRuleEvents.length ||
    state.pendingTriggers.length
  )
    throw new Error("No gear resolution ready");
  if (!state.cache.includes(action.sourceId))
    throw new Error("Resolving gear is absent from cache");
  let next: GameState;
  requireCurrentCardSource(state, action);
  try {
    if (
      action.gearTargets.some(
        (link) => !isCurrentActionTarget(state, action, link.hostId),
      )
    )
      throw new IllegalAttachment("Gear target is a different object");
    next = attachGear(state, action.sourceId, action.gearTargets, evaluated);
    next.pendingRuleEvents.push({
      type: "gear-entered",
      player: action.controller,
      instanceId: action.sourceId,
    });
  } catch (error) {
    if (!(error instanceof IllegalAttachment)) throw error;
    next = structuredClone(state);
    const object = next.objects[action.sourceId];
    next.cache = next.cache.filter((id) => id !== object.id);
    next.players[object.owner].zones.recycleBin.push(object.id);
    advanceObjectIncarnation(next, object.id);
    object.attachments = [];
    object.controller = object.owner;
    next.pendingRuleEvents.push({
      type: "gear-failed-attachment",
      player: action.controller,
      instanceId: object.id,
    });
  }
  assertGameZones(next);
  return next;
}
