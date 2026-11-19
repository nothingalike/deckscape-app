import type { GameState } from "./game-state";
import { assertGameZones } from "./game-state";
import type { Seat } from "./setup";
import type { CardCharacteristics } from "./characteristics";
import type { CounterPlacement } from "./put-counters";
import type { PersistentDeparture } from "./destruction";
import type { EventBehavior } from "./rule-events";
import { ruleEventObservationState } from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import { advanceObjectIncarnation } from "./object-incarnation";
import { captureEventObservation } from "./event-observation";
import spec from "./mad-hatter-specification-v5.json";

interface TeaPartyEffects {
  characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
  putCounters(
    s: GameState,
    source: string,
    placements: readonly CounterPlacement[],
  ): GameState;
  prepareEntry(s: GameState, id: string): GameState;
}

/** Direct entry does not announce a play, pay a cost or create a cache action.
 * An iconic entry prohibited by 613.8 stays in its previous zone. */
export function enterTeaParty(
  s: GameState,
  player: Seat,
  source: string,
  id: string,
  e: TeaPartyEffects,
): GameState {
  const current = e.characteristics(s),
    card = current.get(id);
  if (
    !s.objects[source] ||
    !s.players[player].zones.cyberdeck.includes(id) ||
    card?.cardType !== "character" ||
    !card.factions.includes("WONDERLAND")
  )
    throw Error("Invalid Tea Party entrant");
  if (
    card.iconic &&
    [
      ...s.arena,
      ...s.environment,
      ...s.players.flatMap((p) => p.zones.ramBank),
    ].some(
      (other) =>
        s.objects[other].controller === player &&
        current.get(other)?.iconic &&
        current.get(other)?.name === card.name,
    )
  )
    return s;
  let next = structuredClone(s);
  next.players[player].zones.cyberdeck = next.players[
    player
  ].zones.cyberdeck.filter((other) => other !== id);
  next.arena.push(id);
  advanceObjectIncarnation(next, id);
  Object.assign(next.objects[id], {
    controller: player,
    running: false,
    abilitySpent: false,
    faceDown: false,
    attachments: [],
    setRamCost: 0,
  });
  next = e.putCounters(next, source, [
    { instanceId: id, counter: "tea-party", amount: 1 },
  ]);
  next = e.prepareEntry(next, id);
  const entered = e.characteristics(next).get(id);
  if (entered?.cardType !== "character")
    throw Error("Invalid prepared Tea Party entry");
  next.pendingRuleEvents.push({
    type: "character-entered",
    ...captureEventObservation(next),
    player,
    instanceId: id,
    factions: [...entered.factions],
  });
  assertGameZones(next);
  return next;
}

export function madHatterDeparture(
  version: string | undefined,
  e: {
    characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
    hasAbility(s: GameState, id: string, handler: string): boolean;
    depart(s: GameState, intents: readonly PersistentDeparture[]): GameState;
  },
) {
  const handler = spec.passiveTriggers[0].handlerId;
  const events = new Map<string, EventBehavior>();
  if (version)
    events.set(version, {
      onEvent(s, id, event) {
        if (
          (event.type !== "persistent-destroyed" &&
            event.type !== "persistent-binned" &&
            event.type !== "persistent-moved") ||
          event.instanceId !== id
        )
          return [];
        const before = ruleEventObservationState(s, event);
        if (
          event.previous.definitionVersion !== version ||
          !before.arena.includes(id) ||
          e.characteristics(before).get(id)?.cardType !== "character" ||
          !e.hasAbility(before, id, handler)
        )
          return [];
        return [
          {
            sourceId: id,
            controller: event.previous.controller,
            handler,
            event: structuredClone(event),
          },
        ];
      },
    });
  const triggers = new Map<string, TriggerBehavior>([
    [
      handler,
      {
        resolve(s, t) {
          const event = t.event;
          if (
            (event.type !== "persistent-destroyed" &&
              event.type !== "persistent-binned" &&
              event.type !== "persistent-moved") ||
            event.instanceId !== t.sourceId ||
            event.previous.definitionVersion !== version ||
            t.handler !== handler
          )
            throw Error("Invalid Mad Hatter departure trigger");
          const current = e.characteristics(s);
          // The printed effect is global, including another Hatter's guests and enemy characters.
          return e.depart(
            s,
            s.arena
              .filter(
                (id) =>
                  current.get(id)?.cardType === "character" &&
                  (s.objects[id].counters["tea-party"] ?? 0) > 0,
              )
              .map((id) => ({
                id,
                kind: "destroy",
                sourceId: t.sourceId,
                destroyedBy: t.controller,
                reason: "normal",
              })),
          );
        },
      },
    ],
  ]);
  return {
    events,
    triggers,
    triggerLabels: new Map([
      [handler, "Mad Hatter: destroy all characters with tea party counters."],
    ]),
  };
}
