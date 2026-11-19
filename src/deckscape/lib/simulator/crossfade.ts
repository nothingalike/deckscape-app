import type { GameState } from "./game-state";
import type { PendingTrigger } from "./rule-events";
import type { EnvironmentEffects } from "./environment-bindings";
import type { TriggerBehavior } from "./resolve-trigger";

/** A resolution-time payment, not a target chosen when the trigger is placed. */
export function crossfade(
  effects: EnvironmentEffects,
  validate: (s: GameState, t: PendingTrigger) => void,
): TriggerBehavior {
  const player = (s: GameState, t: PendingTrigger) => {
    validate(s, t);
    if (t.event.type !== "netcheck-started")
      throw Error("Invalid Crossfade event");
    return t.event.player;
  };
  const available = (s: GameState, t: PendingTrigger) => {
    const seat = player(s, t),
      current = effects.characteristics(s);
    return [...s.players.flatMap((p) => p.zones.ramBank), ...s.arena].filter(
      (id) =>
        s.objects[id].controller === seat &&
        current.get(id)?.cardType === "ram",
    );
  };
  return {
    optional: (s, t) =>
      available(s, t).length
        ? "Destroy 1 RAM you control to draw 1 with Crossfade?"
        : null,
    optionalPlayer: player,
    choices(s, t) {
      const ids = available(s, t);
      return ids.length
        ? {
            prompt: "Select the RAM to destroy, then confirm to draw 1.",
            options: ids.map((id) => ({
              id,
              cardId: id,
              label: "Destroy RAM and draw 1",
            })),
          }
        : null;
    },
    resolve(s, t) {
      const seat = player(s, t);
      if (
        t.optionalChoice !== true ||
        t.optionalPlayer !== seat ||
        !t.choice ||
        !available(s, t).includes(t.choice)
      )
        throw Error("Invalid Crossfade payment");
      if (!effects.destroy)
        throw Error("Crossfade destruction runtime unavailable");
      const next = effects.destroy(s, t.sourceId, t.choice, seat);
      // Pay before drawing, without an intervening SBA/reallocation checkpoint.
      // A prevented destruction cannot buy the draw.
      const paid = next.pendingRuleEvents
        .slice(s.pendingRuleEvents.length)
        .some(
          (e) => e.type === "persistent-destroyed" && e.instanceId === t.choice,
        );
      return paid ? effects.draw(next, t.sourceId, seat, 1) : next;
    },
  };
}
