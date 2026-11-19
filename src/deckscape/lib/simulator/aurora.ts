import { isDeepStrictEqual } from "node:util";
import recipe from "./aurora-card-v3.json";
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
import { mainframeTierRequirements } from "./synergy";
import {
  topCardsTrigger,
  completeTopCards,
  validateTopCardsContinuation,
  type TopCardsEffects,
  type TopCardsEvaluation,
} from "./top-cards";

export const auroraId = recipe.cardId;
export const auroraHandler = recipe.handlers[0].id;
export function bindAurora(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  effects: TopCardsEffects & { hasAbility(s: GameState, id: string): boolean },
) {
  const pin = versionDefinition(input.definition, engine),
    handler = auroraHandler;
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
    throw Error("Aurora definition mismatch");
  function repetitions(
    s: GameState,
    id: string,
    event: PendingTrigger["event"],
  ) {
    if (s.engineVersion !== engine.version || s.rulesVersion !== rulesVersion)
      throw Error("Aurora runtime mismatch");
    if (event.type !== "character-blocked") return 0;
    const observed = ruleEventObservationState(s, event),
      source = observed.objects[id];
    if (
      source?.definitionVersion !== pin.version ||
      !observed.players[source.controller].zones.mainframe.includes(id) ||
      !effects.hasAbility(observed, id)
    )
      return 0;
    if (
      !event.observers ||
      !event.zonesAtEvent ||
      !event.statEffectsBefore ||
      !event.blockingBatch?.length
    )
      throw Error("Aurora declaration snapshot unavailable");
    // A declaration emits one event per blocker. Only its first event owns this
    // aggregate trigger, including when several blockers share an attacker.
    const first = event.blockingBatch[0];
    if (
      first.blockerId !== event.instanceId ||
      first.attackerId !== event.attackerId
    )
      return 0;
    const current = effects.characteristics(observed);
    const blocked = [
      ...new Set(event.blockingBatch.map((a) => a.attackerId)),
    ].filter((target) => {
      const card = current.get(target);
      return (
        observed.objects[target]?.controller === source.controller &&
        card?.cardType === "character" &&
        (card.factions.includes("MYSTIC") ||
          card.factions.includes("DUSTRUNNER"))
      );
    });
    if (!blocked.length) return 0;
    const tiers = mainframeTierRequirements(observed, id, current);
    return tiers[1] ? blocked.length : tiers[0] ? 1 : 0;
  }
  function checked(s: GameState, t: PendingTrigger) {
    const count = repetitions(s, t.sourceId, t.event);
    const source = ruleEventObservationState(s, t.event).objects[t.sourceId];
    if (
      !count ||
      t.handler !== handler ||
      source.controller !== t.controller ||
      t.optionalChoice !== undefined ||
      t.optionalPlayer !== undefined
    )
      throw Error("Invalid Aurora trigger");
    return count;
  }
  const events = new Map<string, EventBehavior>([
    [
      pin.version,
      {
        onEvent(s, id, event) {
          return repetitions(s, id, event)
            ? [
                {
                  sourceId: id,
                  controller: ruleEventObservationState(s, event).objects[id]
                    .controller,
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
        resolve(s, t) {
          const total = checked(s, t);
          return topCardsTrigger(s, t, { kind: "divine", count: 2 }, effects, {
            total,
            remaining: total,
          });
        },
      },
    ],
  ]);
  function topCards(s: GameState): TopCardsEvaluation {
    const saved = s.pendingDecision;
    if (
      saved?.type !== "top-cards" ||
      saved.handler !== handler ||
      !saved.trigger ||
      !saved.sequence ||
      saved.kind !== "divine" ||
      saved.count !== 2 ||
      saved.sequence.total !== checked(s, saved.trigger)
    )
      throw Error("Invalid Aurora continuation");
    validateTopCardsContinuation(s, saved);
    return {
      characteristics: effects.characteristics(s),
      complete(state, decision, selected) {
        if (!isDeepStrictEqual(decision, saved))
          throw Error("Aurora decision changed");
        return completeTopCards(state, decision, selected, effects);
      },
      resume(state, decision) {
        if (!isDeepStrictEqual(decision, saved))
          throw Error("Aurora sequence changed");
        const sequence = decision.sequence!;
        return sequence.remaining > 1
          ? topCardsTrigger(
              state,
              decision.trigger!,
              { kind: "divine", count: 2 },
              effects,
              { ...sequence, remaining: sequence.remaining - 1 },
            )
          : state;
      },
    };
  }
  return {
    events,
    triggers,
    topCards,
    triggerLabels: new Map([
      [handler, "Aurora: DIVINE 2 for blocked characters."],
    ]),
  };
}
