import { isDeepStrictEqual } from "node:util";
import recipe from "./plasma-shackle-card-v3.json";
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
import type { CounterPlacement } from "./put-counters";

export const plasmaShackleId = recipe.cardId;
export function bindPlasmaShackle(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  effects: {
    hasAbility(s: GameState, id: string): boolean;
    characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
    putCounters(
      s: GameState,
      source: string,
      placements: readonly CounterPlacement[],
    ): GameState;
  },
) {
  const pin = versionDefinition(input.definition, engine),
    handler = recipe.handlers[0].id;
  if (
    pin.version !== input.version ||
    pin.definition.cardId !== recipe.cardId ||
    pin.definition.rulesVersion !== rulesVersion ||
    !isDeepStrictEqual(
      pin.definition.characteristics,
      characteristicsSchema.parse(recipe.characteristics),
    ) ||
    !isDeepStrictEqual(pin.definition.handlers, recipe.handlers)
  )
    throw Error("Plasma Shackle definition mismatch");
  const active = (s: GameState, id: string) =>
    s.objects[id]?.definitionVersion === pin.version &&
    !s.objects[id].faceDown &&
    effects.hasAbility(s, id);
  const hosts = (s: GameState, id: string) =>
    [
      ...new Set(
        s.objects[id]?.attachments
          .filter((a) => a.kind === "gear")
          .map((a) => a.hostId) ?? [],
      ),
    ].filter(
      (host) =>
        s.arena.includes(host) &&
        effects.characteristics(s).get(host)?.cardType === "character",
    );
  const observe = (
    s: GameState,
    id: string,
    event: PendingTrigger["event"],
  ) => {
    if (s.engineVersion !== engine.version || s.rulesVersion !== rulesVersion)
      throw Error("Plasma Shackle runtime mismatch");
    if (event.type !== "netcheck-started") return null;
    const seen = ruleEventObservationState(s, event);
    return seen.arena.includes(id) &&
      active(seen, id) &&
      hosts(seen, id).some(
        (host) => seen.objects[host].controller === event.player,
      )
      ? seen
      : null;
  };
  const events = new Map<string, EventBehavior>([
    [
      pin.version,
      {
        onEvent(s, id, event) {
          const seen = observe(s, id, event);
          return seen
            ? [
                {
                  sourceId: id,
                  controller: seen.objects[id].controller,
                  handler,
                  event: structuredClone(event),
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
          const seen = observe(s, t.sourceId, t.event);
          if (
            !seen ||
            t.handler !== handler ||
            t.controller !== seen.objects[t.sourceId].controller
          )
            throw Error("Invalid Plasma Shackle trigger");
          const stillHere =
            s.arena.includes(t.sourceId) &&
            s.objects[t.sourceId].incarnation ===
              seen.objects[t.sourceId].incarnation;
          const attached = stillHere
            ? hosts(s, t.sourceId).map((id) => ({
                id,
                incarnation: s.objects[id].incarnation,
              }))
            : (t.departedSourceHosts ??
              hosts(seen, t.sourceId).map((id) => ({
                id,
                incarnation: seen.objects[id].incarnation,
              })));
          const placements = attached
            .filter(
              (h) =>
                s.arena.includes(h.id) &&
                s.objects[h.id]?.incarnation === h.incarnation &&
                effects.characteristics(s).get(h.id)?.cardType === "character",
            )
            .map((h) => ({ instanceId: h.id, counter: "-1/-1", amount: 1 }));
          return placements.length
            ? effects.putCounters(s, t.sourceId, placements)
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
        "Plasma Shackle: put a -1/-1 counter on the attached character.",
      ],
    ]),
    malicious: (s: GameState, id: string) =>
      s.objects[id]?.definitionVersion === pin.version &&
      !s.objects[id].faceDown,
    additionalPsychosis(s: GameState, host: string) {
      return (
        8 *
        s.arena.filter((id) => active(s, id) && hosts(s, id).includes(host))
          .length
      );
    },
  };
}
