import { assertGameZones, type GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";
import { advanceObjectIncarnation } from "./object-incarnation";
import { captureEventObservation } from "./event-observation";

/** One whole draw instruction, with its additive replacements already evaluated.
 * CR 118.2 still moves individual cards in order. Additional draws belong to this
 * instruction and are never recursively passed through the same replacement. */
export function drawCards(
  state: GameState,
  player: Seat,
  count: number,
  evaluated: {
    additionalCards: number;
    prohibited(state: GameState, player: Seat): boolean;
  },
): GameState {
  if (state.outcome) throw new Error("Game already ended");
  if (
    (player !== 0 && player !== 1) ||
    !Number.isSafeInteger(count) ||
    count < 0 ||
    !Number.isSafeInteger(evaluated.additionalCards) ||
    evaluated.additionalCards < 0 ||
    !Number.isSafeInteger(count + evaluated.additionalCards)
  )
    throw new Error("Invalid evaluated draw count");
  let next = structuredClone(state);
  if (count === 0) return next;
  for (
    let remaining = count + evaluated.additionalCards;
    remaining > 0 &&
    !next.outcome &&
    next.players[player].zones.cyberdeck.length;
    remaining--
  ) {
    if (evaluated.prohibited(structuredClone(next), player)) break;
    next = drawOne(next, player, false);
  }
  return next;
}

/** One evaluated effect action (CR 118). Replacement effects run before this primitive. */
export function drawOne(
  state: GameState,
  player: Seat,
  prohibited: boolean,
): GameState {
  if (state.outcome) throw new Error("Game already ended");
  const next = structuredClone(state);
  if (prohibited) return next;
  const id = next.players[player].zones.cyberdeck.shift();
  if (id === undefined) return next;
  next.players[player].zones.hand.push(id);
  advanceObjectIncarnation(next, id);
  next.pendingRuleEvents.push({
    type: "card-drawn",
    player,
    instanceId: id,
    ...captureEventObservation(next),
  });
  assertGameZones(next);
  return next;
}

/** CR 119: only the top RAM is installed, in its evaluated running/refreshed state. */
export function installOne(
  state: GameState,
  player: Seat,
  evaluated: {
    prohibited: boolean;
    running: boolean;
    definitions: ReadonlyMap<string, CardCharacteristics>;
  },
): GameState {
  if (state.outcome) throw new Error("Game already ended");
  const next = structuredClone(state);
  if (evaluated.prohibited) return next;
  const id = next.players[player].zones.ramDeck[0];
  if (id === undefined) return next;
  const card = evaluated.definitions.get(next.objects[id].definitionVersion);
  if (!card) throw new Error("Missing installed card definition");
  if (card.cardType !== "ram") return next;
  next.players[player].zones.ramDeck.shift();
  next.players[player].zones.ramBank.push(id);
  advanceObjectIncarnation(next, id);
  Object.assign(next.objects[id], {
    controller: player,
    running: evaluated.running,
    faceDown: false,
    abilitySpent: false,
    damage: { MF: 0, BF: 0 },
    lastDamageSourceId: null,
    counters: {},
    attachments: [],
  });
  next.pendingRuleEvents.push({
    type: "ram-installed",
    ...captureEventObservation(next),
    player,
    instanceId: id,
  });
  assertGameZones(next);
  return next;
}
