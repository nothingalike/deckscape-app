import { assertGameZones, type GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";
import { takeEffectTimestamp } from "./effect-timestamp";

import type { EventObservation } from "./event-observation";
export interface TokenCreatedEvent extends Partial<EventObservation> {
  type: "token-created";
  instanceId: string;
  player: Seat;
  sourceId: string;
}

/** The creating effect registers its exact token definition with the pinned runtime.
 * CR 110.6b/110.7c: creator's chosen controller owns the token; entry is refreshed by default.
 */
export function createCharacterToken(
  state: GameState,
  player: Seat,
  sourceId: string,
  definitionVersion: string,
  definitions: ReadonlyMap<string, CardCharacteristics>,
  running = false,
  prepareEntry?: (state: GameState, id: string) => GameState,
): GameState {
  if (
    state.outcome ||
    (player !== 0 && player !== 1) ||
    !sourceId ||
    !/^[a-f0-9]{64}$/.test(definitionVersion) ||
    definitions.get(definitionVersion)?.cardType !== "character"
  )
    throw new Error("Invalid character token creation");
  if (
    !Number.isSafeInteger(state.nextTokenNumber) ||
    state.nextTokenNumber < 0 ||
    !Number.isSafeInteger(state.nextTokenNumber + 1)
  )
    throw new Error("Token identity sequence exhausted");
  const id = `token:${state.nextTokenNumber}`;
  if (state.objects[id]) throw new Error("Token identity collision");
  let next = structuredClone(state);
  next.nextTokenNumber++;
  next.objects[id] = {
    id,
    token: true,
    incarnation: 0,
    timestamp: takeEffectTimestamp(next),
    definitionVersion,
    owner: player,
    controller: player,
    running,
    abilitySpent: false,
    faceDown: false,
    damage: { MF: 0, BF: 0 },
    lastDamageSourceId: null,
    lastDamagedTurn: null,
    counters: {},
    attachments: [],
  };
  next.arena.push(id);
  if (prepareEntry) next = prepareEntry(next, id);
  next.pendingRuleEvents.push({
    type: "token-created",
    instanceId: id,
    player,
    sourceId,
  });
  assertGameZones(next);
  return next;
}

/** CR 705.6h: remove departed tokens while retaining already captured event/ability data.
 * Host-following and illegal-attachment movement must be processed first; never silently
 * detach gear here (which would change destruction into binning or lose a tether choice).
 */
export function ceaseDepartedTokens(state: GameState): {
  state: GameState;
  changed: boolean;
} {
  const inPlay = new Set([
    ...state.arena,
    ...state.environment,
    ...state.players.flatMap((player) => player.zones.ramBank),
  ]);
  const gone = new Set(
    Object.values(state.objects)
      .filter(
        (object) =>
          (object.token && !inPlay.has(object.id)) ||
          (object.scriptCopy &&
            !state.cache.includes(object.id) &&
            !(
              state.pendingDecision?.type === "ducky-play" &&
              state.pendingDecision.cardId === object.id
            )),
      )
      .map((object) => object.id),
  );
  for (const object of Object.values(state.objects))
    if (
      !gone.has(object.id) &&
      object.attachments.some((link) => gone.has(link.hostId))
    )
      throw new Error(
        "Resolve departed token attachments before token cleanup",
      );
  const next = structuredClone(state);
  next.cache = next.cache.filter((id) => !gone.has(id));
  for (const player of next.players)
    for (const zone of Object.keys(
      player.zones,
    ) as (keyof typeof player.zones)[])
      player.zones[zone] = player.zones[zone].filter((id) => !gone.has(id));
  for (const id of gone) delete next.objects[id];
  assertGameZones(next);
  return { state: next, changed: gone.size > 0 };
}
