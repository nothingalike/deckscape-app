import { isDeepStrictEqual } from "node:util";
import specs from "./combat-gear-specifications-v3.json";
import { versionDefinition, type EngineManifest } from "./definition-version";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import {
  ruleEventObservationState,
  type EventBehavior,
  type PendingTrigger,
} from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import type { TriggerTarget } from "./trigger-target";
import type { CombatDamagePacket } from "./combat-damage";

export function bindCombatGear(
  inputs: readonly PinnedDefinition[],
  engine: EngineManifest,
  rulesVersion: string,
  effects: {
    characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
    hasAbility(s: GameState, id: string, handler: string): boolean;
    canTarget(s: GameState, source: string, target: string): boolean;
    damage(s: GameState, packets: readonly CombatDamagePacket[]): GameState;
    destroy(s: GameState, source: string, target: string): GameState;
    install(s: GameState, player: Seat): GameState;
  },
) {
  const events = new Map<string, EventBehavior>(),
    triggers = new Map<string, TriggerBehavior>(),
    triggerLabels = new Map<string, string>();
  for (const input of inputs) {
    const pin = versionDefinition(input.definition, engine),
      spec = specs.find((s) => s.cardId === pin.definition.cardId);
    if (
      !spec ||
      pin.version !== input.version ||
      pin.definition.rulesVersion !== rulesVersion ||
      !isDeepStrictEqual(
        pin.definition.characteristics,
        characteristicsSchema.parse(spec.characteristics),
      ) ||
      !isDeepStrictEqual(pin.definition.handlers, [
        { id: spec.handlerId, version: 1, parameters: {} },
      ]) ||
      events.has(pin.version)
    )
      throw Error("Combat gear definition mismatch");
    const observe = (
      s: GameState,
      id: string,
      event: PendingTrigger["event"],
    ) => {
      if (s.engineVersion !== engine.version || s.rulesVersion !== rulesVersion)
        throw Error("Combat gear runtime mismatch");
      let hostId: string;
      if (spec.kind === "battle-axe") {
        if (event.type !== "character-blocked") return null;
        if (
          !event.blockingGroup ||
          !event.observers ||
          !event.zonesAtEvent ||
          !event.statEffectsBefore
        )
          throw Error("Blocked group observation unavailable");
        if (event.instanceId !== event.blockingGroup[0]) return null;
        hostId = event.attackerId;
      } else {
        if (
          event.type !== "player-damaged" ||
          !event.combat ||
          event.amount <= 0
        )
          return null;
        if (!event.observers || !event.zonesAtEvent || !event.statEffectsBefore)
          throw Error("Attack hit observation unavailable");
        hostId = event.sourceId;
      }
      const observed = ruleEventObservationState(s, event),
        gear = observed.objects[id];
      if (
        gear?.definitionVersion !== pin.version ||
        !effects.hasAbility(observed, id, spec.handlerId) ||
        !gear.attachments.some(
          (a) => a.kind === "gear" && a.hostId === hostId,
        ) ||
        effects.characteristics(observed).get(hostId)?.cardType !== "character"
      )
        return null;
      return { observed, hostId, event };
    };
    const retained = (s: GameState, t: PendingTrigger) => {
      const seen = observe(s, t.sourceId, t.event);
      if (
        !seen ||
        t.handler !== spec.handlerId ||
        seen.observed.objects[t.sourceId].controller !== t.controller
      )
        throw Error("Invalid combat gear trigger");
      return seen;
    };
    const targets = (s: GameState, t: PendingTrigger): TriggerTarget[] => {
      const { event } = retained(s, t);
      if (event.type !== "player-damaged") throw Error("Expected player hit");
      const current = effects.characteristics(s);
      return [...s.arena, ...s.players.flatMap((p) => p.zones.ramBank)]
        .filter(
          (id) =>
            s.objects[id].controller === event.player &&
            current.get(id)?.cardType === "ram" &&
            effects.canTarget(s, t.sourceId, id),
        )
        .map((id) => ({
          kind: "ram",
          id,
          incarnation: s.objects[id].incarnation,
        }));
    };
    events.set(pin.version, {
      onEvent(s, id, event) {
        const seen = observe(s, id, event);
        return seen
          ? [
              {
                sourceId: id,
                controller: seen.observed.objects[id].controller,
                handler: spec.handlerId,
                event: structuredClone(event),
              },
            ]
          : [];
      },
    });
    triggers.set(spec.handlerId, {
      ...(spec.kind === "snatcher" ? { targets } : {}),
      resolve(s, t) {
        const { event, observed, hostId } = retained(s, t);
        if (spec.kind === "snatcher") {
          if (
            t.target?.kind !== "ram" ||
            !targets(s, t).some((target) => isDeepStrictEqual(target, t.target))
          )
            return s;
          const next = effects.destroy(s, t.sourceId, t.target.id);
          return next.outcome ? next : effects.install(next, t.controller);
        }
        if (event.type !== "character-blocked")
          throw Error("Expected blocked event");
        const current = effects.characteristics(s);
        const packets: CombatDamagePacket[] = (event.blockingGroup ?? [])
          .filter(
            (id) =>
              s.arena.includes(id) &&
              s.objects[id].incarnation === observed.objects[id]?.incarnation &&
              !s.objects[id].running &&
              s.objects[id].controller === event.player &&
              current.get(id)?.cardType === "character" &&
              s.combat?.blockers.some(
                (a) => a.attackerId === hostId && a.blockerId === id,
              ),
          )
          .map((id) => ({
            sourceId: hostId,
            sourceController: observed.objects[hostId].controller,
            recipient: "character",
            instanceId: id,
            channel: "BF",
            amount: 1,
          }));
        return packets.length ? effects.damage(s, packets) : s;
      },
    });
    triggerLabels.set(
      spec.handlerId,
      spec.kind === "battle-axe"
        ? "Battle Axe: attached character deals 1 BF to each blocker."
        : "Snatcher: destroy the hit player's RAM and install one RAM running.",
    );
  }
  return { events, triggers, triggerLabels };
}
