import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { CounterPlacement } from "./put-counters";
import {
  ruleEventObservationState,
  type EventBehavior,
  type PendingTrigger,
} from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import { addUntilTurnEndCombatObligation } from "./timed-combat-effects";
import { addUntilTurnEndFactionStatEffect } from "./timed-stat-effects";
export const wallHandler = "protocol/wall-of-death";
export function wallOfDeath(
  version: string,
  e: {
    characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
    hasAbility(s: GameState, id: string, handler: string): boolean;
    putCounters(
      s: GameState,
      source: string,
      placements: readonly CounterPlacement[],
    ): GameState;
    purge(s: GameState, id: string): GameState;
  },
) {
  const qualifies = (
    s: GameState,
    id: string,
    event: PendingTrigger["event"],
  ) => {
    if (event.type !== "netcheck-started") return false;
    const before = ruleEventObservationState(s, event);
    return (
      before.arena.includes(id) &&
      before.objects[id]?.definitionVersion === version &&
      e.hasAbility(before, id, wallHandler)
    );
  };
  const events: EventBehavior = {
    onEvent(s, id, event) {
      return qualifies(s, id, event)
        ? [
            {
              sourceId: id,
              controller: ruleEventObservationState(s, event).objects[id]
                .controller,
              handler: wallHandler,
              event,
            },
          ]
        : [];
    },
  };
  const trigger: TriggerBehavior = {
    resolve(s, t) {
      if (t.handler !== wallHandler || !qualifies(s, t.sourceId, t.event))
        throw Error("Invalid Wall of Death trigger");
      const original = ruleEventObservationState(s, t.event).objects[
        t.sourceId
      ];
      if (
        !s.arena.includes(t.sourceId) ||
        s.objects[t.sourceId].incarnation !== original.incarnation
      )
        return s;
      let next = e.putCounters(s, t.sourceId, [
        { instanceId: t.sourceId, counter: "mosh", amount: 1 },
      ]);
      if ((next.objects[t.sourceId].counters.mosh ?? 0) < 2) return next;
      next = e.purge(next, t.sourceId);
      if (!next.players.some((p) => p.zones.purge.includes(t.sourceId)))
        return next;
      next = addUntilTurnEndCombatObligation(next, t.sourceId, "must-attack");
      next = addUntilTurnEndCombatObligation(next, t.sourceId, "must-block");
      next = addUntilTurnEndFactionStatEffect(next, t.sourceId, "THRASHER", {
        layer: "7d",
        operation: "add",
        attack: 2,
        defence: 2,
      });
      return next;
    },
  };
  return { events, trigger };
}
