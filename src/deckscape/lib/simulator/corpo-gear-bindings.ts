import { isDeepStrictEqual } from "node:util";
import specs from "./corpo-gear-specifications-v1.json";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import { versionDefinition, type EngineManifest } from "./definition-version";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import {
  ruleEventObservationState,
  type EventBehavior,
  type RuleEvent,
} from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import type { StatEffect } from "./stat-layers";
import { preventAllDamageUntilTurnEnd } from "./timed-damage-prevention";

/** Retained Corpo gear behavior. The release must wire draw replacements,
 * visibility, swift play and stat contributions before admitting either card. */
export function bindCorpoGear(
  inputs: readonly PinnedDefinition[],
  engine: EngineManifest,
  rulesVersion: string,
  effects: {
    hasAbility(state: GameState, sourceId: string, handler: string): boolean;
    characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
    draw(
      state: GameState,
      sourceId: string,
      player: Seat,
      count: number,
    ): GameState;
  },
) {
  const bound = new Map<string, (typeof specs)[number]>();
  const ids = new Set<string>();
  for (const input of inputs) {
    const pin = versionDefinition(input.definition, engine),
      spec = specs.find((s) => s.cardId === pin.definition.cardId);
    if (
      !spec ||
      ids.has(spec.cardId) ||
      pin.version !== input.version ||
      pin.definition.rulesVersion !== rulesVersion ||
      !isDeepStrictEqual(
        pin.definition.characteristics,
        characteristicsSchema.parse(spec.characteristics),
      ) ||
      !isDeepStrictEqual(pin.definition.handlers, [
        { id: spec.handlerId, version: spec.handlerVersion, parameters: {} },
      ])
    )
      throw new Error("Corpo gear definition mismatch");
    ids.add(spec.cardId);
    bound.set(pin.version, spec);
  }
  const check = (state: GameState) => {
    if (
      state.engineVersion !== engine.version ||
      state.rulesVersion !== rulesVersion
    )
      throw new Error("Corpo gear runtime mismatch");
  };
  const active = (state: GameState, id: string) => {
    check(state);
    const object = state.objects[id],
      spec = object && bound.get(object.definitionVersion);
    return spec &&
      state.arena.includes(id) &&
      !object.faceDown &&
      effects.hasAbility(state, id, spec.handlerId)
      ? spec
      : undefined;
  };
  const hosts = (state: GameState, id: string) => [
    ...new Set(
      state.objects[id].attachments
        .filter(
          (link) =>
            link.kind === "gear" &&
            state.arena.includes(link.hostId) &&
            effects.characteristics(state).get(link.hostId)?.cardType ===
              "character",
        )
        .map((link) => link.hostId),
    ),
  ];
  const events = new Map<string, EventBehavior>(),
    triggers = new Map<string, TriggerBehavior>(),
    triggerLabels = new Map<string, string>();
  for (const [version, spec] of bound) {
    const entered = (state: GameState, id: string, event: RuleEvent) => {
      if (event.type !== "gear-entered" || event.instanceId !== id)
        return undefined;
      const observed = ruleEventObservationState(state, event);
      return active(observed, id)?.cardId === spec.cardId
        ? observed
        : undefined;
    };
    events.set(version, {
      onEvent(state, id, event) {
        const observed = entered(state, id, event);
        return observed
          ? [
              {
                sourceId: id,
                controller: observed.objects[id].controller,
                handler: spec.handlerId,
                event: structuredClone(event),
              },
            ]
          : [];
      },
    });
    triggers.set(spec.handlerId, {
      resolve(state, trigger) {
        check(state);
        const observed = entered(state, trigger.sourceId, trigger.event);
        if (
          !observed ||
          trigger.handler !== spec.handlerId ||
          trigger.controller !== observed.objects[trigger.sourceId].controller
        )
          throw new Error("Invalid Corpo gear entry trigger");
        if (spec.kind === "az-glass")
          return effects.draw(state, trigger.sourceId, trigger.controller, 1);
        let next = state;
        const source = state.objects[trigger.sourceId];
        const attachmentState =
          state.arena.includes(trigger.sourceId) &&
          source.incarnation === observed.objects[trigger.sourceId].incarnation
            ? state
            : observed;
        for (const host of hosts(attachmentState, trigger.sourceId)) {
          if (
            !state.arena.includes(host) ||
            state.objects[host]?.incarnation !==
              attachmentState.objects[host].incarnation ||
            effects.characteristics(state).get(host)?.cardType !== "character"
          )
            continue;
          next = preventAllDamageUntilTurnEnd(next, trigger.sourceId, host);
        }
        return next;
      },
    });
    triggerLabels.set(
      spec.handlerId,
      spec.kind === "az-glass"
        ? "Draw 1 card."
        : "Prevent all damage to the attached character until turn end.",
    );
  }
  return {
    events,
    triggers,
    triggerLabels,
    swift(state: GameState, id: string) {
      check(state);
      return (
        bound.get(state.objects[id]?.definitionVersion)?.kind === "sneakerhead"
      );
    },
    canInspectFaceDown(state: GameState, viewer: Seat, targetId: string) {
      check(state);
      if (
        !state.arena.includes(targetId) &&
        !state.environment.includes(targetId) &&
        !state.players.some(
          (p) =>
            p.zones.mainframe.includes(targetId) ||
            p.zones.ramBank.includes(targetId),
        )
      )
        return false;
      return state.arena.some(
        (id) =>
          active(state, id)?.kind === "az-glass" &&
          state.objects[id].controller === viewer,
      );
    },
    statEffects(state: GameState): Map<string, StatEffect[]> {
      check(state);
      const result = new Map<string, StatEffect[]>();
      for (const id of state.arena) {
        const spec = active(state, id);
        if (spec?.kind !== "sneakerhead") continue;
        const object = state.objects[id];
        for (const host of hosts(state, id))
          result.set(host, [
            ...(result.get(host) ?? []),
            {
              id: `${id}:${object.incarnation}:${spec.handlerId}`,
              timestamp: object.timestamp,
              dependsOn: [],
              layer: "7d",
              operation: "add",
              defence: 2,
            },
          ]);
      }
      return result;
    },
  };
}
