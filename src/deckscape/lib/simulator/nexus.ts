import { isDeepStrictEqual } from "node:util";
import spec from "./nexus-specification-v3.json";
import { versionDefinition, type EngineManifest } from "./definition-version";
import type { PinnedDefinition } from "./deck-admission";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import {
  ruleEventObservationState,
  type RuleEvent,
  type EventBehavior,
} from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import { mainframeTierRequirements } from "./synergy";
import { addUntilTurnEndStatEffect } from "./timed-stat-effects";
export const nexusId = spec.cardId;

export function bindNexus(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  effects: {
    characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
    hasAbility(state: GameState, id: string): boolean;
    canTarget(state: GameState, sourceId: string, targetId: string): boolean;
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
      { id: spec.handlerId, version: 1, parameters: {} },
    ])
  )
    throw Error("Nexus definition mismatch");
  const tier = (
    state: GameState,
    sourceId: string,
    event: RuleEvent,
  ): number => {
    if (
      state.engineVersion !== engine.version ||
      state.rulesVersion !== rulesVersion
    )
      throw Error("Nexus runtime mismatch");
    if (event.type !== "ram-installed") return 0;
    const observed = ruleEventObservationState(state, event),
      source = observed.objects[sourceId];
    if (
      source?.definitionVersion !== pin.version ||
      source.controller !== event.player ||
      !observed.players[event.player].zones.mainframe.includes(sourceId) ||
      !effects.hasAbility(observed, sourceId)
    )
      return 0;
    const active = mainframeTierRequirements(
      observed,
      sourceId,
      effects.characteristics(observed),
    );
    return active[1] ? 2 : active[0] ? 1 : 0;
  };
  const events = new Map<string, EventBehavior>([
    [
      pin.version,
      {
        onEvent(state, sourceId, event) {
          if (!tier(state, sourceId, event) || event.type !== "ram-installed")
            return [];
          return [
            {
              sourceId,
              controller: event.player,
              handler: spec.handlerId,
              event,
            },
          ];
        },
      },
    ],
  ]);
  const targets: NonNullable<TriggerBehavior["targets"]> = (state, trigger) => {
    if (!tier(state, trigger.sourceId, trigger.event))
      throw Error("Invalid Nexus target trigger");
    const current = effects.characteristics(state);
    return state.arena
      .filter(
        (id) =>
          current.get(id)?.cardType === "character" &&
          effects.canTarget(state, trigger.sourceId, id),
      )
      .map((id) => ({
        kind: "character" as const,
        id,
        incarnation: state.objects[id].incarnation,
      }));
  };
  const triggers = new Map<string, TriggerBehavior>([
    [
      spec.handlerId,
      {
        targets,
        optional: () => "Give the selected character a temporary Nexus bonus?",
        resolve(state, trigger) {
          const amount = tier(state, trigger.sourceId, trigger.event);
          if (
            !amount ||
            trigger.handler !== spec.handlerId ||
            trigger.event.type !== "ram-installed" ||
            trigger.controller !== trigger.event.player
          )
            throw Error("Invalid retained Nexus trigger");
          if (
            trigger.target?.kind !== "character" ||
            !targets(state, trigger).some((t) =>
              isDeepStrictEqual(t, trigger.target),
            )
          )
            return state;
          return addUntilTurnEndStatEffect(
            state,
            trigger.sourceId,
            trigger.target.id,
            { layer: "7d", operation: "add", attack: amount, defence: amount },
            effects.characteristics(state),
          );
        },
      },
    ],
  ]);
  return {
    events,
    triggers,
    triggerLabels: new Map([
      [spec.handlerId, "Nexus: boost a character until turn end."],
    ]),
  };
}
