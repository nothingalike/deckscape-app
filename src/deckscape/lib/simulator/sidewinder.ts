import { isDeepStrictEqual } from "node:util";
import spec from "./sidewinder-specification-v5.json";
import { versionDefinition, type EngineManifest } from "./definition-version";
import type { PinnedDefinition } from "./deck-admission";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import type { GameState } from "./game-state";
import { mainframeTierRequirements } from "./synergy";
import {
  ruleEventObservationState,
  type EventBehavior,
  type PendingTrigger,
} from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
export function bindSidewinder(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  e: {
    characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
    hasAbility(s: GameState, id: string): boolean;
    returnToHand(s: GameState, id: string): GameState;
  },
) {
  const pin = versionDefinition(input.definition, engine);
  if (
    pin.version !== input.version ||
    pin.definition.cardId !== spec.cardId ||
    pin.definition.rulesVersion !== rulesVersion ||
    !isDeepStrictEqual(
      pin.definition.characteristics,
      characteristicsSchema.parse(spec.characteristics),
    ) ||
    !isDeepStrictEqual(pin.definition.handlers, [
      { id: spec.handlerId, version: 1, parameters: {} },
    ])
  )
    throw Error("Sidewinder definition mismatch");
  const tier = (s: GameState, target: string) => {
    const cards = e.characteristics(s),
      card = cards.get(target),
      object = s.objects[target];
    if (
      !object ||
      !s.arena.includes(target) ||
      card?.cardType !== "character" ||
      !card.factions.includes("DUSTRUNNER")
    )
      return 0;
    const source = s.players[object.controller].zones.mainframe.find(
      (id) =>
        s.objects[id].definitionVersion === pin.version && e.hasAbility(s, id),
    );
    if (!source) return 0;
    const thresholds = mainframeTierRequirements(s, source, cards);
    return thresholds[1] ? 2 : thresholds[0] ? 1 : 0;
  };
  const qualifies = (
    s: GameState,
    id: string,
    event: PendingTrigger["event"],
  ) =>
    event.type === "object-targeted" &&
    event.instanceId === id &&
    event.sourceController !== event.player &&
    tier(ruleEventObservationState(s, event), id) > 0;
  const present = (s: GameState, t: PendingTrigger) => {
    if (
      t.handler !== spec.handlerId ||
      !qualifies(s, t.sourceId, t.event) ||
      t.event.type !== "object-targeted" ||
      t.controller !== t.event.player
    )
      throw Error("Invalid Sidewinder MIRAGE trigger");
    return (
      s.arena.includes(t.sourceId) &&
      s.objects[t.sourceId]?.incarnation === t.event.incarnation
    );
  };
  const behavior: EventBehavior = {
    onEvent(s, id, event) {
      return qualifies(s, id, event)
        ? [
            {
              sourceId: id,
              controller: ruleEventObservationState(s, event).objects[id]
                .controller,
              handler: spec.handlerId,
              event,
            },
          ]
        : [];
    },
  };
  const trigger: TriggerBehavior = {
    optional(s, t) {
      return present(s, t)
        ? "MIRAGE: return this character to its owner's hand?"
        : null;
    },
    resolve(s, t) {
      return present(s, t) ? e.returnToHand(s, t.sourceId) : s;
    },
  };
  return {
    minimumBlockers: (s: GameState, id: string) => (tier(s, id) === 2 ? 2 : 1),
    behavior,
    triggers: new Map([[spec.handlerId, trigger]]),
    triggerLabels: new Map([[spec.handlerId, "Sidewinder: MIRAGE"]]),
  };
}
