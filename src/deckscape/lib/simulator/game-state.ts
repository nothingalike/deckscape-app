import type { RamCostChoiceDecision } from "./ram-cost-choice";
import type { TriggerChoiceDecision } from "./trigger-choice";
import type { RetargetChoiceDecision } from "./retarget-choice";
import type { ShredDecision } from "./metal-head";
import type { SavedGameLog } from "./game-log";
import type { RandomState } from "./random";
import type { Seat, SetupState } from "./setup";
import type { PortRegion } from "./ports";
import type { PriorityState } from "./priority";
import type { PendingTrigger, RuleEvent } from "./rule-events";
import type { CombatState } from "./combat";
import type { CounterPaymentDecision } from "./conditional-counter";
import type { TetherFollowDecision } from "./tether-follow";
import type { RamBalanceDecision } from "./ram-balance";
import type { TimedStatEffect } from "./timed-stat-effects";
import type { TimedCombatEffect } from "./timed-combat-effects";
import type { ResolutionContinuation } from "./resolution-continuation";
import type { DelayedTrigger } from "./delayed-triggers";
import type { DeckSearchDecision, PublicCardReveal } from "./deck-search";
import type { ProgramReplayPermission } from "./program-replay";
import type { TriggerTargetDecision } from "./trigger-target";
import type { OptionalTriggerDecision } from "./optional-trigger";
import type { TopCardsDecision } from "./top-cards";
import type { ProgramPlayRecord } from "./program-history";
import type { CardPlayRecord } from "./card-play-history";
import type { TimedTriggerEffect } from "./timed-trigger-effects";
import type { TimedDamagePrevention } from "./timed-damage-prevention";
import type { FactionChoiceDecision } from "./faction-choice";
import type { HandChoiceDecision } from "./hand-choice";

export interface GameObject {
  id: string;
  incarnation: number;
  /** Server-private layer ordering; a mainframe keeps its timestamp as synergy changes. */
  timestamp: number;
  token: boolean;
  scriptCopy?: true;
  tokenCopyOverrides?: import("./token-copy-schema").TokenCopyOverrides;
  definitionVersion: string;
  owner: Seat;
  controller: Seat;
  running: boolean;
  abilitySpent: boolean;
  faceDown: boolean;
  /** Retained only while this Trojan remains in the cache or in play. */
  trojanPlayedTurn?: number;
  /** Resolved RAM cost setting for this incarnation; cleared on zone changes. */
  setRamCost?: number;
  copiedAbility?: import("./copied-abilities").CopiedAbility;
  damage: { MF: number; BF: number };
  lastDamageSourceId: string | null;
  /** Captured when damage is marked; a departed source may have a different current controller. */
  lastDamageController?: Seat | null;
  /** Damage history survives removal of marked damage, but not a new object incarnation. */
  lastDamagedTurn: number | null;
  counters: Record<string, number>;
  /** Multiple links support tether gear; RAM commitment is a distinct attachment kind. */
  attachments: {
    hostId: string;
    kind: "gear" | "protocol" | "ram";
    port?: PortRegion;
  }[];
}
export interface GamePlayer {
  userId: string;
  mainframeHealth: number;
  bioframeHealth: number;
  zones: {
    mainframe: string[];
    cyberdeck: string[];
    hand: string[];
    ramDeck: string[];
    ramBank: string[];
    recycleBin: string[];
    purge: string[];
  };
}
export type GameOutcome =
  | {
      type: "win";
      winner: Seat;
      reason: "concession" | "health" | "card-effect";
    }
  | { type: "draw"; reason: "simultaneous-loss" | "mandatory-loop" }
  | { type: "abandoned"; by: Seat };
