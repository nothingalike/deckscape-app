import { assertGameZones, type GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";
import type { CombatDamagePacket } from "./combat-damage";
import { rollD20 } from "./random";
import {
  captureEventObservation,
  type EventObservation,
} from "./event-observation";
import {
  changePersistentStatus,
  type StatusEvaluation,
} from "./persistent-status";

export type PsychosisCause =
  | { type: "attack" | "external-run" }
  | { type: "activation-run"; actionId: string };
export interface PsychosisRollEvent extends EventObservation {
  type: "psychosis-rolled";
  player: Seat;
  instanceId: string;
  cause: PsychosisCause["type"];
  threshold: number;
  value: number;
  failed: boolean;
}
export interface PsychosisFailure {
  instanceId: string;
  incarnation: number;
  controller: Seat;
  /** Effective source at the would-attack/run boundary, before paid status changes. */
  characteristics: CardCharacteristics;
}
export interface PsychosisEvaluation {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  /** Complete effective sum, including printed/granted instances and immunity.
   * Explicit zero means no check; no prose or counter-name inference occurs here. */
  value(state: GameState, instanceId: string): number;
  /** Retained random stream plus applicable die-roll replacements/modifiers. */
  roll(
    state: GameState,
    instanceId: string,
  ): { state: GameState; value: number };
  /** Use resolvePsychosisSelfHits with the release damage interpreter so failed
   * actions deal noncombat self-damage, with applicable replacement and prevention. */
  hitControllers(
    state: GameState,
    failures: readonly PsychosisFailure[],
  ): GameState;
}

/** CR v1.1 702.11a / 117.9, confirmed by the user-supplied P1NK clarification:
 * failed PSYCHOSIS deals combat damage to the controller and can trigger hit
 * abilities already in effect. Retain the old interpretation only for v1.0 pins.
 * Damage prevention and replacement still run through the release evaluator. */
export function resolvePsychosisSelfHits(
  state: GameState,
  failures: readonly PsychosisFailure[],
  damage: (
    state: GameState,
    packets: readonly CombatDamagePacket[],
    sources: ReadonlyMap<string, CardCharacteristics>,
  ) => GameState,
): GameState {
  const packets: CombatDamagePacket[] = [],
    sources = new Map<string, CardCharacteristics>();
  for (const failure of failures) {
    const card = failure.characteristics;
    if (
      card.cardType !== "character" ||
      !failure.instanceId ||
      sources.has(failure.instanceId) ||
      !Number.isSafeInteger(card.attack) ||
      (failure.controller !== 0 && failure.controller !== 1)
    )
      throw new Error("Invalid psychosis self-hit source");
    sources.set(failure.instanceId, structuredClone(card));
    if (card.attack > 0)
      packets.push({
        sourceId: failure.instanceId,
        recipient: "player",
        player: failure.controller,
        channel: card.attackType,
        amount: card.attack,
        ...(state.rulesVersion === "1.1" ? { combat: true as const } : {}),
      });
  }
  return packets.length
    ? damage(structuredClone(state), packets, sources)
    : structuredClone(state);
}

/** Unmodified d20 only; the release interpreter must first account for roll effects. */
export function basePsychosisRoll(state: GameState) {
  const rolled = rollD20(state.random),
    next = structuredClone(state);
  next.random = rolled.state;
  return { state: next, value: rolled.value };
}

function assertTransaction(before: GameState, after: GameState) {
  if (
    before.revision !== after.revision ||
    before.engineVersion !== after.engineVersion ||
    before.rulesVersion !== after.rulesVersion
  )
    throw new Error("Psychosis evaluator changed transaction identity");
  if (after.pendingDecision || after.resolutionContinuation)
    throw new Error("Psychosis evaluator requires a saved continuation");
  assertGameZones(after);
}

/** CR 702.11: check once per qualifying character, retain costs, cancel only the
 * failed attack/own activation, then apply the self-hit batch before normal settlement.
 * before is the would-action snapshot; state already contains the paid costs/runs.
 */
export function resolvePsychosis(
  state: GameState,
  before: GameState,
  ids: readonly string[],
  cause: PsychosisCause,
  effects: PsychosisEvaluation,
): GameState {
  return resolvePsychosisChecks(state, before, ids, cause, effects, false);
}

/** A card can explicitly require another check for attacks already in progress.
 * This does not run the characters again or emit another attack-declaration event. */
export function recheckAttackingPsychosis(
  state: GameState,
  ids: readonly string[],
  effects: PsychosisEvaluation,
): GameState {
  return resolvePsychosisChecks(
    state,
    state,
    ids,
    { type: "attack" },
    effects,
    true,
  );
}

function resolvePsychosisChecks(
  state: GameState,
  before: GameState,
  ids: readonly string[],
  cause: PsychosisCause,
  effects: PsychosisEvaluation,
  recheckingAttack: boolean,
): GameState {
  if (state.outcome || before.outcome || new Set(ids).size !== ids.length)
    throw new Error("Psychosis check unavailable");
  assertTransaction(before, state);
  const current = effects.characteristics(structuredClone(before));
  const checks = ids.map((id) => {
    const object = before.objects[id],
      card = current.get(id),
      present = state.objects[id];
    if (
      !object ||
      !before.arena.includes(id) ||
      card?.cardType !== "character" ||
      present?.incarnation !== object.incarnation ||
      !state.arena.includes(id) ||
      (object.running && !recheckingAttack) ||
      (cause.type !== "attack" && !present.running)
    )
      throw new Error("Invalid psychosis source");
    const threshold = effects.value(structuredClone(before), id);
    if (!Number.isSafeInteger(threshold))
      throw new Error("Invalid psychosis value");
    return { id, threshold, object, card };
  });
  if (
    cause.type === "attack" &&
    (!state.combat || ids.some((id) => !state.combat!.attackers.includes(id)))
  )
    throw new Error("Psychosis attacker is not declared");
  if (cause.type === "activation-run") {
    const action = state.priorityWindow?.stack.find(
      (action) => action.id === cause.actionId,
    );
    if (
      ids.length !== 1 ||
      action?.kind !== "activated" ||
      action.sourceId !== ids[0] ||
      action.controller !== before.objects[ids[0]].controller
    )
      throw new Error("Psychosis activation is not pending");
  }
  let next = structuredClone(state);
  const failures: PsychosisFailure[] = [];
  for (const check of checks) {
    if (check.threshold <= 0) continue;
    const rolled = effects.roll(structuredClone(next), check.id);
    assertTransaction(next, rolled.state);
    if (!Number.isSafeInteger(rolled.value))
      throw new Error("Invalid psychosis roll");
    next = rolled.state;
    const failed = rolled.value < check.threshold;
    next.pendingRuleEvents.push({
      type: "psychosis-rolled",
      ...captureEventObservation(next),
      player: check.object.controller,
      instanceId: check.id,
      cause: cause.type,
      threshold: check.threshold,
      value: rolled.value,
      failed,
    });
    if (failed)
      failures.push({
        instanceId: check.id,
        incarnation: check.object.incarnation,
        controller: check.object.controller,
        characteristics: structuredClone(check.card),
      });
    if (next.outcome) return next;
  }
  if (!failures.length) return next;
  const failed = new Set(failures.map((failure) => failure.instanceId));
  if (cause.type === "attack") {
    next.combat!.attackers = next.combat!.attackers.filter(
      (id) => !failed.has(id),
    );
    next.combat!.blockers = next.combat!.blockers.filter(
      (link) => !failed.has(link.attackerId),
    );
  } else if (cause.type === "activation-run") {
    next.priorityWindow!.stack = next.priorityWindow!.stack.filter(
      (action) => action.id !== cause.actionId,
    );
  }
  // Removing an activation for PSYCHOSIS is not countering; do not emit a counter event.
  const result = effects.hitControllers(
    structuredClone(next),
    structuredClone(failures),
  );
  assertTransaction(next, result);
  return result;
}

/** CR 702.11e: external effects still run characters when a check fails. Already
 * running and prohibited recipients do not attempt a run or consume a die roll. */
export function runCharactersWithPsychosis(
  state: GameState,
  sourceId: string,
  ids: readonly string[],
  effects: PsychosisEvaluation & StatusEvaluation,
): GameState {
  const current = effects.characteristics(structuredClone(state));
  if (
    new Set(ids).size !== ids.length ||
    ids.some(
      (id) =>
        !state.arena.includes(id) || current.get(id)?.cardType !== "character",
    )
  )
    throw new Error("Invalid external-run characters");
  const approved = ids.filter(
    (id) =>
      !state.objects[id].running &&
      effects.allowed(structuredClone(state), id, "run"),
  );
  const next = changePersistentStatus(
    state,
    sourceId,
    approved.map((instanceId) => ({ instanceId, operation: "run" })),
    { allowed: () => true },
  );
  return resolvePsychosis(
    next,
    state,
    approved,
    { type: "external-run" },
    effects,
  );
}
