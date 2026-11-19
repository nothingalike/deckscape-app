import { wallOfDeath } from "./wall-of-death";
import type { CounterPlacement } from "./put-counters";
import {
  firewallTriggers,
  amethystProtection,
  firewallProtection,
} from "./firewall";
import { cheshireRar } from "./cheshire-rar";
import cheshireSpec from "./cheshire-rar-specification-v3.json";
import butterflySpecifications from "./butterfly-specifications-v3.json";
import inflationSpec from "./artificial-inflation-specification-v3.json";
import { isDeepStrictEqual } from "node:util";
import { applyHealthChanges } from "./health";
import wallSpec from "./wall-of-death-specification-v5.json";
import amethystSpec from "./amethyst-datashard-specification-v5.json";
import firewallSpec from "./firewall-specification-v5.json";
import retainedProtocolSpecifications from "./protocol-specifications-v1.json";
import cycleProtocolSpecifications from "./cycle-protocol-specifications-v3.json";
import tarotProtocolSpecifications from "./tarot-protocol-specifications-v3.json";
const specifications = [
  inflationSpec,
  cheshireSpec,
  firewallSpec,
  amethystSpec,
  wallSpec,
  ...retainedProtocolSpecifications,
  ...tarotProtocolSpecifications,
  ...butterflySpecifications,
  ...cycleProtocolSpecifications,
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
import type { ProgramChoices } from "./play-program";
import type { ProgramPlayVariant } from "./program-play-option";
import {
  resolveProtocolEntry,
  validateProtocolTarget,
  hasOpenProtocolSlot,
  type ProtocolEvaluation,
} from "./protocol";
import { systemError } from "./system-error";
import { growingUnrest } from "./growing-unrest";
import {
  generationalWealth,
  type GenerationalWealthEffects,
} from "./generational-wealth";
import { insurancePolicy } from "./insurance-policy";
import { taxEvasion } from "./tax-evasion";
import type { PersistentDeparture } from "./destruction";

export interface ProtocolBindingEffects {
  putCounters?(
    s: GameState,
    source: string,
    placements: readonly CounterPlacement[],
  ): GameState;
  purge?(s: GameState, id: string): GameState;
  createButterfly?(state: GameState, player: Seat, sourceId: string): GameState;
  draw?(state: GameState, player: Seat, count: number): GameState;
  install?: GenerationalWealthEffects["install"];
  roll?: GenerationalWealthEffects["roll"];
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  hasAbility(state: GameState, sourceId: string, handler: string): boolean;
  canTarget(state: GameState, sourceId: string, mainframeId: string): boolean;
  damage(state: GameState, packets: readonly CombatDamagePacket[]): GameState;
}

/** Versioned face-up protocols with their printed mainframe targeting and event conditions. */
export function bindProtocols(
  inputs: readonly PinnedDefinition[],
  engine: EngineManifest,
  rulesVersion: string,
  effects: ProtocolBindingEffects,
) {
  const bound = new Map<string, (typeof specifications)[number]>(),
    seen = new Set<string>();
  for (const input of inputs) {
    const pin = versionDefinition(input.definition, engine),
      spec = specifications.find((s) => s.cardId === pin.definition.cardId);
    if (
      !spec ||
      pin.version !== input.version ||
      pin.definition.rulesVersion !== rulesVersion ||
      pin.definition.support === "unimplemented" ||
      seen.has(spec.cardId) ||
      !isDeepStrictEqual(
        pin.definition.characteristics,
        characteristicsSchema.parse(spec.characteristics),
      ) ||
      !isDeepStrictEqual(pin.definition.handlers, [
        { id: spec.handlerId, version: spec.handlerVersion, parameters: {} },
      ])
    )
      throw new Error("Protocol definition mismatch");
    seen.add(spec.cardId);
    bound.set(pin.version, spec);
    if (
      (spec.kind === "generational-wealth" ||
        spec.kind === "insurance-policy") &&
      !effects.install
    )
      throw new Error("Protocol installation runtime unavailable");
    if (spec.kind === "generational-wealth" && !effects.roll)
      throw new Error("GENERATIONAL WEALTH roll runtime unavailable");
    if (spec.kind === "simulated-solace" && !effects.draw)
      throw Error("Simulated Solace draw runtime unavailable");
    if (spec.kind === "butterfly-effect" && !effects.createButterfly)
      throw Error("Butterfly token runtime unavailable");
  }
  const assertPins = (state: GameState) => {
    if (
      state.engineVersion !== engine.version ||
      state.rulesVersion !== rulesVersion
    )
      throw new Error("Protocol runtime version mismatch");
  };
  const source = (state: GameState, id: string) => {
    assertPins(state);
    const spec = bound.get(state.objects[id]?.definitionVersion);
    if (!spec) throw new Error("Protocol source binding unavailable");
    return spec;
  };
  const attachment = (
    state: GameState,
    id: string,
    controller = state.objects[id]?.controller,
  ): ProtocolEvaluation => {
    const spec = source(state, id);
    const ownOnly =
      spec.kind === "firewall" ||
      spec.kind === "amethyst-datashard" ||
      spec.kind === "wall-of-death" ||
      spec.kind === "butterfly-effect" ||
      spec.kind === "generational-wealth" ||
      spec.kind === "insurance-policy" ||
      spec.kind === "darkstone-datashard" ||
      spec.kind === "moonstone-datashard" ||
      spec.kind === "tax-evasion" ||
      spec.kind === "artificial-inflation";
    return {
      characteristics: effects.characteristics(structuredClone(state)),
      permittedMainframes: new Set(
        state.players
          .flatMap((player) => player.zones.mainframe)
          .filter(
            (host) =>
              (!ownOnly ||
                state.players[controller].zones.mainframe.includes(host)) &&
              effects.canTarget(structuredClone(state), id, host) &&
              hasOpenProtocolSlot(state, host),
          ),
      ),
    };
  };
  const events = new Map<string, EventBehavior>(),
    triggers = new Map<string, TriggerBehavior>(),
    triggerLabels = new Map<string, string>();
  for (const [version, spec] of bound) {
    if (spec.kind === "wall-of-death") {
      if (!effects.putCounters || !effects.purge)
        throw Error("Wall of Death runtime unavailable");
      const b = wallOfDeath(version, {
        ...effects,
        putCounters: effects.putCounters,
        purge: effects.purge,
      });
      events.set(version, b.events);
      triggers.set(spec.handlerId, b.trigger);
      triggerLabels.set(spec.handlerId, spec.characteristics.name);
      continue;
    }
    if (spec.kind === "firewall" || spec.kind === "amethyst-datashard") {
      if (!effects.purge) throw Error("Firewall purge runtime unavailable");
      const binding = firewallTriggers(
        version,
        {
          ...effects,
          purge: effects.purge,
        },
        spec.kind === "firewall" ? firewallProtection : amethystProtection,
      );
      events.set(version, binding.events);
      triggers.set(spec.handlerId, binding.trigger);
      triggerLabels.set(
        spec.handlerId,
        `${spec.characteristics.name}: purge at two or more ${spec.kind === "firewall" ? "breach" : "fracture"} counters.`,
      );
      continue;
    }
    if (spec.kind === "cheshire-rar") {
      const binding = cheshireRar(version, spec.handlerId, effects);
      events.set(version, binding.events);
      triggers.set(spec.handlerId, binding.trigger);
      triggerLabels.set(spec.handlerId, spec.characteristics.name);
      continue;
    }
    if (spec.kind === "tax-evasion" || spec.kind === "artificial-inflation") {
      events.set(version, { onEvent: () => [] });
      continue;
    }
    const affectedPlayer = (
      state: GameState,
      sourceId: string,
      event: RuleEvent,
    ): Seat | null => {
      assertPins(state);
      if (
        spec.kind === "butterfly-effect"
          ? event.type !== "system-checked" && event.type !== "protocol-entered"
          : event.type !==
            (spec.kind === "darkstone-datashard" ||
            spec.kind === "moonstone-datashard"
              ? "program-played"
              : spec.kind === "simulated-solace"
                ? "system-checked"
                : spec.kind === "growing-unrest"
                  ? "ram-installed"
                  : spec.kind === "insurance-policy"
                    ? "persistent-destroyed"
                    : "netcheck-started")
      )
        return null;
      if (
        !("observers" in event) ||
        !event.observers ||
        !("zonesAtEvent" in event) ||
        !event.zonesAtEvent
      )
        throw new Error("Protocol trigger observation unavailable");
      const observed = ruleEventObservationState(state, event),
        object = observed.objects[sourceId];
      if (!object || object.definitionVersion !== version)
        throw new Error("Protocol source observation mismatch");
      if (!observed.arena.includes(sourceId) || object.faceDown) return null;
      const current = effects.characteristics(structuredClone(observed)),
        card = current.get(sourceId);
      if (
        card?.cardType !== "program" ||
        card.subtype !== "protocol" ||
        !effects.hasAbility(observed, sourceId, spec.handlerId)
      )
        return null;
      const links = object.attachments.filter(
        (link) => link.kind === "protocol",
      );
      if (links.length !== 1) return null;
      const host = links[0].hostId;
      if (current.get(host)?.cardType !== "mainframe") return null;
      const player = observed.players.findIndex((p) =>
        p.zones.mainframe.includes(host),
      );
      if (player < 0) return null;
      if (spec.kind === "butterfly-effect")
        return (event.type === "protocol-entered" &&
          event.instanceId === sourceId) ||
          (event.type === "system-checked" &&
            event.player === object.controller)
          ? object.controller
          : null;
      if (
        spec.kind === "darkstone-datashard" ||
        spec.kind === "moonstone-datashard"
      )
        return event.type === "program-played" &&
          event.tags.includes("TAROT") &&
          event.player === object.controller
          ? object.controller
          : null;
      if (spec.kind === "generational-wealth")
        return event.player === object.controller ? object.controller : null;
      if (spec.kind === "insurance-policy") {
        if (event.type !== "persistent-destroyed") return null;
        const destroyed = current.get(event.instanceId);
        if (!destroyed)
          throw new Error(
            "INSURANCE POLICY destruction characteristics unavailable",
          );
        return destroyed.cardType === "character" &&
          destroyed.factions.includes("CORPO") &&
          event.previous.controller === object.controller &&
          event.destroyedBy !== null &&
          event.destroyedBy !== object.controller
          ? object.controller
          : null;
      }
      return player === event.player ? event.player : null;
    };
    events.set(version, {
      onEvent(state, sourceId, event) {
        if (affectedPlayer(state, sourceId, event) === null) return [];
        return [
          {
            sourceId,
            controller: ruleEventObservationState(state, event).objects[
              sourceId
            ].controller,
            handler: spec.handlerId,
            event,
          },
        ];
      },
    });
    triggers.set(spec.handlerId, {
      resolve(state, trigger: PendingTrigger) {
        const player = affectedPlayer(state, trigger.sourceId, trigger.event);
        if (
          trigger.handler !== spec.handlerId ||
          player === null ||
          trigger.controller !==
            ruleEventObservationState(state, trigger.event).objects[
              trigger.sourceId
            ].controller
        )
          throw new Error("Invalid retained protocol trigger");
        if (spec.kind === "butterfly-effect") {
          const current = effects.characteristics(state);
          const count =
            trigger.event.type === "protocol-entered"
              ? 1
              : state.arena.filter((id) => {
                  const object = state.objects[id],
                    card = current.get(id);
                  return (
                    object.token &&
                    object.controller === player &&
                    card?.cardType === "character" &&
                    card.name === "Butterfly"
                  );
                }).length;
          let next = state;
          for (let i = 0; i < count; i++)
            next = effects.createButterfly!(next, player, trigger.sourceId);
          return next;
        }
        if (spec.kind === "simulated-solace") {
          const damaged = effects.damage(
            state,
            (["MF", "BF"] as const).map((channel) => ({
              sourceId: trigger.sourceId,
              recipient: "player",
              player,
              amount: 2,
              channel,
            })),
          );
          return damaged.outcome ? damaged : effects.draw!(damaged, player, 1);
        }
        if (spec.kind === "darkstone-datashard")
          return effects.damage(state, [
            {
              sourceId: trigger.sourceId,
              recipient: "player",
              player: player === 0 ? 1 : 0,
              amount: 1,
              channel: "MF",
            },
          ]);
        if (spec.kind === "moonstone-datashard")
          return applyHealthChanges(
            state,
            trigger.sourceId,
            (["MF", "BF"] as const).map((channel) => ({
              player,
              channel,
              amount: 1,
              operation: "gain",
              cause: "effect",
            })),
          );
        if (spec.kind === "generational-wealth")
          return generationalWealth(state, trigger.sourceId, player, {
            roll: effects.roll!,
            install: effects.install!,
          });
        if (spec.kind === "insurance-policy")
          return insurancePolicy(
            state,
            trigger.sourceId,
            player,
            effects.install!,
          );
        return spec.kind === "system-error"
          ? systemError(state, trigger.sourceId, player, effects.damage)
          : growingUnrest(state, trigger.sourceId, player, effects.damage);
      },
    });
    triggerLabels.set(spec.handlerId, spec.characteristics.name);
  }
  return {
    ramReturnsRefreshed(
      state: GameState,
      departure: PersistentDeparture,
    ): boolean {
      assertPins(state);
      if (![...bound.values()].some((spec) => spec.kind === "tax-evasion"))
        return false;
      const current = effects.characteristics(structuredClone(state));
      return state.arena.some((id) => {
        const object = state.objects[id],
          spec = bound.get(object.definitionVersion),
          card = current.get(id);
        if (
          spec?.kind !== "tax-evasion" ||
          object.faceDown ||
          card?.cardType !== "program" ||
          card.subtype !== "protocol" ||
          !effects.hasAbility(structuredClone(state), id, spec.handlerId)
        )
          return false;
        const links = object.attachments.filter(
          (link) => link.kind === "protocol",
        );
        if (
          links.length !== 1 ||
          current.get(links[0].hostId)?.cardType !== "mainframe" ||
          !state.players.some((p) =>
            p.zones.mainframe.includes(links[0].hostId),
          )
        )
          return false;
        return taxEvasion(state, object.controller, departure, current);
      });
    },
    events,
    triggers,
    triggerLabels,
    attachment,
    validate(state: GameState, id: string, choices: ProgramChoices) {
      if (
        choices.reversed ||
        choices.x !== null ||
        choices.modes.length ||
        choices.targets.length ||
        choices.playerTarget !== undefined ||
        !choices.mainframeTarget
      )
        throw new Error("Invalid protocol choices");
      validateProtocolTarget(
        state,
        id,
        choices.mainframeTarget,
        attachment(state, id),
      );
    },
    variants(state: GameState, id: string): ProgramPlayVariant[] {
      const evaluated = attachment(state, id);
      return [
        {
          key: "normal",
          label: "Attach to a mainframe",
          modes: [],
          targets: [],
          reversed: false,
          x: null,
          mainframes: [...evaluated.permittedMainframes].filter(
            (host) =>
              evaluated.characteristics.get(host)?.cardType === "mainframe",
          ),
        },
      ];
    },
    entry(state: GameState): GameState {
      const action = state.priorityWindow?.resolving;
      if (!action) throw new Error("Protocol entry unavailable");
      return resolveProtocolEntry(
        state,
        attachment(state, action.sourceId, action.controller),
      );
    },
  };
}
