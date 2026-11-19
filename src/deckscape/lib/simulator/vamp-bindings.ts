import { isDeepStrictEqual } from "node:util";
import recipes from "./vamp-cards-v3.json";
import { versionDefinition, type EngineManifest } from "./definition-version";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";
import {
  ruleEventObservationState,
  type EventBehavior,
  type PendingTrigger,
} from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import type { HealthChange } from "./health";
import { addUntilTurnEndStatEffect } from "./timed-stat-effects";

/** CR 702.2/702.3: one instance of each vamp keyword, using actual combat damage. */
export function bindVampCards(
  inputs: readonly PinnedDefinition[],
  engine: EngineManifest,
  rulesVersion: string,
  effects: {
    hasAbility(s: GameState, id: string): boolean;
    characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
    health(
      s: GameState,
      source: string,
      changes: readonly HealthChange[],
    ): GameState;
  },
) {
  const bound = new Map<string, (typeof recipes)[number]>(),
    events = new Map<string, EventBehavior>(),
    triggers = new Map<string, TriggerBehavior>(),
    triggerLabels = new Map<string, string>();
  for (const input of inputs) {
    const pin = versionDefinition(input.definition, engine),
      recipe = recipes.find((r) => r.cardId === pin.definition.cardId);
    if (
      !recipe ||
      pin.version !== input.version ||
      pin.definition.rulesVersion !== rulesVersion ||
      !isDeepStrictEqual(
        pin.definition.characteristics,
        characteristicsSchema.parse(recipe.characteristics),
      ) ||
      !isDeepStrictEqual(pin.definition.handlers, recipe.handlers) ||
      bound.has(pin.version)
    )
      throw Error("Vamp definition mismatch");
    bound.set(pin.version, recipe);
  }
  const observe = (
    s: GameState,
    id: string,
    event: PendingTrigger["event"],
  ) => {
    if (s.engineVersion !== engine.version || s.rulesVersion !== rulesVersion)
      throw Error("Vamp runtime mismatch");
    if (event.type !== "player-damaged" && event.type !== "program-played")
      return null;
    if (!event.observers || !event.zonesAtEvent || !event.statEffectsBefore)
      throw Error("Vamp event observation unavailable");
    const snapshot = ruleEventObservationState(s, event),
      source = snapshot.objects[id],
      recipe = source && bound.get(source.definitionVersion);
    if (
      !recipe ||
      !snapshot.arena.includes(id) ||
      !effects.hasAbility(snapshot, id)
    )
      return null;
    const current = effects.characteristics(snapshot),
      native = recipe.characteristics.cardType === "character";
    if (event.type === "program-played")
      return native &&
        event.tags.includes("TAROT") &&
        event.player === source.controller
        ? { snapshot, host: id, recipe, tarot: true }
        : null;
    if (
      !event.combat ||
      event.amount <= 0 ||
      event.channel !== (native ? "MF" : "BF") ||
      current.get(event.sourceId)?.cardType !== "character" ||
      !snapshot.arena.includes(event.sourceId)
    )
      return null;
    if (
      native
        ? event.sourceId !== id
        : !source.attachments.some(
            (a) => a.kind === "gear" && a.hostId === event.sourceId,
          )
    )
      return null;
    if (!effects.hasAbility(snapshot, event.sourceId)) return null;
    // Multiple gauntlets grant one BIOVAMP instance to this host, regardless of gear controller.
    if (!native) {
      const first = snapshot.arena.find((other) => {
        const o = snapshot.objects[other],
          r = bound.get(o.definitionVersion);
        return (
          r?.characteristics.cardType === "gear" &&
          effects.hasAbility(snapshot, other) &&
          o.attachments.some(
            (a) => a.kind === "gear" && a.hostId === event.sourceId,
          )
        );
      });
      if (first !== id) return null;
    }
    return { snapshot, host: event.sourceId, recipe, tarot: false };
  };
  for (const [version, recipe] of bound) {
    const handler = recipe.handlers[0].id;
    events.set(version, {
      onEvent(s, id, event) {
        const observed = observe(s, id, event);
        return observed
          ? [
              {
                sourceId: id,
                controller: observed.snapshot.objects[observed.host].controller,
                handler,
                event,
              },
            ]
          : [];
      },
    });
    triggers.set(handler, {
      resolve(s, trigger) {
        const observed = observe(s, trigger.sourceId, trigger.event);
        if (
          !observed ||
          trigger.handler !== handler ||
          observed.recipe.cardId !== recipe.cardId ||
          observed.snapshot.objects[observed.host].controller !==
            trigger.controller
        )
          throw Error("Invalid vamp trigger");
        if (observed.tarot) {
          const host = observed.host,
            current = effects.characteristics(s);
          if (
            !s.arena.includes(host) ||
            s.objects[host].incarnation !==
              observed.snapshot.objects[host].incarnation ||
            current.get(host)?.cardType !== "character"
          )
            return s;
          return addUntilTurnEndStatEffect(
            s,
            host,
            host,
            { layer: "7d", operation: "add", attack: 1, defence: 1 },
            current,
          );
        }
        if (trigger.event.type !== "player-damaged")
          throw Error("Invalid vamp damage event");
        return effects.health(s, observed.host, [
          {
            player: trigger.controller,
            channel: trigger.event.channel,
            amount: trigger.event.amount,
            operation: "gain",
            cause: "effect",
          },
        ]);
      },
    });
    triggerLabels.set(
      handler,
      recipe.characteristics.cardType === "character"
        ? "Celestial Channeler: DATAVAMP / tarot bonus."
        : "Siphon Gauntlet: BIOVAMP.",
    );
  }
  return { events, triggers, triggerLabels };
}
