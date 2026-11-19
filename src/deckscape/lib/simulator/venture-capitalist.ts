import { isDeepStrictEqual } from "node:util";
import spec from "./venture-specification-v3.json";
import { versionDefinition, type EngineManifest } from "./definition-version";
import { characteristicsSchema } from "./characteristics";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";
import { ruleEventObservationState, type EventBehavior } from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import type { CounterPlacement } from "./put-counters";
import type { ActivatedBehavior } from "./resolve-ability";
import { isCurrentIncarnation } from "./object-incarnation";
import { captureEventObservation } from "./event-observation";
import { validateUntargetedCharacterEffect } from "./character-sweep-effects";
export const ventureId = spec.cardId;
const handler = "venture-capitalist/interest-v1";

export const cashOut: ActivatedBehavior = {
  hasLegalTargets(_state, action) {
    validateUntargetedCharacterEffect(action.activatedAbility.choices);
    return true;
  },
  resolve(state, action, resources) {
    if (
      !isCurrentIncarnation(state, action.activatedAbility.source) ||
      !state.arena.includes(action.sourceId)
    )
      return state;
    const amount = state.objects[action.sourceId].counters.interest ?? 0;
    if (!Number.isSafeInteger(amount) || amount < 0)
      throw Error("Invalid interest counter count");
    if (!amount) return state;
    let next = structuredClone(state);
    delete next.objects[action.sourceId].counters.interest;
    next.pendingRuleEvents.push({
      type: "counters-removed",
      sourceId: action.sourceId,
      instanceId: action.sourceId,
      player: next.objects[action.sourceId].controller,
      counter: "interest",
      amount,
      ...captureEventObservation(next),
    });
    for (let n = 0; n < amount && !next.outcome; n++) {
      if (!next.players[action.controller].zones.ramDeck.length) break;
      const before = next.players[action.controller].zones.ramDeck.length;
      next = resources.install(next, action.controller, true);
      if (next.pendingDecision)
        throw Error("Interest installation requires a saved continuation");
      // A prohibited/impossible install cannot change during this uninterrupted instruction.
      if (next.players[action.controller].zones.ramDeck.length === before)
        break;
    }
    return next;
  },
};
export function bindVenture(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  effects: {
    hasAbility(state: GameState, id: string): boolean;
    putCounters(
      state: GameState,
      sourceId: string,
      placements: readonly CounterPlacement[],
    ): GameState;
  },
) {
  const pin = versionDefinition(input.definition, engine);
  if (
    pin.version !== input.version ||
    pin.definition.rulesVersion !== rulesVersion ||
    pin.definition.cardId !== spec.cardId ||
    !isDeepStrictEqual(
      pin.definition.characteristics,
      characteristicsSchema.parse(spec.characteristics),
    ) ||
    !isDeepStrictEqual(pin.definition.handlers, [
      { id: handler, version: 1, parameters: {} },
    ])
  )
    throw new Error("Venture Capitalist definition pin mismatch");
  const check = (state: GameState) => {
    if (
      state.engineVersion !== engine.version ||
      state.rulesVersion !== rulesVersion
    )
      throw new Error("Venture Capitalist runtime version mismatch");
  };
  const events = new Map<string, EventBehavior>([
    [
      pin.version,
      {
        onEvent(state, sourceId, event) {
          check(state);
          if (event.type !== "netcheck-started") return [];
          if (
            !event.observers ||
            !event.zonesAtEvent ||
            !event.statEffectsBefore
          )
            throw new Error("Venture Capitalist needs captured NETCHECK facts");
          const observed = ruleEventObservationState(state, event),
            source = observed.objects[sourceId];
          if (
            source?.definitionVersion !== pin.version ||
            source.controller !== event.player ||
            !effects.hasAbility(observed, sourceId)
          )
            return [];
          return [
            {
              sourceId,
              controller: source.controller,
              handler: handler,
              event,
            },
          ];
        },
      },
    ],
  ]);
  const triggers = new Map<string, TriggerBehavior>([
    [
      handler,
      {
        resolve(state, trigger) {
          check(state);
          const event = trigger.event;
          if (event.type !== "netcheck-started")
            throw new Error("Invalid Venture Capitalist trigger");
          if (
            !event.observers ||
            !event.zonesAtEvent ||
            !event.statEffectsBefore
          )
            throw new Error("Venture Capitalist needs captured NETCHECK facts");
          const observed = ruleEventObservationState(state, event),
            source = observed.objects[trigger.sourceId];
          if (
            trigger.handler !== handler ||
            source?.definitionVersion !== pin.version ||
            source.controller !== trigger.controller ||
            event.player !== trigger.controller ||
            !effects.hasAbility(observed, source.id)
          )
            throw new Error("Invalid retained Venture Capitalist trigger");
          if (
            state.objects[source.id]?.incarnation !== source.incarnation ||
            !state.arena.includes(source.id)
          )
            return state;
          return effects.putCounters(state, source.id, [
            {
              instanceId: source.id,
              counter: "interest",
              amount: state.objects[source.id].counters.interest ?? 0,
            },
          ]);
        },
      },
    ],
  ]);
  return {
    events,
    triggers,
    triggerLabels: new Map([
      [handler, "Venture Capitalist: double interest counters."],
    ]),
  };
}
