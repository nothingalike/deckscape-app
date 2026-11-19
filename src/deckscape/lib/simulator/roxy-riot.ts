import { isDeepStrictEqual } from "node:util";
import recipe from "./roxy-riot-card-v3.json";
import { versionDefinition, type EngineManifest } from "./definition-version";
import { characteristicsSchema } from "./characteristics";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";
import {
  ruleEventObservationState,
  type EventBehavior,
  type PendingTrigger,
} from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import type { CombatDamagePacket } from "./combat-damage";
import type { CounterPlacement } from "./put-counters";

export const roxyRiotId = recipe.cardId;
export function bindRoxyRiot(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  effects: {
    hasAbility(s: GameState, id: string): boolean;
    damage(s: GameState, packets: readonly CombatDamagePacket[]): GameState;
    putCounters(
      s: GameState,
      sourceId: string,
      placements: readonly CounterPlacement[],
    ): GameState;
  },
) {
  const pin = versionDefinition(input.definition, engine),
    handler = recipe.handlers[0].id;
  if (
    pin.version !== input.version ||
    pin.definition.rulesVersion !== rulesVersion ||
    pin.definition.cardId !== recipe.cardId ||
    !isDeepStrictEqual(
      pin.definition.characteristics,
      characteristicsSchema.parse(recipe.characteristics),
    ) ||
    !isDeepStrictEqual(pin.definition.handlers, recipe.handlers)
  )
    throw Error("Roxy Riot definition mismatch");
  const observe = (
    s: GameState,
    id: string,
    event: PendingTrigger["event"],
  ) => {
    if (s.engineVersion !== engine.version || s.rulesVersion !== rulesVersion)
      throw Error("Roxy Riot runtime mismatch");
    if (
      event.type !== "netcheck-started" &&
      event.type !== "player-damaged" &&
      event.type !== "persistent-destroyed"
    )
      return null;
    if (!event.observers || !event.zonesAtEvent || !event.statEffectsBefore)
      throw Error("Roxy Riot event observation unavailable");
    const observed = ruleEventObservationState(s, event),
      source = observed.objects[id];
    if (
      source?.definitionVersion !== pin.version ||
      !observed.arena.includes(id) ||
      !effects.hasAbility(observed, id)
    )
      return null;
    if (event.type === "netcheck-started")
      return event.player === source.controller ? source : null;
    if (event.type === "persistent-destroyed")
      return event.instanceId === id && event.destroyedBy !== null
        ? source
        : null;
    return event.type === "player-damaged" &&
      event.sourceId === id &&
      event.combat &&
      event.amount > 0
      ? source
      : null;
  };
  const events = new Map<string, EventBehavior>([
    [
      pin.version,
      {
        onEvent(s, id, event) {
          const source = observe(s, id, event);
          return source
            ? [{ sourceId: id, controller: source.controller, handler, event }]
            : [];
        },
      },
    ],
  ]);
  const triggers = new Map<string, TriggerBehavior>([
    [
      handler,
      {
        resolve(s, t) {
          const source = observe(s, t.sourceId, t.event);
          if (
            !source ||
            t.handler !== handler ||
            t.controller !== source.controller
          )
            throw Error("Invalid Roxy Riot trigger");
          const current = s.objects[source.id];
          if (t.event.type === "netcheck-started") {
            if (
              !s.arena.includes(source.id) ||
              current?.incarnation !== source.incarnation
            )
              return s;
            return effects.putCounters(s, source.id, [
              { instanceId: source.id, counter: "rage", amount: 1 },
            ]);
          }
          if (
            t.event.type !== "player-damaged" &&
            t.event.type !== "persistent-destroyed"
          )
            throw Error("Invalid Roxy Riot damage event");
          // A hit reads the current count if this incarnation remains; a departure
          // reads its last-known count, before zone movement clears counters.
          const counters =
            t.event.type === "persistent-destroyed"
              ? t.event.previous.counters
              : s.arena.includes(source.id) &&
                  current?.incarnation === source.incarnation
                ? current.counters
                : (t.departedSourceCounters ?? source.counters);
          const amount =
            (counters.rage ?? 0) *
            (t.event.type === "persistent-destroyed" ? 3 : 1);
          const player =
            t.event.type === "persistent-destroyed"
              ? t.event.destroyedBy
              : t.event.player;
          if (!amount || player === null) return s;
          return effects.damage(s, [
            {
              sourceId: source.id,
              sourceController: t.controller,
              recipient: "player",
              player,
              channel: "BF",
              amount,
            },
          ]);
        },
      },
    ],
  ]);
  return {
    events,
    triggers,
    triggerLabels: new Map([[handler, "Roxy Riot: rage counters and damage."]]),
  };
}
