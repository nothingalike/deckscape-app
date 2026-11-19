import { multiverse } from "./multiverse";
import { setuSimulation } from "./setu-simulation";
import { theSpiritRealm } from "./the-spirit-realm";
import type { SpiritEntryEffects } from "./spirit-entry-choice";
import { crossfade } from "./crossfade";
import { yachtParty } from "./yacht-party";
import { isDeepStrictEqual } from "node:util";
import retainedEnvironmentSpecs from "./environment-specifications-v1.json";
import multiverseSpec from "./multiverse-specification-v5.json";
import wonderlandSpec from "./wonderland-specification-v5.json";
import passiveEnvironmentSpecs from "./passive-environment-specifications-v3.json";
const specifications = [
  ...retainedEnvironmentSpecs,
  ...passiveEnvironmentSpecs,
  wonderlandSpec,
  multiverseSpec,
];
import { versionDefinition, type EngineManifest } from "./definition-version";
import type { PinnedDefinition } from "./deck-admission";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { CombatDamagePacket } from "./combat-damage";
import {
  ruleEventObservationState,
  type EventBehavior,
  type PendingTrigger,
  type RuleEvent,
} from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import { acidRain } from "./acid-rain";
import { theAmrita } from "./the-amrita";
import { theNet } from "./the-net";
import { thePulse } from "./the-pulse";
import { maxGainz } from "./max-gainz";
import { zenGardenNetcheck } from "./zen-garden";
import type { CounterPlacement } from "./put-counters";
import { boardroom, boardroomPlayer } from "./boardroom";
import { theGrid, theGridIndex, blackMarketIndex } from "./the-grid";
import {
  completeTopCards,
  topCardCandidates,
  validateTopCardsContinuation,
  type TopCardsEffects,
  type TopCardsEvaluation,
} from "./top-cards";

export interface EnvironmentEffects {
  wonderland?(state: GameState, trigger: PendingTrigger): GameState;
  prepareEntry?(s: GameState, id: string): GameState;
  purgeBatch?(s: GameState, source: string, ids: readonly string[]): GameState;
  canTarget?(s: GameState, source: string, id: string): boolean;
  purge?(s: GameState, source: string, id: string): GameState;
  putCounters?(
    s: GameState,
    source: string,
    placements: readonly CounterPlacement[],
  ): GameState;
  createDrone?(state: GameState, player: Seat, sourceId: string): GameState;
  destroy?(
    state: GameState,
    sourceId: string,
    targetId: string,
    controller?: Seat,
  ): GameState;
  topCards?: Omit<TopCardsEffects, "characteristics">;
  install?(
    state: GameState,
    sourceId: string,
    player: Seat,
    running: boolean,
  ): GameState;
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  hasAbility(state: GameState, sourceId: string, handler: string): boolean;
  damage(state: GameState, packets: readonly CombatDamagePacket[]): GameState;
  gainHealth(
    state: GameState,
    sourceId: string,
    player: Seat,
    amount: number,
  ): GameState;
  draw(
    state: GameState,
    sourceId: string,
    player: Seat,
    count: number,
  ): GameState;
}