export interface GameState {
  freeCardPlays?: import("./free-card-plays").FreeCardPlay[];
  schemaVersion: 1;
  revision: number;
  engineVersion: string;
  rulesVersion: string;
  random: RandomState;
  objects: Record<string, GameObject>;
  nextTokenNumber: number;
  /** Next value in the shared object/effect chronology; also supplies generated effect IDs. */
  nextEffectNumber: number;
  statEffects: TimedStatEffect[];
  combatEffects: TimedCombatEffect[];
  triggerEffects: TimedTriggerEffect[];
  /** Resolved once-per-turn effects, retained across reconnects. */
  effectUses?: {
    sourceId: string;
    incarnation: number;
    handler: string;
    turn: number;
  }[];
  damagePreventions: TimedDamagePrevention[];
  destructionProtections?: import("./destruction-protection").DestructionProtection[];
  psychosisImmunities?: import("./psychosis-immunity").PsychosisImmunity[];
  timedControl?: import("./timed-control").TimedControl[];
  /** Underlying control retained while attachment or temporary control effects exist. */
  attachmentControl?: {
    hostId: string;
    incarnation: number;
    controller: Seat;
  }[];
  resolutionContinuation: ResolutionContinuation | null;
  delayedTriggers: DelayedTrigger[];
  reveals: PublicCardReveal[];
  programReplayPermissions: ProgramReplayPermission[];
  programHistory: ProgramPlayRecord[] | null;
  cardPlayHistory?: CardPlayRecord[] | null;
  players: [GamePlayer, GamePlayer];
  arena: string[];
  environment: string[];
  cache: string[];
  priorityWindow: PriorityState | null;
  gameLog?: SavedGameLog;
  pendingRuleEvents: RuleEvent[];
  pendingTriggers: PendingTrigger[];
  triggersOrdered: boolean;
  triggerOrderStart: number;
  drawInstallRemaining: number;
  combat: CombatState | null;
  extraTurns: Seat[];
  pendingDecision:
    | import("./eclipse-contract").EclipseDecision
    | import("./enhance-contract").EnhanceDecision
    | import("./tower-contract").TowerDecision
    | import("./ducky-contract").DuckyDecision
    | import("./wonderland").WonderlandDecision
    | import("./counter-replacement-continuation").DamagePreventionDecision
    | import("./bailout").BailoutDecision
    | import("./spirit-entry-choice").SpiritEntryDecision
    | import("./script-kiddie").CopyAbilityDecision
    | import("./counter-replacement-continuation").CounterReplacementDecision
    | import("./redirect-ability").RedirectDecision
    | CounterPaymentDecision
    | TetherFollowDecision
    | RamBalanceDecision
    | DeckSearchDecision
    | TopCardsDecision
    | TriggerTargetDecision
    | OptionalTriggerDecision
    | TriggerChoiceDecision
    | RamCostChoiceDecision
    | FactionChoiceDecision
    | RetargetChoiceDecision
    | ShredDecision
    | HandChoiceDecision
    | null;
  turn: {
    number: number;
    activePlayer: Seat;
    systemCheckComplete: boolean;
    forceQuitComplete: boolean;
    resetComplete: boolean;
    nextRegularPlayer: Seat;
    step:
      | "system-check"
      | "refresh"
      | "draw-install"
      | "force-quit"
      | "deploy"
      | "netcheck"
      | "combat"
      | "reset";
  };
  outcome: GameOutcome | null;
}

