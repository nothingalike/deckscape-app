import { isDeepStrictEqual } from "node:util";
import recipe from "./radiant-card-v3.json";
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
import { mainframeTierRequirements } from "./synergy";
import {
  topCardsTrigger,
  completeTopCards,
  validateTopCardsContinuation,
  type TopCardsEffects,
  type TopCardsEvaluation,
} from "./top-cards";
export const radiantId = recipe.cardId,
  radiantHandler = recipe.handlers[0].id;

export function radiantAllowsReversal(
  s: GameState,
  id: string,
  version: string | undefined,
  current: ReadonlyMap<string, CardCharacteristics>,
  hasAbility: (s: GameState, id: string) => boolean,
) {
  const card = current.get(id),
    player = s.objects[id]?.controller;
  if (
    !version ||
    player === undefined ||
    card?.cardType !== "program" ||
    !card.tags.includes("TAROT")
  )
    return false;
  return s.players[player].zones.mainframe.some(
    (frame) =>
      s.objects[frame].definitionVersion === version &&
      hasAbility(s, frame) &&
      mainframeTierRequirements(s, frame, current)[1],
  );
}
export function bindRadiant(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  effects: TopCardsEffects & { hasAbility(s: GameState, id: string): boolean },
) {
  const pin = versionDefinition(input.definition, engine),
    handler = radiantHandler;
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
    throw Error("Radiant definition mismatch");
  const observe = (
    s: GameState,
    id: string,
    event: PendingTrigger["event"],
  ) => {
    if (s.engineVersion !== engine.version || s.rulesVersion !== rulesVersion)
      throw Error("Radiant runtime mismatch");
    if (event.type !== "program-played" || !event.tags.includes("TAROT"))
      return null;
    const snapshot = ruleEventObservationState(s, event),
      source = snapshot.objects[id];
    if (
      source?.definitionVersion !== pin.version ||
      source.controller !== event.player ||
      !snapshot.players[source.controller].zones.mainframe.includes(id) ||
      !effects.hasAbility(snapshot, id)
    )
      return null;
    if (!event.observers || !event.zonesAtEvent || !event.statEffectsBefore)
      throw Error("Radiant play snapshot unavailable");
    return mainframeTierRequirements(
      snapshot,
      id,
      effects.characteristics(snapshot),
    )[0]
      ? source
      : null;
  };
  function check(s: GameState, t: PendingTrigger) {
    const source = observe(s, t.sourceId, t.event);
    if (
      !source ||
      source.controller !== t.controller ||
      t.handler !== handler ||
      t.optionalChoice !== undefined ||
      t.optionalPlayer !== undefined
    )
      throw Error("Invalid Radiant trigger");
  }
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
          check(s, t);
          return topCardsTrigger(s, t, { kind: "look-bin", count: 1 }, effects);
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
      saved.sequence ||
      saved.kind !== "look-bin" ||
      saved.count !== 1
    )
      throw Error("Invalid Radiant continuation");
    check(s, saved.trigger);
    validateTopCardsContinuation(s, saved);
    return {
      characteristics: effects.characteristics(s),
      complete(state, decision, selected) {
        if (!isDeepStrictEqual(saved, decision))
          throw Error("Radiant decision changed");
        return completeTopCards(state, decision, selected, effects);
      },
    };
  }
  return {
    events,
    triggers,
    topCards,
    triggerLabels: new Map([
      [handler, "Radiant: look at your top card; you may bin it."],
    ]),
  };
}
