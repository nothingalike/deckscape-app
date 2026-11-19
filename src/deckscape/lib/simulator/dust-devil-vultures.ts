import { isDeepStrictEqual } from "node:util";
import spec from "./dust-devil-vultures-specification-v1.json";
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

export interface MirageEffects {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  hasAbility(state: GameState, sourceId: string): boolean;
  /** Shared departure evaluator applies restrictions/replacements and releases attachments. */
  returnToHand(state: GameState, sourceId: string): GameState;
}

/** CR 702.9: opponent targeting triggers an optional owner-hand return. A trigger
 * retains its source incarnation and controller; it never returns a later incarnation. */
export function bindDustDevilVultures(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  effects: MirageEffects,
) {
  const pin = versionDefinition(input.definition, engine);
  if (
    pin.version !== input.version ||
    pin.definition.rulesVersion !== rulesVersion ||
    pin.definition.cardId !== spec.cardId ||
    pin.definition.support === "unimplemented" ||
    !isDeepStrictEqual(
      pin.definition.characteristics,
      characteristicsSchema.parse(spec.characteristics),
    ) ||
    !isDeepStrictEqual(pin.definition.handlers, [
      { id: spec.handlerId, version: spec.handlerVersion, parameters: {} },
    ])
  )
    throw new Error("Dust Devil Vultures definition mismatch");
  const assertPins = (state: GameState) => {
    if (
      state.engineVersion !== engine.version ||
      state.rulesVersion !== rulesVersion
    )
      throw new Error("MIRAGE runtime version mismatch");
  };
  const qualifies = (
    state: GameState,
    sourceId: string,
    event: PendingTrigger["event"],
  ) => {
    if (
      event.type !== "object-targeted" ||
      event.instanceId !== sourceId ||
      event.sourceController === event.player
    )
      return false;
    const observed = ruleEventObservationState(state, event),
      source = observed.objects[sourceId];
    if (
      !source ||
      source.definitionVersion !== pin.version ||
      source.incarnation !== event.incarnation ||
      source.controller !== event.player
    )
      throw new Error("Invalid MIRAGE source observation");
    const card = effects
      .characteristics(structuredClone(observed))
      .get(sourceId);
    if (!card) throw new Error("MIRAGE characteristics unavailable");
    return (
      observed.arena.includes(sourceId) &&
      !source.faceDown &&
      card.cardType === "character" &&
      effects.hasAbility(observed, sourceId)
    );
  };
  const present = (state: GameState, trigger: PendingTrigger) => {
    assertPins(state);
    if (
      trigger.handler !== spec.handlerId ||
      !qualifies(state, trigger.sourceId, trigger.event) ||
      trigger.event.type !== "object-targeted" ||
      trigger.controller !== trigger.event.player
    )
      throw new Error("Invalid retained MIRAGE trigger");
    return (
      state.arena.includes(trigger.sourceId) &&
      state.objects[trigger.sourceId]?.incarnation === trigger.event.incarnation
    );
  };
  const events = new Map<string, EventBehavior>([
    [
      pin.version,
      {
        onEvent(state, sourceId, event) {
          assertPins(state);
          return qualifies(state, sourceId, event)
            ? [
                {
                  sourceId,
                  controller: state.objects[sourceId].controller,
                  handler: spec.handlerId,
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
      spec.handlerId,
      {
        optional(state, trigger) {
          return present(state, trigger)
            ? "Return Dust Devil Vultures to its owner's hand?"
            : null;
        },
        resolve(state, trigger) {
          return present(state, trigger)
            ? effects.returnToHand(state, trigger.sourceId)
            : state;
        },
      },
    ],
  ]);
  return {
    events,
    triggers,
    triggerLabels: new Map([[spec.handlerId, "Dust Devil Vultures: MIRAGE"]]),
  };
}
