import { isDeepStrictEqual } from "node:util";
import recipe from "./sinister-manager-card-v3.json";
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
import { addSourceBoundKeywordEffect } from "./timed-combat-effects";
import type { PersistentDeparture } from "./destruction";
export const sinisterManagerId = recipe.cardId;

export function bindSinisterManager(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  effects: {
    hasAbility(s: GameState, id: string): boolean;
    characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
    canTarget(s: GameState, source: string, target: string): boolean;
    depart(s: GameState, intents: readonly PersistentDeparture[]): GameState;
  },
) {
  const pin = versionDefinition(input.definition, engine),
    handler = recipe.handlers[0].id,
    leaveHandler = recipe.handlers[1].id;
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
    throw Error("SinisterManager definition mismatch");
  const observe = (
    s: GameState,
    id: string,
    event: PendingTrigger["event"],
  ) => {
    if (s.engineVersion !== engine.version || s.rulesVersion !== rulesVersion)
      throw Error("SinisterManager runtime mismatch");
    if (
      (event.type !== "character-entered" &&
        event.type !== "persistent-destroyed" &&
        event.type !== "persistent-binned" &&
        event.type !== "persistent-moved") ||
      event.instanceId !== id
    )
      return null;
    if (!event.observers || !event.zonesAtEvent || !event.statEffectsBefore)
      throw Error("SinisterManager entry observation unavailable");
    const observed = ruleEventObservationState(s, event),
      source = observed.objects[id];
    return source?.definitionVersion === pin.version &&
      observed.arena.includes(id) &&
      effects.hasAbility(observed, id)
      ? source
      : null;
  };
  // Departure observations retain the source-bound stat effects from before the
  // move. They identify the linked incarnation even after duration cleanup, and
  // survive saving/reloading the queued leave trigger without new mutable links.
  const linked = (s: GameState, id: string, event: PendingTrigger["event"]) => {
    const source = observe(s, id, event);
    if (
      !source ||
      event.type === "character-entered" ||
      !("statEffectsBefore" in event)
    )
      return [];
    return (event.statEffectsBefore ?? []).filter(
      (effect) =>
        effect.expiresAfterTurn === null &&
        effect.sourceId === id &&
        effect.sourceIncarnation === source.incarnation &&
        effect.targetIncarnation !== undefined,
    );
  };
  const targets: NonNullable<TriggerBehavior["targets"]> = (s, t) => {
    const source = observe(s, t.sourceId, t.event);
    if (!source || source.controller !== t.controller)
      throw Error("Invalid SinisterManager trigger");
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
            ? event.type === "character-entered" || linked(s, id, event).length
              ? [
                  {
                    sourceId: id,
                    controller: source.controller,
                    handler:
                      event.type === "character-entered"
                        ? handler
                        : leaveHandler,
                    event,
                  },
                ]
              : []
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
            throw Error("Invalid SinisterManager resolution");
          if (
            !s.arena.includes(source.id) ||
            s.objects[source.id].incarnation !== source.incarnation ||
            !t.target ||
            !targets(s, t).some((target) => isDeepStrictEqual(target, t.target))
          )
            return s;
          if (t.target.kind !== "character")
            throw Error("Invalid SinisterManager target");
          const next = addSourceBoundStatEffect(
            s,
            source.id,
            t.target.id,
            { layer: "7d", operation: "add", attack: 4, defence: 4 },
            effects.characteristics(s),
          );
          return addSourceBoundKeywordEffect(
            next,
            source.id,
            t.target.id,
            "OVERRUN",
            effects.characteristics(next),
          );
        },
      },
    ],
    [
      leaveHandler,
      {
        resolve(s, t) {
          const source = observe(s, t.sourceId, t.event);
          if (
            !source ||
            t.handler !== leaveHandler ||
            source.controller !== t.controller ||
            t.event.type === "character-entered"
          )
            throw Error("Invalid Sinister Manager departure trigger");
          const current = effects.characteristics(s);
          const ids = [
            ...new Set(
              linked(s, t.sourceId, t.event)
                .filter(
                  (effect) =>
                    effect.targetId !== null &&
                    s.arena.includes(effect.targetId) &&
                    s.objects[effect.targetId]?.incarnation ===
                      effect.targetIncarnation &&
                    current.get(effect.targetId)?.cardType === "character",
                )
                .flatMap((effect) =>
                  effect.targetId === null ? [] : [effect.targetId],
                ),
            ),
          ];
          return ids.length
            ? effects.depart(
                s,
                ids.map((id) => ({
                  id,
                  kind: "destroy",
                  sourceId: t.sourceId,
                  destroyedBy: t.controller,
                  reason: "normal",
                })),
              )
            : s;
        },
      },
    ],
  ]);
  return {
    events,
    triggers,
    triggerLabels: new Map([
      [
        handler,
        "Sinister Manager: +4/+4 and OVERRUN while it remains in play.",
      ],
      [leaveHandler, "Sinister Manager: destroy the linked character."],
    ]),
  };
}