/** Transfers a completed setup without reshuffling, changing identities, or skipping system check. */
export function gameFromSetup(
  setup: SetupState,
  engineVersion: string,
  rulesVersion: string,
): GameState {
  if (setup.decision.type !== "ready" || setup.startingPlayer === null)
    throw new Error("Setup is incomplete");
  if (!engineVersion || !rulesVersion) throw new Error("Version pins required");
  const players = setup.players.map((player) => ({
    userId: player.userId,
    mainframeHealth: player.mainframeHealth,
    bioframeHealth: player.bioframeHealth,
    zones: {
      mainframe: [player.mainframe],
      cyberdeck: [...player.cyberdeck],
      hand: [...player.hand],
      ramDeck: [...player.ramDeck],
      ramBank: [],
      recycleBin: [],
      purge: [],
    },
  }));
  const game: GameState = {
    schemaVersion: 1,
    revision: setup.revision,
    engineVersion,
    rulesVersion,
    random: { ...setup.random },
    nextTokenNumber: 0,
    nextEffectNumber: Object.keys(setup.instances).length,
    statEffects: [],
    combatEffects: [],
    triggerEffects: [],
    damagePreventions: [],
    destructionProtections: [],
    psychosisImmunities: [],
    resolutionContinuation: null,
    delayedTriggers: [],
    reveals: [],
    programReplayPermissions: [],
    programHistory: [],
    cardPlayHistory: [],
    objects: Object.fromEntries(
      Object.entries(setup.instances).map(([id, instance], timestamp) => [
        id,
        {
          id,
          token: false,
          incarnation: 0,
          timestamp,
          ...instance,
          controller: instance.owner,
          running: false,
          abilitySpent: false,
          faceDown: false,
          damage: { MF: 0, BF: 0 },
          lastDamageSourceId: null,
          lastDamagedTurn: null,
          counters: {},
          attachments: [],
        },
      ]),
    ),
    players: [players[0], players[1]],
    arena: [],
    environment: [],
    cache: [],
    priorityWindow: null,
    pendingRuleEvents: [],
    pendingTriggers: [],
    triggersOrdered: true,
    triggerOrderStart: 0,
    drawInstallRemaining: 0,
    combat: null,
    extraTurns: [],
    pendingDecision: null,
    turn: {
      number: 1,
      activePlayer: setup.startingPlayer,
      systemCheckComplete: false,
      forceQuitComplete: false,
      resetComplete: false,
      nextRegularPlayer: (1 - setup.startingPlayer) as Seat,
      step: "system-check",
    },
    outcome: null,
  };
  assertGameZones(game);
  return game;
}

/** Canonical identity invariant: every object occupies exactly one zone. */
export function assertGameZones(state: GameState): void {
  const seen = new Set<string>();
  const zones = [
    ...state.players.flatMap((p) => Object.values(p.zones)),
    state.arena,
    state.environment,
    state.cache,
  ];
  for (const zone of zones)
    for (const id of zone) {
      if (!state.objects[id] || state.objects[id].id !== id)
        throw new Error(`Unknown zone object: ${id}`);
      if (seen.has(id))
        throw new Error(`Object occupies multiple zones: ${id}`);
      seen.add(id);
    }
  for (const object of Object.values(state.objects)) {
    if (
      object.lastDamagedTurn !== null &&
      (!Number.isSafeInteger(object.lastDamagedTurn) ||
        object.lastDamagedTurn < 1 ||
        object.lastDamagedTurn > state.turn.number)
    )
      throw new Error(`Invalid damage history: ${object.id}`);
    if (!Number.isSafeInteger(object.incarnation) || object.incarnation < 0)
      throw new Error(`Invalid object incarnation: ${object.id}`);
    if (
      !Number.isSafeInteger(object.timestamp) ||
      object.timestamp < 0 ||
      object.timestamp >= state.nextEffectNumber
    )
      throw new Error(`Invalid object timestamp: ${object.id}`);
    if (!seen.has(object.id))
      throw new Error(`Object has no zone: ${object.id}`);
    for (const link of object.attachments)
      if (link.hostId === object.id || !state.objects[link.hostId])
        throw new Error(`Invalid attachment host: ${link.hostId}`);
  }
}

/** Concession is immediate and is never blocked by priority (CR 104.3d). */
export function concedeGame(state: GameState, userId: string): GameState {
  if (state.outcome) throw new Error("Game already ended");
  const seat = state.players.findIndex((player) => player.userId === userId);
  if (seat !== 0 && seat !== 1) throw new Error("Not a match participant");
  return {
    ...structuredClone(state),
    revision: state.revision + 1,
    outcome: { type: "win", winner: (1 - seat) as Seat, reason: "concession" },
  };
}

/** Product rule for untimed casual matches: a participant may end play without a winner. */
export function abandonGame(state: GameState, userId: string): GameState {
  if (state.outcome) throw new Error("Game already ended");
  const seat = state.players.findIndex((player) => player.userId === userId);
  if (seat !== 0 && seat !== 1) throw new Error("Not a match participant");
  return {
    ...structuredClone(state),
    revision: state.revision + 1,
    outcome: { type: "abandoned", by: seat },
  };
}
