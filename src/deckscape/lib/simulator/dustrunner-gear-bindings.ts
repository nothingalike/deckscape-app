import { isDeepStrictEqual } from "node:util";
import specifications from "./dustrunner-gear-specifications-v1.json";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import { versionDefinition, type EngineManifest } from "./definition-version";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";
import type { StatEffect } from "./stat-layers";
import { tetherChains } from "./tether-chain";
import {
  ruleEventObservationState,
  type EventBehavior,
  type PendingTrigger,
} from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import type { CounterPlacement } from "./put-counters";

export interface DustrunnerGearEffects {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  hasAbility(state: GameState, sourceId: string, handler: string): boolean;
  /** Explicit base values after preceding base-setting effects, before additions/counters. */
  baseStats(
    state: GameState,
  ): ReadonlyMap<string, { attack: number; defence: number }>;
  putCounters(
    state: GameState,
    sourceId: string,
    placements: readonly CounterPlacement[],
  ): GameState;
}

/** Five retained starter gear bindings. Composition supplies ability layers and
 * base stats; neither binding construction nor specification presence admits a deck. */
export function bindDustrunnerGear(
  inputs: readonly PinnedDefinition[],
  engine: EngineManifest,
  rulesVersion: string,
  effects: DustrunnerGearEffects,
) {
  const bound = new Map<string, (typeof specifications)[number]>();
  const ids = new Set<string>();
  for (const input of inputs) {
    const pin = versionDefinition(input.definition, engine);
    const spec = structuredClone(
      specifications.find((s) => s.cardId === pin.definition.cardId),
    );
    // V6 corrects the printed requirement; retained releases keep their exact specs.
    if (spec?.kind === "synchronize" && engine.version === "expanded-v6")
      spec.characteristics.requirements = { DUSTRUNNER: 1 };
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
      throw new Error("Dustrunner gear definition mismatch");
    ids.add(spec.cardId);
    bound.set(pin.version, spec);
  }
  const check = (state: GameState) => {
    if (
      state.engineVersion !== engine.version ||
      state.rulesVersion !== rulesVersion
    )
      throw new Error("Dustrunner gear runtime mismatch");
  };
  const active = (state: GameState, id: string) => {
    check(state);
    const object = state.objects[id];
    const spec = object && bound.get(object.definitionVersion);
    return spec &&
      state.arena.includes(id) &&
      !object.faceDown &&
      effects.hasAbility(state, id, spec.handlerId)
      ? spec
      : undefined;
  };
  const hasTether = (state: GameState, id: string) => {
    const kind = active(state, id)?.kind;
    return (
      kind === "amplifier" || kind === "hot-wire" || kind === "synchronize"
    );
  };
  const hosts = (
    state: GameState,
    id: string,
    cards: ReadonlyMap<string, CardCharacteristics>,
  ) => [
    ...new Set(
      state.objects[id].attachments
        .filter((l) => l.kind === "gear")
        .map((l) => l.hostId)
        .filter(
          (host) =>
            state.arena.includes(host) &&
            cards.get(host)?.cardType === "character",
        ),
    ),
  ];
  const events = new Map<string, EventBehavior>();
  const triggers = new Map<string, TriggerBehavior>();
  const triggerLabels = new Map<string, string>();
  for (const [version, spec] of bound) {
    if (spec.kind !== "bloodletter") continue;
    const qualifies = (
      state: GameState,
      id: string,
      event: PendingTrigger["event"],
    ) => {
      if (
        event.type !== "character-damaged" ||
        !event.combat ||
        event.amount <= 0
      )
        return false;
      const observed = ruleEventObservationState(state, event);
      return (
        active(observed, id)?.kind === "bloodletter" &&
        observed.objects[id].attachments.some(
          (l) => l.kind === "gear" && l.hostId === event.sourceId,
        )
      );
    };
    events.set(version, {
      onEvent(state, id, event) {
        if (!qualifies(state, id, event)) return [];
        const observed = ruleEventObservationState(state, event);
        return [
          {
            sourceId: id,
            controller: observed.objects[id].controller,
            handler: spec.handlerId,
            event: structuredClone(event),
          },
        ];
      },
    });
    triggers.set(spec.handlerId, {
      resolve(state, trigger) {
        check(state);
        const event = trigger.event;
        if (
          trigger.handler !== spec.handlerId ||
          !qualifies(state, trigger.sourceId, event) ||
          event.type !== "character-damaged"
        )
          throw new Error("Invalid Bloodletter trigger");
        const observed = ruleEventObservationState(state, event);
        if (
          trigger.controller !== observed.objects[trigger.sourceId].controller
        )
          throw new Error("Invalid Bloodletter controller");
        const recipient = state.objects[event.instanceId];
        if (
          !state.arena.includes(event.instanceId) ||
          recipient?.incarnation !==
            observed.objects[event.instanceId]?.incarnation ||
          effects.characteristics(state).get(event.instanceId)?.cardType !==
            "character"
        )
          return state;
        return effects.putCounters(state, trigger.sourceId, [
          { instanceId: event.instanceId, counter: "BLEED", amount: 2 },
        ]);
      },
    });
    triggerLabels.set(
      spec.handlerId,
      "Put 2 BLEED counters on the character hit.",
    );
  }
  return {
    events,
    triggers,
    triggerLabels,
    hasTether,
    statEffects(
      state: GameState,
      beforeStats: ReadonlyMap<string, CardCharacteristics>,
    ): Map<string, StatEffect[]> {
      check(state);
      const chains = tetherChains(state, beforeStats, (id) =>
        hasTether(state, id),
      );
      const result = new Map<string, StatEffect[]>();
      let bases: ReturnType<DustrunnerGearEffects["baseStats"]> | undefined;
      for (const id of state.arena) {
        const spec = active(state, id);
        if (!spec) continue;
        const attached = hosts(state, id, beforeStats);
        if (!attached.length) continue;
        const targets = hasTether(state, id)
          ? [...(chains.get(attached[0]) ?? [])]
          : attached;
        for (const target of targets) {
          let change: {
            layer: "7c" | "7d";
            operation: "set" | "add";
            attack?: number;
            defence?: number;
          };
          if (spec.kind === "glaive") {
            const card = beforeStats.get(target)!;
            const dustDevil = card.name.toUpperCase().includes("DUST DEVIL");
            change = {
              layer: "7d",
              operation: "add",
              attack: dustDevil ? 6 : 2,
            };
          } else if (spec.kind === "amplifier")
            change = { layer: "7d", operation: "add", attack: 1, defence: 1 };
          else if (spec.kind === "synchronize") {
            bases ??= effects.baseStats(state);
            const values = targets.map((t) => {
              const v = bases!.get(t);
              if (!v) throw new Error("Missing tether base stats");
              return v;
            });
            change = {
              layer: "7c",
              operation: "set",
              attack: Math.max(...values.map((v) => v.attack)),
              defence: Math.max(...values.map((v) => v.defence)),
            };
          } else continue;
          const object = state.objects[id];
          const effect: StatEffect = {
            id: `${id}:${object.incarnation}:${spec.handlerId}`,
            timestamp: object.timestamp,
            dependsOn: [],
            ...change,
          };
          result.set(target, [...(result.get(target) ?? []), effect]);
        }
      }
      return result;
    },
    overrun(
      state: GameState,
      cards: ReadonlyMap<string, CardCharacteristics>,
    ): ReadonlySet<string> {
      check(state);
      const chains = tetherChains(state, cards, (id) => hasTether(state, id)),
        result = new Set<string>();
      for (const id of state.arena) {
        if (active(state, id)?.kind !== "hot-wire") continue;
        const first = hosts(state, id, cards)[0];
        for (const target of chains.get(first) ?? []) result.add(target);
      }
      return result;
    },
  };
}
