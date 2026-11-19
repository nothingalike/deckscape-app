import type { GameState } from "./game-state";
import {
  ruleEventObservationState,
  type RuleEvent,
  type EventBehavior,
  type PendingTrigger,
} from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import type { EnvironmentEffects } from "./environment-bindings";
import {
  beginSpiritEntry,
  type SpiritEntryEffects,
} from "./spirit-entry-choice";

export function theSpiritRealm(
  version: string,
  handler: string,
  e: EnvironmentEffects,
) {
  if (!e.putCounters || !e.purgeBatch)
    throw Error("Spirit Realm entry/purge runtime unavailable");
  const observation = (s: GameState, id: string, event: RuleEvent) => {
    if (
      (event.type !== "environment-entered" &&
        event.type !== "environment-destroyed" &&
        event.type !== "persistent-destroyed" &&
        event.type !== "persistent-binned" &&
        event.type !== "persistent-moved") ||
      event.instanceId !== id
    )
      return null;
    if (!("observers" in event) || !event.observers || !event.zonesAtEvent)
      throw Error("Spirit Realm event observation unavailable");
    const observed = ruleEventObservationState(s, event),
      source = observed.objects[id],
      card = e.characteristics(observed).get(id);
    return source?.definitionVersion === version &&
      !source.faceDown &&
      observed.environment.includes(id) &&
      card?.cardType === "program" &&
      card.subtype === "environment" &&
      e.hasAbility(observed, id, handler)
      ? observed
      : null;
  };
  const validate = (s: GameState, t: PendingTrigger) => {
    const observed = observation(s, t.sourceId, t.event);
    if (
      t.handler !== handler ||
      !observed ||
      observed.objects[t.sourceId].controller !== t.controller
    )
      throw Error("Invalid Spirit Realm trigger");
  };
  const entry: SpiritEntryEffects = {
    characteristics: e.characteristics,
    putCounters: e.putCounters,
    prepareEntry: e.prepareEntry,
    validateTrigger(s, t) {
      validate(s, t);
      if (t.event.type !== "environment-entered")
        throw Error("Spirit Realm entry requires an enter trigger");
    },
    entries(s) {
      const current = e.characteristics(s);
      return s.players.flatMap((p, player) => {
        const factions = new Set(
          p.zones.mainframe.flatMap((id) => current.get(id)?.factions ?? []),
        );
        return p.zones.recycleBin
          .filter((id) => {
            const card = current.get(id),
              object = s.objects[id];
            return (
              object.owner === player &&
              !object.token &&
              card?.cardType === "character" &&
              card.factions.some((f) => factions.has(f))
            );
          })
          .map((id) => ({ id, player: s.objects[id].owner }));
      });
    },
  };
  const events: EventBehavior = {
    onEvent(s, id, event) {
      const observed = observation(s, id, event);
      return observed
        ? [
            {
              sourceId: id,
              controller: observed.objects[id].controller,
              handler,
              event,
            },
          ]
        : [];
    },
  };
  const trigger: TriggerBehavior = {
    resolve(s, t) {
      validate(s, t);
      if (t.event.type === "environment-entered")
        return beginSpiritEntry(s, t, entry);
      const current = e.characteristics(s);
      return e.purgeBatch!(
        s,
        t.sourceId,
        s.arena.filter(
          (id) =>
            current.get(id)?.cardType === "character" &&
            (s.objects[id].counters.SPIRIT ?? 0) > 0,
        ),
      );
    },
  };
  return { events, trigger, entry };
}
