import type { GameState } from "./game-state";
import type { PendingTrigger } from "./rule-events";
import type { EnvironmentEffects } from "./environment-bindings";
import type { TriggerBehavior } from "./resolve-trigger";
import { moveRecycledCardToHand } from "./salvage";
import {
  captureEventObservation,
  type EventObservation,
} from "./event-observation";
import type { Seat } from "./setup";

export interface SetuReturnEvent extends EventObservation {
  type: "setu-character-returned";
  sourceId: string;
  instanceId: string;
  player: Seat;
}
export function setuSimulation(
  effects: EnvironmentEffects,
  validate: (s: GameState, t: PendingTrigger) => void,
): TriggerBehavior {
  const player = (s: GameState, t: PendingTrigger) => {
    validate(s, t);
    if (t.event.type !== "netcheck-started") throw Error("Invalid Setu event");
    return t.event.player;
  };
  const candidates = (s: GameState, t: PendingTrigger) => {
    const seat = player(s, t),
      current = effects.characteristics(s);
    return s.players[seat].zones.recycleBin.filter((id) => {
      const c = current.get(id);
      return (
        !s.objects[id].token &&
        c?.cardType === "character" &&
        c.factions.includes("MYSTIC") &&
        effects.canTarget!(s, t.sourceId, id)
      );
    });
  };
  const targetLegal = (s: GameState, t: PendingTrigger) =>
    t.target?.kind === "recycle-character" &&
    s.objects[t.target.id]?.incarnation === t.target.incarnation &&
    candidates(s, t).includes(t.target.id);
  const payments = (s: GameState, t: PendingTrigger) => {
    const seat = player(s, t),
      current = effects.characteristics(s);
    return s.arena.filter(
      (id) =>
        s.objects[id].controller === seat &&
        current.get(id)?.cardType === "character",
    );
  };
  return {
    targets: (s, t) =>
      candidates(s, t).map((id) => ({
        kind: "recycle-character",
        id,
        incarnation: s.objects[id].incarnation,
      })),
    optional: (s, t) =>
      targetLegal(s, t) && payments(s, t).length
        ? "Purge a character you control to return the selected MYSTIC character to your hand?"
        : null,
    optionalPlayer: player,
    choices: (s, t) =>
      targetLegal(s, t)
        ? {
            prompt: "Select the character to purge for Setu Simulation.",
            options: payments(s, t).map((id) => ({
              id,
              cardId: id,
              label: "Purge character and return selected MYSTIC",
            })),
          }
        : null,
    resolve(s, t) {
      const seat = player(s, t);
      if (!targetLegal(s, t)) return s;
      if (
        t.optionalChoice !== true ||
        t.optionalPlayer !== seat ||
        !t.choice ||
        !payments(s, t).includes(t.choice)
      )
        throw Error("Invalid Setu purge payment");
      let next = effects.purge!(s, t.sourceId, t.choice);
      const paid = next.pendingRuleEvents
        .slice(s.pendingRuleEvents.length)
        .some(
          (e) =>
            e.type === "persistent-moved" &&
            e.instanceId === t.choice &&
            e.destination === "purge",
        );
      if (!paid) return next;
      if (t.target?.kind !== "recycle-character")
        throw Error("Missing Setu return target");
      next = moveRecycledCardToHand(next, seat, t.target.id);
      next.pendingRuleEvents.push({
        type: "setu-character-returned",
        sourceId: t.sourceId,
        instanceId: t.target.id,
        player: seat,
        ...captureEventObservation(next),
      });
      return next;
    },
  };
}