/** Event eligibility uses the captured in-play environment; resolution uses current effects. */
export function bindEnvironmentTriggers(
  inputs: readonly PinnedDefinition[],
  engine: EngineManifest,
  rulesVersion: string,
  effects: EnvironmentEffects,
) {
  const events = new Map<string, EventBehavior>();
  const triggers = new Map<string, TriggerBehavior>();
  const triggerLabels = new Map<string, string>();
  const spiritEntries = new Map<string, SpiritEntryEffects>();
  const bound = new Map<string, (typeof specifications)[number]>();
  const seen = new Set<string>();
  const validators = new Map<
    string,
    (state: GameState, trigger: PendingTrigger) => void
  >();
  for (const input of inputs) {
    const pin = versionDefinition(input.definition, engine);
    const spec = specifications.find((s) => s.cardId === pin.definition.cardId);
    if (
      !spec ||
      pin.version !== input.version ||
      pin.definition.rulesVersion !== rulesVersion ||
      pin.definition.support === "unimplemented" ||
      seen.has(spec.cardId) ||
      events.has(pin.version) ||
      triggers.has(spec.handlerId) ||
      !isDeepStrictEqual(
        pin.definition.characteristics,
        characteristicsSchema.parse(spec.characteristics),
      ) ||
      !isDeepStrictEqual(pin.definition.handlers, [
        { id: spec.handlerId, version: spec.handlerVersion, parameters: {} },
      ])
    )
      throw new Error("Environment definition mismatch");
    seen.add(spec.cardId);
    bound.set(pin.version, spec);
    if (spec.kind === "multiverse") {
      const binding = multiverse(pin.version, effects);
      events.set(pin.version, binding.events);
      triggers.set(spec.handlerId, binding.trigger);
      triggerLabels.set(spec.handlerId, spec.characteristics.name);
      continue;
    }
    if (spec.kind === "the-spirit-realm") {
      const binding = theSpiritRealm(pin.version, spec.handlerId, effects);
      events.set(pin.version, binding.events);
      triggers.set(spec.handlerId, binding.trigger);
      triggerLabels.set(spec.handlerId, spec.characteristics.name);
      spiritEntries.set(spec.handlerId, binding.entry);
      continue;
    }
    if (spec.kind === "the-hive" && !effects.createDrone)
      throw Error("The Hive token runtime unavailable");
    if (spec.kind === "death-wish" && !effects.destroy)
      throw Error("Death Wish destruction runtime unavailable");
    if (
      spec.kind === "zen-garden" &&
      (!effects.destroy || !effects.putCounters)
    )
      throw Error("Zen Garden runtime unavailable");
    if (spec.kind === "boardroom" && !effects.install)
      throw new Error("BOARDROOM install runtime unavailable");
    if (
      (spec.kind === "the-grid" || spec.kind === "black-market") &&
      !effects.topCards
    )
      throw new Error("THE GRID top-card runtime unavailable");
    const qualifies = (
      state: GameState,
      sourceId: string,
      event: RuleEvent,
    ) => {
      if (
        state.engineVersion !== engine.version ||
        state.rulesVersion !== rulesVersion
      )
        throw new Error("Environment runtime version mismatch");
      if (
        spec.kind === "max-gainz" ||
        spec.kind === "supersymmetry" ||
        spec.kind === "mosh-pit"
      )
        return false;
      if (
        event.type !==
        (spec.kind === "death-wish"
          ? "character-damaged"
          : spec.kind === "the-net"
            ? "program-played"
            : spec.kind === "the-pulse"
              ? "character-attacked"
              : "netcheck-started")
      )
        return false;
      if (!("observers" in event) || !event.observers || !event.zonesAtEvent)
        throw new Error("Environment trigger observation unavailable");
      const observed = ruleEventObservationState(state, event);
      const source = observed.objects[sourceId];
      if (event.type === "character-damaged") {
        const victim = effects.characteristics(observed).get(event.instanceId);
        if (
          event.channel !== "BF" ||
          event.amount <= 0 ||
          victim?.cardType !== "character" ||
          victim.factions.includes("THRASHER")
        )
          return false;
      }
      if (!source || source.definitionVersion !== pin.version)
        throw new Error("Environment source observation mismatch");
      const card = effects
        .characteristics(structuredClone(observed))
        .get(sourceId);
      if (event.type === "character-attacked") {
        const attacker = effects
          .characteristics(structuredClone(observed))
          .get(event.instanceId);
        if (!attacker)
          throw new Error("THE PULSE attacker observation unavailable");
        if (
          !observed.arena.includes(event.instanceId) ||
          attacker.cardType !== "character" ||
          !attacker.factions.includes("DUSTRUNNER")
        )
          return false;
      }
      return (
        observed.environment.includes(sourceId) &&
        !source.faceDown &&
        card?.cardType === "program" &&
        card.subtype === "environment" &&
        effects.hasAbility(observed, sourceId, spec.handlerId)
      );
    };
    events.set(pin.version, {
      onEvent(state, sourceId, event) {
        if (!qualifies(state, sourceId, event)) return [];
        const observed = ruleEventObservationState(state, event);
        return [
          {
            sourceId,
            controller: observed.objects[sourceId].controller,
            handler: spec.handlerId,
            event,
          },
        ];
      },
    });
    const validateTrigger = (state: GameState, trigger: PendingTrigger) => {
      if (
        trigger.handler !== spec.handlerId ||
        !qualifies(state, trigger.sourceId, trigger.event) ||
        trigger.controller !==
          ruleEventObservationState(state, trigger.event).objects[
            trigger.sourceId
          ].controller
      )
        throw new Error("Invalid retained environment trigger");
    };
    validators.set(spec.handlerId, validateTrigger);
    if (spec.kind === "crossfade" && !effects.destroy)
      throw Error("Crossfade runtime unavailable");
    if (
      spec.kind === "setu-simulation" &&
      (!effects.purge || !effects.canTarget)
    )
      throw Error("Setu runtime unavailable");
    if (spec.kind !== "max-gainz")
      triggers.set(
        spec.handlerId,
        spec.kind === "setu-simulation"
          ? setuSimulation(effects, validateTrigger)
          : spec.kind === "yacht-party"
            ? yachtParty(effects, validateTrigger)
            : spec.kind === "crossfade"
              ? crossfade(effects, validateTrigger)
              : {
                  ...(spec.kind === "wonderland" ||
                  spec.kind === "the-grid" ||
                  spec.kind === "black-market"
                    ? {
                        optional(state: GameState, trigger: PendingTrigger) {
                          validateTrigger(state, trigger);
                          return spec.kind === "wonderland"
                            ? "Roll for Wonderland?"
                            : spec.kind === "black-market"
                              ? "Use BLACK MARKET to INDEX 3 GEAR?"
                              : "Use THE GRID to INDEX 3 PROGRAM?";
                        },
                        optionalPlayer(
                          state: GameState,
                          trigger: PendingTrigger,
                        ) {
                          validateTrigger(state, trigger);
                          if (trigger.event.type !== "netcheck-started")
                            throw new Error("Wrong THE GRID event");
                          return trigger.event.player;
                        },
                      }
                    : {}),
                  ...(spec.kind === "boardroom"
                    ? {
                        optional(state: GameState, trigger: PendingTrigger) {
                          validateTrigger(state, trigger);
                          return boardroomPlayer(
                            state,
                            effects.characteristics(structuredClone(state)),
                          ) === null
                            ? null
                            : "Install 1 RAM running with BOARDROOM?";
                        },
                        optionalPlayer(
                          state: GameState,
                          trigger: PendingTrigger,
                        ) {
                          validateTrigger(state, trigger);
                          const player = boardroomPlayer(
                            state,
                            effects.characteristics(structuredClone(state)),
                          );
                          if (player === null)
                            throw new Error("BOARDROOM has no deciding player");
                          return player;
                        },
                      }
                    : {}),
                  resolve(state, trigger: PendingTrigger) {
                    validateTrigger(state, trigger);
                    if (spec.kind === "wonderland") {
                      if (!effects.wonderland)
                        throw Error("Wonderland runtime unavailable");
                      return effects.wonderland(state, trigger);
                    }
                    if (spec.kind === "the-hive") {
                      if (trigger.event.type !== "netcheck-started")
                        throw Error("Invalid Hive event");
                      return effects.createDrone!(
                        state,
                        trigger.event.player,
                        trigger.sourceId,
                      );
                    }
                    if (spec.kind === "death-wish") {
                      const event = trigger.event;
                      if (event.type !== "character-damaged")
                        throw Error("Invalid Death Wish event");
                      const observed = ruleEventObservationState(state, event),
                        id = event.instanceId;
                      if (
                        state.objects[id]?.incarnation !==
                          observed.objects[id]?.incarnation ||
                        ![
                          ...state.arena,
                          ...state.environment,
                          ...state.players.flatMap((p) => p.zones.ramBank),
                        ].includes(id)
                      )
                        return state;
                      return effects.destroy!(state, trigger.sourceId, id);
                    }
                    if (
                      spec.kind === "the-grid" ||
                      spec.kind === "black-market"
                    )
                      return theGrid(
                        state,
                        trigger,
                        {
                          ...effects.topCards!,
                          characteristics: effects.characteristics,
                        },
                        spec.kind === "black-market"
                          ? blackMarketIndex
                          : theGridIndex,
                      );
                    if (spec.kind === "boardroom") {
                      if (
                        trigger.optionalPlayer === undefined ||
                        trigger.optionalChoice !== true
                      )
                        throw new Error("BOARDROOM choice unavailable");
                      return boardroom(
                        state,
                        trigger.sourceId,
                        trigger.optionalPlayer,
                        effects.install!,
                      );
                    }
                    if (
                      trigger.event.type === "program-played" &&
                      spec.kind === "the-net"
                    )
                      return theNet(
                        state,
                        trigger.sourceId,
                        trigger.event.player,
                        effects.draw,
                      );
                    if (
                      trigger.event.type === "character-attacked" &&
                      spec.kind === "the-pulse"
                    )
                      return thePulse(
                        state,
                        trigger.sourceId,
                        trigger.event.defendingPlayer,
                        effects.damage,
                      );
                    if (trigger.event.type !== "netcheck-started")
                      throw new Error("Wrong environment event");
                    if (spec.kind === "zen-garden")
                      return zenGardenNetcheck(state, trigger, {
                        putCounters: effects.putCounters!,
                        destroy: effects.destroy!,
                      });
                    if (spec.kind === "acid-rain")
                      return acidRain(
                        state,
                        trigger.sourceId,
                        trigger.controller,
                        effects,
                      );
                    if (spec.kind === "the-amrita")
                      return theAmrita(
                        state,
                        trigger.sourceId,
                        trigger.event.player,
                        effects,
                      );
                    throw new Error("Unknown environment effect");
                  },
                },
      );
    if (spec.kind !== "max-gainz")
      triggerLabels.set(spec.handlerId, spec.characteristics.name);
  }
  return {
    events,
    spiritEntry(s: GameState): SpiritEntryEffects {
      const d = s.pendingDecision;
      if (d?.type !== "spirit-entry")
        throw Error("SPIRIT entry decision unavailable");
      const e = spiritEntries.get(d.trigger.handler);
      if (!e) throw Error("Spirit Realm source binding unavailable");
      e.validateTrigger(s, d.trigger);
      return e;
    },
    triggers,
    triggerLabels,
    topCards(state: GameState): TopCardsEvaluation {
      const saved = state.pendingDecision;
      if (saved?.type !== "top-cards" || !saved.trigger || !effects.topCards)
        throw new Error("Environment top-card continuation unavailable");
      validateTopCardsContinuation(state, saved);
      const spec = [...bound.values()].find(
        (spec) => spec.handlerId === saved.handler,
      );
      if (spec?.kind !== "the-grid" && spec?.kind !== "black-market")
        throw new Error("Unbound environment top-card handler");
      validators.get(saved.handler)!(state, saved.trigger);
      if (
        saved.trigger.event.type !== "netcheck-started" ||
        saved.trigger.event.player !== saved.player
      )
        throw new Error("THE GRID player mismatch");
      const index =
        spec.kind === "black-market" ? blackMarketIndex : theGridIndex;
      const current = effects.characteristics(structuredClone(state));
      if (
        saved.kind !== index.kind ||
        saved.count !== index.count ||
        !isDeepStrictEqual(
          saved.candidates,
          topCardCandidates(state, saved.player, index, current),
        )
      )
        throw new Error("THE GRID criteria mismatch");
      return {
        characteristics: current,
        complete(snapshot, decision, selected) {
          if (!isDeepStrictEqual(decision, saved))
            throw new Error("THE GRID continuation mismatch");
          return completeTopCards(snapshot, decision, selected, {
            ...effects.topCards!,
            characteristics: effects.characteristics,
          });
        },
      };
    },
    canPreventDamage(state: GameState) {
      if (
        state.engineVersion !== engine.version ||
        state.rulesVersion !== rulesVersion
      )
        throw new Error("Environment runtime version mismatch");
      const current = effects.characteristics(structuredClone(state));
      return !state.environment.some((id) => {
        const object = state.objects[id],
          spec = bound.get(object.definitionVersion),
          card = current.get(id);
        return (
          spec?.kind === "mosh-pit" &&
          !object.faceDown &&
          card?.cardType === "program" &&
          card.subtype === "environment" &&
          effects.hasAbility(structuredClone(state), id, spec.handlerId)
        );
      });
    },
    keywordGrants(
      state: GameState,
      current: ReadonlyMap<string, CardCharacteristics>,
    ) {
      if (
        state.engineVersion !== engine.version ||
        state.rulesVersion !== rulesVersion
      )
        throw new Error("Environment runtime version mismatch");
      return state.environment.flatMap((sourceId) => {
        const object = state.objects[sourceId],
          spec = bound.get(object.definitionVersion);
        if (spec?.kind !== "max-gainz" || object.faceDown) return [];
        const card = current.get(sourceId);
        if (!card)
          throw new Error("MAX GAINZ source characteristics unavailable");
        return card.cardType === "program" &&
          card.subtype === "environment" &&
          effects.hasAbility(structuredClone(state), sourceId, spec.handlerId)
          ? maxGainz(state, sourceId, current)
          : [];
      });
    },
  };
}
