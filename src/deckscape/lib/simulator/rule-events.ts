import type { CacheProgramReturnedEvent } from "./the-magician";
import type { GameState } from "./game-state";
import type { RecycleRamReturnedEvent } from "./download-more-ram";
import type { RecyclePurgedEvent } from "./purge-recycle-bins";
import type { HandEvent } from "./hand-effects";
import type { DrawInstallEvent } from "./draw-install";
import type { Seat } from "./setup";
import type { PlayerDamageEvent } from "./damage";
import type { HealthChangedEvent } from "./health";
import type { CharacterEvent } from "./play-character";
import type { GearEvent } from "./play-gear";
import type { ProtocolEvent } from "./protocol";
import type { ProgramEvent } from "./play-program";
import type { ScriptEvent } from "./resolve-script";
import type { EnvironmentEvent } from "./environment";
import type { InitializeEvent } from "./initialize";
import type { InstabilityRollEvent } from "./instability";
import type {
  DestructionEvent,
  PersistentBinEvent,
  PersistentMovedEvent,
} from "./destruction";
import type { DeployEvent } from "./force-quit";
import type { CombatEvent } from "./combat";
import type { CharacterDamageEvent } from "./damage-batch";
import type { EndTurnEvent } from "./reset";
import type { ActivationEvent } from "./activate-ability";
import type { CounterEvent } from "./counter";
import type { CardDieRollEvent } from "./generational-wealth";
import type { PsychosisRollEvent } from "./psychosis";
import type { TokenCreatedEvent } from "./token-lifecycle";
import type { RamCommitmentEvent } from "./ram-balance";
import type { CounterAddedEvent } from "./put-counters";
import type { CounterRemovedEvent } from "./remove-mainframe-counters";
import type { ObjectTargetedEvent } from "./targeting-events";
import type { ControlChangedEvent } from "./control";
import { restoreEventZones } from "./event-zones";
import type { TriggerTarget } from "./trigger-target";
import type { CyberdeckBinEvent } from "./top-cards";
import {
  additionalEnvironmentTriggers,
  type TriggerCharacteristics,
} from "./timed-trigger-effects";
import {
  delayedTriggersForEvent,
  type DelayedTrigger,
} from "./delayed-triggers";

export type RuleEvent =
  | import("./setu-simulation").SetuReturnEvent
  | import("./wheel-of-fortune").WheelOfFortuneEvent
  | import("./yacht-party").YachtPartyEvent
  | CacheProgramReturnedEvent
  | {
      type: "ability-retargeted";
      sourceId: string;
      player: Seat;
      abilityName: string;
      playerTarget?: Seat;
    }
  | {
      type: "gear-attached";
      instanceId: string;
      player: Seat;
      hostId: string;
      hostIncarnation: number;
      hostController: Seat;
      observers: import("./game-state").GameObject[];
    }
  | HandEvent
  | RecycleRamReturnedEvent
  | CardDieRollEvent
  | PsychosisRollEvent
  | CyberdeckBinEvent
  | HealthChangedEvent
  | RecyclePurgedEvent
  | ControlChangedEvent
  | TokenCreatedEvent
  | RamCommitmentEvent
  | CounterAddedEvent
  | CounterRemovedEvent
  | ObjectTargetedEvent
  | DrawInstallEvent
  | PlayerDamageEvent
  | CharacterEvent
  | GearEvent
  | ProtocolEvent
  | ProgramEvent
  | ScriptEvent
  | EnvironmentEvent
  | InitializeEvent
  | InstabilityRollEvent
  | DestructionEvent
  | PersistentBinEvent
  | PersistentMovedEvent
  | DeployEvent
  | CombatEvent
  | CharacterDamageEvent
  | EndTurnEvent
  | ActivationEvent
  | CounterEvent;

export interface PendingTrigger {
  judgement?: import("./timed-trigger-effects").JudgementEffect;
  /** Source counters immediately before its captured incarnation left play. */
  departedSourceCounters?: Record<string, number>;
  departedSourceHosts?: { id: string; incarnation: number }[];
  optionalChoice?: boolean;
  placementChoice?: string;
  choice?: string;
  selectedCards?: string[];
  /** Explicit resolution-time chooser when the effect gives its choice to another player. */
  optionalPlayer?: Seat;
  delayed?: DelayedTrigger;
  sourceId: string;
  controller: Seat;
  handler: string;
  /** undefined awaits placement; null means no legal target was available. */
  target?: TriggerTarget | null;
  /** Resolved event facts captured at trigger time, retained if the source later leaves. */
  event: RuleEvent;
}
export interface EventBehavior {
  onEvent(
    state: GameState,
    sourceId: string,
    event: RuleEvent,
  ): PendingTrigger[];
}
/** Rules-defined triggers (for example keyword counters) do not belong to a printed card binding. */
export type RuleTriggerDiscovery = (
  state: GameState,
  event: RuleEvent,
) => PendingTrigger[];

function capturedObservers(event: RuleEvent) {
  return "observers" in event ? (event.observers ?? null) : null;
}

/** Reconstruct captured observer properties and zones for a trigger's event-time
 * queries (CR 617). Effects still apply to canonical current state, never this
 * observation copy. Available during both trigger discovery and later resolution.
 */
export function ruleEventObservationState(
  state: GameState,
  event: RuleEvent,
): GameState {
  const snapshot = structuredClone(state);
  const captured = capturedObservers(event);
  if (captured) {
    if ("statEffectsBefore" in event && event.statEffectsBefore)
      snapshot.statEffects = structuredClone(event.statEffectsBefore);
    for (const observer of captured)
      snapshot.objects[observer.id] = structuredClone(observer);
  }
  if ("zonesAtEvent" in event && event.zonesAtEvent)
    restoreEventZones(snapshot, event.zonesAtEvent);
  return snapshot;
}

