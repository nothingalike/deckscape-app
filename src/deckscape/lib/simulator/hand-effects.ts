import { assertGameZones, type GameState } from "./game-state";
import type { Seat } from "./setup";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import {
  captureEventObservation,
  type EventObservation,
} from "./event-observation";
import { advanceObjectIncarnation } from "./object-incarnation";

export type HandEvent = EventObservation &
  (
    | {
        type: "hand-revealed";
        sourceId: string;
        player: Seat;
        instanceIds: string[];
      }
    | {
        type: "card-discarded";
        sourceId: string;
        player: Seat;
        instanceId: string;
      }
  );

/** Public card snapshots preserve what was revealed without granting ongoing hand visibility. */
export function revealHand(
  state: GameState,
  sourceId: string,
  player: Seat,
  characteristics: ReadonlyMap<string, CardCharacteristics>,
): GameState {
  if (state.outcome || !state.objects[sourceId])
    throw new Error("Hand reveal unavailable");
  const next = structuredClone(state),
    ids = [...next.players[player].zones.hand];
  for (const id of ids) {
    const card = characteristics.get(id);
    if (!card) throw new Error("Revealed card characteristics unavailable");
    next.reveals.push({
      player,
      definitionVersion: next.objects[id].definitionVersion,
      characteristics: characteristicsSchema.parse(card),
    });
  }
  next.pendingRuleEvents.push({
    type: "hand-revealed",
    sourceId,
    player,
    instanceIds: ids,
    ...captureEventObservation(next),
  });
  return next;
}

/** CR 701.6: an evaluated discard moves a hand card to its owner's recycle bin. */
export function discardHandCard(
  state: GameState,
  sourceId: string,
  player: Seat,
  id: string,
): GameState {
  if (
    state.outcome ||
    !state.objects[sourceId] ||
    !state.players[player].zones.hand.includes(id) ||
    state.objects[id]?.owner !== player
  )
    throw new Error("Discarded hand card unavailable");
  const next = structuredClone(state),
    card = next.objects[id];
  next.players[player].zones.hand = next.players[player].zones.hand.filter(
    (value) => value !== id,
  );
  next.players[card.owner].zones.recycleBin.push(id);
  Object.assign(card, {
    controller: card.owner,
    running: false,
    faceDown: false,
    abilitySpent: false,
    attachments: [],
  });
  advanceObjectIncarnation(next, id);
  next.pendingRuleEvents.push({
    type: "card-discarded",
    sourceId,
    player,
    instanceId: id,
    ...captureEventObservation(next),
  });
  assertGameZones(next);
  return next;
}
