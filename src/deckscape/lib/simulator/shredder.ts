import { isDeepStrictEqual } from "node:util";
import recipe from "./shredder-card-v3.json";
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
import type { CombatDamagePacket } from "./combat-damage";
import { sourceController } from "./source-controller";

export const shredderId = recipe.cardId;
/** FEEDBACK (702.6): damage to a character produces noncombat BF damage to its source's controller. */
export function bindShredder(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  effects: {
    hasAbility(s: GameState, id: string): boolean;
    characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
    damage(s: GameState, packets: readonly CombatDamagePacket[]): GameState;
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
    throw Error("Shredder definition mismatch");
  const observe = (
    s: GameState,
    id: string,
    event: PendingTrigger["event"],
  ) => {
    if (s.engineVersion !== engine.version || s.rulesVersion !== rulesVersion)
      throw Error("Shredder runtime mismatch");
    if (
      event.type !== "character-damaged" ||
      event.instanceId !== id ||
      event.amount <= 0
    )
      return null;
    if (!event.observers || !event.zonesAtEvent || !event.statEffectsBefore)
      throw Error("FEEDBACK damage observation unavailable");
    const snapshot = ruleEventObservationState(s, event),
      source = snapshot.objects[id];
    if (
      source?.definitionVersion !== pin.version ||
      !snapshot.arena.includes(id) ||
      !effects.hasAbility(snapshot, id) ||
      effects.characteristics(snapshot).get(id)?.cardType !== "character"
    )
      return null;
    return {
      snapshot,
      source,
      recipient:
        event.sourceController === undefined
          ? sourceController(snapshot, event.sourceId)
          : event.sourceController,
    };
  };
  const events = new Map<string, EventBehavior>([
    [
      pin.version,
      {
        onEvent(s, id, event) {
          const observed = observe(s, id, event);
          return observed
            ? [
                {
                  sourceId: id,
                  controller: observed.source.controller,
                  handler,
                  event,
                },
              ]
            : [];
        },
      },
    ],
  ]);
  const triggers = new Map<string, TriggerBehavior>([
    [
      handler,
      {
        resolve(s, trigger) {
          const observed = observe(s, trigger.sourceId, trigger.event);
          if (
            !observed ||
            trigger.handler !== handler ||
            trigger.controller !== observed.source.controller ||
            trigger.event.type !== "character-damaged"
          )
            throw Error("Invalid FEEDBACK trigger");
          if (observed.recipient === null) return s;
          return effects.damage(s, [
            {
              sourceId: trigger.sourceId,
              sourceController: trigger.controller,
              recipient: "player",
              player: observed.recipient,
              channel: "BF",
              amount: trigger.event.amount,
            },
          ]);
        },
      },
    ],
  ]);
  return {
    events,
    triggers,
    triggerLabels: new Map([[handler, "Shredder: FEEDBACK damage."]]),
  };
}
