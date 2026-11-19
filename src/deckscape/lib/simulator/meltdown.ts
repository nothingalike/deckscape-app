import { isDeepStrictEqual } from "node:util";
import spec from "./meltdown-specification-v3.json";
import { versionDefinition, type EngineManifest } from "./definition-version";
import type { PinnedDefinition } from "./deck-admission";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import type { GameState } from "./game-state";
import type { CounterPlacement } from "./put-counters";
import {
  ruleEventObservationState,
  type RuleEvent,
  type EventBehavior,
} from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import { mainframeTierRequirements } from "./synergy";

export const meltdownId = spec.cardId;

export function bindMeltdown(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  effects: {
    characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
    hasAbility(state: GameState, id: string): boolean;
    canTarget(state: GameState, sourceId: string, targetId: string): boolean;
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
      { id: spec.handlerId, version: 1, parameters: {} },
    ])
  )
    throw Error("Meltdown definition mismatch");
  const tier = (
    state: GameState,
    sourceId: string,
    event: RuleEvent,
  ): number => {
    if (
      state.engineVersion !== engine.version ||
      state.rulesVersion !== rulesVersion
    )
      throw Error("Meltdown runtime mismatch");
    if (
      event.type !== "program-played" ||
      !event.factions.some((f) => f === "HACKER" || f === "DUSTRUNNER")
    )
      return 0;
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
          if (!tier(state, sourceId, event) || event.type !== "program-played")
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
      throw Error("Invalid Meltdown target trigger");
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
        optional: () => "Put Meltdown counters on the selected character?",
        resolve(state, trigger) {
          const amount = tier(state, trigger.sourceId, trigger.event);
          if (
            !amount ||
            trigger.handler !== spec.handlerId ||
            trigger.event.type !== "program-played" ||
            trigger.controller !== trigger.event.player
          )
            throw Error("Invalid retained Meltdown trigger");
          if (
            trigger.target?.kind !== "character" ||
            !targets(state, trigger).some((t) =>
              isDeepStrictEqual(t, trigger.target),
            )
          )
            return state;
          return effects.putCounters(state, trigger.sourceId, [
            { instanceId: trigger.target.id, counter: "+1/+1", amount },
          ]);
        },
      },
    ],
  ]);
  return {
    events,
    triggers,
    triggerLabels: new Map([
      [spec.handlerId, "Meltdown: put +1/+1 counters on a character."],
    ]),
  };
}