/** No default behavior: a missing engine binding is an error, not a silently ignored card. */
export function dispatchRuleEvent(
  state: GameState,
  behaviors: ReadonlyMap<string, EventBehavior>,
  discoverRules?: RuleTriggerDiscovery,
  triggerCharacteristics?: TriggerCharacteristics,
): GameState {
  if (state.outcome) throw new Error("Game already ended");
  if (!state.triggersOrdered)
    throw new Error("Trigger placement order must be chosen first");
  if (!state.pendingRuleEvents.length)
    throw new Error("No rule event to dispatch");
  const sources = [
    ...state.arena,
    ...state.environment,
    ...state.players.flatMap((p) => [...p.zones.mainframe, ...p.zones.ramBank]),
  ];
  const triggers: PendingTrigger[] = [];
  const firedDelays = new Set<string>();
  for (const event of state.pendingRuleEvents) {
    const eventTriggers: PendingTrigger[] = [];
    if (discoverRules)
      eventTriggers.push(
        ...discoverRules(structuredClone(state), structuredClone(event)),
      );
    for (const trigger of delayedTriggersForEvent(state, event, firedDelays)) {
      firedDelays.add(trigger.delayed!.id);
      eventTriggers.push(trigger);
    }
    const captured = capturedObservers(event);
    const observers = captured ?? sources.map((id) => state.objects[id]);
    for (const source of observers) {
      const id = source.id;
      if (source.faceDown) continue;
      const behavior = behaviors.get(source.definitionVersion);
      if (!behavior)
        throw new Error(
          `Missing event behavior for ${source.definitionVersion}`,
        );
      const snapshot = ruleEventObservationState(state, event);
      eventTriggers.push(
        ...behavior.onEvent(snapshot, id, structuredClone(event)),
      );
    }
    for (const trigger of eventTriggers) {
      const original = capturedObservers(trigger.event)?.find(
        (o) => o.id === trigger.sourceId,
      );
      const departure = state.pendingRuleEvents.find(
        (e) =>
          (e.type === "persistent-destroyed" ||
            e.type === "persistent-binned" ||
            e.type === "persistent-moved") &&
          e.instanceId === trigger.sourceId &&
          e.previous.incarnation === original?.incarnation,
      );
      if (departure && "previous" in departure) {
        trigger.departedSourceCounters = structuredClone(
          departure.previous.counters,
        );
        trigger.departedSourceHosts = departure.previous.attachments
          .filter((a) => a.kind === "gear")
          .map((a) => {
            let host = departure.observers.find((o) => o.id === a.hostId);
            // An attachment can leave in the SBA pass after its host. Capture
            // the host's last incarnation, rather than its new recycle identity.
            for (
              let i = state.pendingRuleEvents.indexOf(departure) - 1;
              !host && i >= 0;
              i--
            ) {
              const prior = state.pendingRuleEvents[i];
              if (
                (prior.type === "persistent-destroyed" ||
                  prior.type === "persistent-binned" ||
                  prior.type === "persistent-moved") &&
                prior.instanceId === a.hostId
              )
                host = prior.previous;
            }
            host ??= capturedObservers(trigger.event)?.find(
              (o) => o.id === a.hostId,
            );
            if (!host)
              throw new Error("Departed gear host observation unavailable");
            return { id: a.hostId, incarnation: host.incarnation };
          });
      }
      triggers.push(
        trigger,
        ...additionalEnvironmentTriggers(
          ruleEventObservationState(state, event),
          trigger,
          triggerCharacteristics,
        ),
      );
    }
  }
  const next = structuredClone(state);
  next.delayedTriggers = next.delayedTriggers.filter(
    (delay) => !firedDelays.has(delay.id),
  );
  next.pendingRuleEvents = [];
  if (next.gameLog) next.gameLog.pendingRecorded = 0;
  next.triggerOrderStart = next.pendingTriggers.length;
  next.pendingTriggers.push(...structuredClone(triggers));
  next.triggersOrdered = triggers.length <= 1;
  return next;
}

/** CR 603.3b: active player chooses placement order, bottom to top. */
export function orderPendingTriggers(
  state: GameState,
  userId: string,
  order: number[],
): GameState {
  if (state.outcome || state.players[state.turn.activePlayer].userId !== userId)
    throw new Error("Not the ordering player");
  if (
    state.triggersOrdered ||
    state.pendingTriggers.length - state.triggerOrderStart < 2 ||
    order.length !== state.pendingTriggers.length - state.triggerOrderStart ||
    new Set(order).size !== order.length ||
    order.some(
      (index) => !Number.isInteger(index) || index < 0 || index >= order.length,
    )
  )
    throw new Error("Invalid trigger order");
  const next = structuredClone(state);
  next.pendingTriggers = [
    ...next.pendingTriggers.slice(0, state.triggerOrderStart),
    ...order.map((index) =>
      structuredClone(state.pendingTriggers[state.triggerOrderStart + index]),
    ),
  ];
  next.triggersOrdered = true;
  next.revision++;
  return next;
}

/** Reviewed Growing Unrest: its attached player's installation creates a damage trigger.
 * Damage resolution still runs through the effect/prevention interpreter.
 */
export const growingUnrestEvents: EventBehavior = {
  onEvent(state, sourceId, event) {
    if (event.type !== "ram-installed") return [];
    const source = state.objects[sourceId];
    const mainframe = state.players[event.player].zones.mainframe;
    if (
      !source.attachments.some(
        (link) => link.kind === "protocol" && mainframe.includes(link.hostId),
      )
    )
      return [];
    return [
      {
        sourceId,
        controller: source.controller,
        handler: "growing-unrest/install-damage-v1",
        event,
      },
    ];
  },
};
