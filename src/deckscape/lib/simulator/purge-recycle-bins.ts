import { assertGameZones, type GameState } from "./game-state";
import type { Seat } from "./setup";
import { advanceObjectIncarnation } from "./object-incarnation";
import {
  captureEventObservation,
  type EventObservation,
} from "./event-observation";

export interface RecyclePurgedEvent extends EventObservation {
  type: "recycle-card-purged";
  sourceId: string;
  instanceId: string;
  player: Seat;
}

/** Garbage Day moves both entire bins as one batch; it does not destroy in-play objects. */
export function purgeRecycleBins(
  state: GameState,
  sourceId: string,
): GameState {
  const next = structuredClone(state);
  const moved = next.players.flatMap((player, seat) =>
    player.zones.recycleBin.map((id) => ({ id, player: seat as Seat })),
  );
  for (const { id, player } of moved) {
    const card = next.objects[id];
    if (!card || card.owner !== player) throw Error("Invalid recycle-bin card");
    advanceObjectIncarnation(next, id);
    Object.assign(card, {
      controller: card.owner,
      running: false,
      faceDown: false,
      abilitySpent: false,
      attachments: [],
    });
    next.players[player].zones.purge.push(id);
  }
  for (const player of next.players) player.zones.recycleBin = [];
  const observation = captureEventObservation(next);
  for (const { id, player } of moved)
    next.pendingRuleEvents.push({
      type: "recycle-card-purged",
      sourceId,
      instanceId: id,
      player,
      ...observation,
    });
  assertGameZones(next);
  return next;
}
