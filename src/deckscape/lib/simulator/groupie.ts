import { isDeepStrictEqual } from "node:util";
import recipe from "./groupie-card-v3.json";
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
import { addSourceBoundStatEffect } from "./timed-stat-effects";
export const groupieId = recipe.cardId;

export function bindGroupie(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  effects: {
    hasAbility(s: GameState, id: string): boolean;
    characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
    canTarget(s: GameState, source: string, target: string): boolean;
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
    throw Error("Groupie definition mismatch");
  const observe = (
    s: GameState,
    id: string,
    event: PendingTrigger["event"],
  ) => {
    if (s.engineVersion !== engine.version || s.rulesVersion !== rulesVersion)
      throw Error("Groupie runtime mismatch");
    if (event.type !== "character-entered" || event.instanceId !== id)
      return null;
    if (!event.observers || !event.zonesAtEvent || !event.statEffectsBefore)
      throw Error("Groupie entry observation unavailable");
    const observed = ruleEventObservationState(s, event),
      source = observed.objects[id];
    return source?.definitionVersion === pin.version &&
      observed.arena.includes(id) &&
      effects.hasAbility(observed, id)
      ? source
      : null;
  };
  const targets: NonNullable<TriggerBehavior["targets"]> = (s, t) => {
    const source = observe(s, t.sourceId, t.event);
    if (!source || source.controller !== t.controller)
      throw Error("Invalid Groupie trigger");
    const current = effects.characteristics(s);
    return s.arena
      .filter((id) => {
        const c = current.get(id);
        return (
          c?.cardType === "character" &&
          c.iconic &&
          c.factions.includes("THRASHER") &&
          s.objects[id].controller === t.controller &&
          effects.canTarget(s, t.sourceId, id)
        );
      })
      .map((id) => ({
        kind: "character" as const,
        id,
        incarnation: s.objects[id].incarnation,
      }));
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
        targets,
        resolve(s, t) {
          const source = observe(s, t.sourceId, t.event);
          if (
            !source ||
            t.handler !== handler ||
            t.controller !== source.controller
          )
            throw Error("Invalid Groupie resolution");
          if (
            !s.arena.includes(source.id) ||
            s.objects[source.id].incarnation !== source.incarnation ||
            !t.target ||
            !targets(s, t).some((target) => isDeepStrictEqual(target, t.target))
          )
            return s;
          if (t.target.kind !== "character")
            throw Error("Invalid Groupie target");
          return addSourceBoundStatEffect(
            s,
            source.id,
            t.target.id,
            { layer: "7d", operation: "add", attack: 2, defence: 0 },
            effects.characteristics(s),
          );
        },
      },
    ],
  ]);
  return {
    events,
    triggers,
    triggerLabels: new Map([
      [handler, "Groupie: +2/+0 while Groupie remains in play."],
    ]),
  };
}
