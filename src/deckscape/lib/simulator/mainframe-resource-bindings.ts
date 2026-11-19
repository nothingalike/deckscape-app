import { isDeepStrictEqual } from "node:util";
import specifications from "./mainframe-resource-specifications-v1.json";
import { versionDefinition, type EngineManifest } from "./definition-version";
import type { PinnedDefinition } from "./deck-admission";
import type { CardCharacteristics } from "./characteristics";
import { characteristicsSchema } from "./characteristics";
import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import { mainframeTierRequirements } from "./synergy";
import {
  type EventBehavior,
  type RuleEvent,
  type PendingTrigger,
} from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";

export interface MainframeResourceEffects {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  hasAbility(state: GameState, sourceId: string, handler: string): boolean;
  /** Current restrictions and replacements are evaluated when the trigger resolves. */
  draw(state: GameState, player: Seat, sourceId: string): GameState;
  install(
    state: GameState,
    player: Seat,
    sourceId: string,
    running: boolean,
  ): GameState;
}
export interface RamEntryReplacement {
  sourceId: string;
  handler: "az-luxureon/ram-entry-v1";
  running: false;
}

/** Retained mainframe resource behavior. Events check synergy at the event; the
 * resulting trigger survives loss of synergy. No prose matching or support promotion. */
export function bindMainframeResources(
  inputs: readonly PinnedDefinition[],
  engine: EngineManifest,
  rulesVersion: string,
  effects: MainframeResourceEffects,
) {
  const engineVersion = engine.version;
  const bindings = new Map<string, (typeof specifications)[number]>(),
    seen = new Set<string>();
  for (const input of inputs) {
    const pin = versionDefinition(input.definition, engine),
      spec = specifications.find(
        (spec) => spec.cardId === pin.definition.cardId,
      );
    if (
      pin.version !== input.version ||
      pin.definition.rulesVersion !== rulesVersion
    )
      throw new Error("Mainframe resource definition pin mismatch");
    if (!spec || seen.has(spec.cardId))
      throw new Error("Unknown or duplicate mainframe resource binding");
    if (
      !isDeepStrictEqual(
        pin.definition.characteristics,
        characteristicsSchema.parse(spec.characteristics),
      ) ||
      !isDeepStrictEqual(pin.definition.handlers, spec.handlers)
    )
      throw new Error(
        "Mainframe definition does not match its versioned resource implementation",
      );
    bindings.set(pin.version, structuredClone(spec));
    seen.add(spec.cardId);
  }
  const assertPins = (state: GameState) => {
    if (
      state.engineVersion !== engineVersion ||
      state.rulesVersion !== rulesVersion
    )
      throw new Error("Mainframe resource runtime version mismatch");
  };
  const operational = (
    state: GameState,
    sourceId: string,
    spec: (typeof specifications)[number],
    tier: number,
  ) => {
    const cards = effects.characteristics(structuredClone(state)),
      card = cards.get(sourceId);
    if (card?.cardType !== "mainframe")
      throw new Error("Mainframe resource characteristics unavailable");
    if (
      !isDeepStrictEqual(card.tiers, spec.characteristics.tiers) ||
      card.prefix !== spec.characteristics.prefix
    )
      throw new Error(
        "Mainframe resource ability text changed without a matching interpreter",
      );
    return (
      effects.hasAbility(
        structuredClone(state),
        sourceId,
        spec.handlers[tier].id,
      ) && mainframeTierRequirements(state, sourceId, cards)[tier]
    );
  };
  const discover = (
    state: GameState,
    sourceId: string,
    event: RuleEvent,
  ): PendingTrigger[] => {
    assertPins(state);
    const source = state.objects[sourceId],
      spec = source && bindings.get(source.definitionVersion);
    if (!source || !spec)
      throw new Error("Mainframe resource source binding unavailable");
    if (
      source.faceDown ||
      !state.players[source.owner].zones.mainframe.includes(sourceId)
    )
      return [];
    let tier: number;
    if (spec.kind === "coyote") {
      if (event.type === "gear-played" && event.subtype === "tether") tier = 0;
      else if (
        event.type === "character-played" &&
        event.factions.includes("DUSTRUNNER")
      )
        tier = 1;
      else return [];
    } else {
      if (event.type !== "system-checked") return [];
      tier = 1;
    }
    if (event.player !== source.owner) return [];
    if (
      !("zonesAtEvent" in event) ||
      !event.zonesAtEvent ||
      !("observers" in event) ||
      !event.observers ||
      !("statEffectsBefore" in event) ||
      !event.statEffectsBefore
    )
      throw new Error("Mainframe trigger event observation unavailable");
    if (!operational(state, sourceId, spec, tier)) return [];
    return [
      {
        sourceId,
        controller: source.owner,
        handler: spec.handlers[tier].id,
        event,
      },
    ];
  };
  const events = new Map<string, EventBehavior>(),
    triggers = new Map<string, TriggerBehavior>(),
    triggerLabels = new Map<string, string>();
  for (const [version, spec] of bindings) {
    events.set(version, { onEvent: discover });
    for (const [tier, handler] of spec.handlers.entries()) {
      if (spec.kind === "az-luxureon" && tier === 0) continue;
      triggers.set(handler.id, {
        resolve(state, trigger) {
          assertPins(state);
          const event = trigger.event;
          const captured =
            "zonesAtEvent" in event
              ? event.zonesAtEvent?.objects[trigger.sourceId]
              : undefined;
          const matchingEvent =
            spec.kind === "coyote"
              ? tier === 0
                ? event.type === "gear-played" && event.subtype === "tether"
                : event.type === "character-played" &&
                  event.factions.includes("DUSTRUNNER")
              : event.type === "system-checked";
          if (
            trigger.handler !== handler.id ||
            !matchingEvent ||
            !captured ||
            captured.owner !== trigger.controller ||
            bindings.get(captured.definitionVersion)?.cardId !== spec.cardId ||
            !("player" in event) ||
            event.player !== trigger.controller
          )
            throw new Error("Invalid retained mainframe resource trigger");
          // Eligibility was captured when the trigger was created, never rechecked here.
          return spec.kind === "coyote"
            ? effects.draw(state, trigger.controller, trigger.sourceId)
            : effects.install(
                state,
                trigger.controller,
                trigger.sourceId,
                false,
              );
        },
      });
      triggerLabels.set(
        handler.id,
        spec.kind === "coyote"
          ? `Coyote: draw a card after playing ${tier === 0 ? "a tether" : "a DUSTRUNNER character"}.`
          : "A-Z Luxureon: install one RAM refreshed on your system check.",
      );
    }
  }
  return {
    events,
    triggers,
    triggerLabels,
    /** Submit candidates to the owning runtime's replacement evaluator before RAM enters.
     * This does not refresh existing RAM or change ordinary commitment/release status. */
    ramEntryReplacements(
      state: GameState,
      player: Seat,
    ): RamEntryReplacement[] {
      assertPins(state);
      return state.players[player].zones.mainframe.flatMap((sourceId) => {
        const source = state.objects[sourceId],
          spec = source && bindings.get(source.definitionVersion);
        if (
          !spec ||
          spec.kind !== "az-luxureon" ||
          source.faceDown ||
          !operational(state, sourceId, spec, 0)
        )
          return [];
        return [
          {
            sourceId,
            handler: "az-luxureon/ram-entry-v1" as const,
            running: false as const,
          },
        ];
      });
    },
  };
}
