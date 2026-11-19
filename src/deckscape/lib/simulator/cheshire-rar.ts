import type { GameState } from "./game-state";
import type { ProtocolBindingEffects } from "./protocol-bindings";
import { moveProtocol } from "./protocol";
import { applyHealthChanges } from "./health";
import { evaluatePlayerSynergy } from "./synergy";
import {
  ruleEventObservationState,
  type EventBehavior,
  type PendingTrigger,
  type RuleEvent,
} from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";

/** Both triggers use synergy and control when the event occurred. Changing hosts
 * does not change control, and movement is attachment rather than a new entry. */
export function cheshireRar(
  version: string,
  handler: string,
  effects: ProtocolBindingEffects,
): { events: EventBehavior; trigger: TriggerBehavior } {
  const observation = (state: GameState, id: string, event: RuleEvent) => {
    if (
      event.type !== "system-checked" &&
      event.type !== "protocol-entered" &&
      event.type !== "protocol-moved"
    )
      return null;
    const observed = ruleEventObservationState(state, event),
      source = observed.objects[id];
    if (
      !source ||
      source.definitionVersion !== version ||
      !observed.arena.includes(id) ||
      source.faceDown ||
      !effects.hasAbility(observed, id, handler)
    )
      return null;
    const current = effects.characteristics(observed),
      card = current.get(id);
    if (
      card?.cardType !== "program" ||
      card.subtype !== "protocol" ||
      (evaluatePlayerSynergy(observed, current)[source.controller].factions
        .WONDERLAND ?? 0) < 2
    )
      return null;
    if (
      event.type === "system-checked"
        ? event.player !== source.controller
        : event.instanceId !== id
    )
      return null;
    return observed;
  };
  const validate = (state: GameState, t: PendingTrigger) => {
    const observed = observation(state, t.sourceId, t.event);
    if (
      t.handler !== handler ||
      !observed ||
      observed.objects[t.sourceId].controller !== t.controller
    )
      throw Error("Invalid Cheshire.rar trigger");
    return observed;
  };
  const destinations = (state: GameState, t: PendingTrigger) => {
    const observed = validate(state, t),
      source = state.objects[t.sourceId];
    if (
      !state.arena.includes(t.sourceId) ||
      source?.incarnation !== observed.objects[t.sourceId].incarnation
    )
      return [];
    const host = source.attachments.find((a) => a.kind === "protocol")?.hostId;
    if (!host) return [];
    const current = effects.characteristics(state);
    return state.players
      .flatMap((p) => p.zones.mainframe)
      .filter(
        (id) =>
          id !== host &&
          current.get(id)?.cardType === "mainframe" &&
          state.arena.filter((other) =>
            state.objects[other].attachments.some(
              (a) => a.kind === "protocol" && a.hostId === id,
            ),
          ).length < 3,
      );
  };
  return {
    events: {
      onEvent: (state, id, event) => {
        const observed = observation(state, id, event);
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
    },
    trigger: {
      choices(state, t) {
        const observed = validate(state, t);
        if (t.event.type === "system-checked") {
          const hosts = destinations(state, t);
          return hosts.length > 1
            ? {
                prompt: "Move Cheshire.rar to a different mainframe.",
                options: hosts.map((id) => ({
                  id,
                  label: effects.characteristics(state).get(id)!.name,
                })),
              }
            : null;
        }
        if (
          t.event.type !== "protocol-entered" &&
          t.event.type !== "protocol-moved"
        )
          throw Error("Invalid Cheshire attachment event");
        const own = observed.players[t.controller].zones.mainframe.includes(
          t.event.mainframeId,
        );
        return {
          prompt: own
            ? "Cheshire.rar: choose which health to gain."
            : "Cheshire.rar: choose which damage to deal.",
          options: ["MF", "BF"].map((id) => ({
            id,
            label: `${own ? "Gain" : "Deal"} 1 ${id}${own ? " health" : " damage"}`,
          })),
        };
      },
      resolve(state, t) {
        const observed = validate(state, t);
        if (t.event.type === "system-checked") {
          const hosts = destinations(state, t),
            host = t.choice ?? hosts[0];
          if (!host) return state;
          if (!hosts.includes(host))
            throw Error("Invalid Cheshire destination");
          return moveProtocol(state, t.sourceId, host, {
            characteristics: effects.characteristics(state),
            permittedMainframes: new Set(hosts),
          });
        }
        if (
          t.event.type !== "protocol-entered" &&
          t.event.type !== "protocol-moved"
        )
          throw Error("Invalid Cheshire attachment event");
        if (t.choice !== "MF" && t.choice !== "BF")
          throw Error("Cheshire health channel unavailable");
        const mainframeId = t.event.mainframeId;
        const hostPlayer = observed.players.findIndex((p) =>
          p.zones.mainframe.includes(mainframeId),
        );
        if (hostPlayer !== 0 && hostPlayer !== 1)
          throw Error("Cheshire mainframe unavailable");
        return hostPlayer === t.controller
          ? applyHealthChanges(state, t.sourceId, [
              {
                player: t.controller,
                channel: t.choice,
                amount: 1,
                operation: "gain",
                cause: "effect",
              },
            ])
          : effects.damage(state, [
              {
                sourceId: t.sourceId,
                sourceController: t.controller,
                recipient: "player",
                player: hostPlayer,
                channel: t.choice,
                amount: 1,
              },
            ]);
      },
    },
  };
}
