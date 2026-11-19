import { abilityChoicesSchema, type AbilityChoices } from "./ability-choices";
import { recordObjectTargeting } from "./targeting-events";
export { abilityChoicesSchema, type AbilityChoices } from "./ability-choices";
import { captureTargetIncarnations } from "./action-targets";
import { assertGameZones, type GameObject, type GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import { addPriorityAction, canAct } from "./priority";
import { availablePaymentRam, payRam } from "./ram";
import type { Seat } from "./setup";
import { resolvePsychosis, type PsychosisEvaluation } from "./psychosis";

export interface ActivatedAbilitySnapshot {
  destroyedCharacterAttacks?: { id: string; attack: number }[];
  abilityId: string;
  handler: string;
  choices: AbilityChoices;
  source: GameObject;
  characteristics: CardCharacteristics;
  /** Effective values immediately before the original source left play. */
  departedSourceCharacteristics?: CardCharacteristics;
}
export interface ActivationEvaluation {
  /** Required by releases containing PSYCHOSIS; evaluated only for a character run cost. */
  psychosis?: PsychosisEvaluation;
  definitions: ReadonlyMap<string, CardCharacteristics>;
  sourceCharacteristics: CardCharacteristics;
  abilityId: string;
  handler: string;
  allowed: boolean;
  ramCost: number;
  run: boolean;
  revealSource: boolean;
  additionalCostText?: string;
  /** Validate against the pre-payment state, then pay on the private transaction
   * after RAM runs. No priority or state-based cleanup occurs between costs. */
  additionalCost?: {
    capture?(
      s: GameState,
      c: AbilityChoices,
      paid: GameState,
    ): { id: string; attack: number }[];
    validate(state: GameState, choices: AbilityChoices): void;
    pay(state: GameState, choices: AbilityChoices): GameState;
  };
  validateChoices(state: GameState, choices: AbilityChoices): void;
}
export interface ActivationEvent {
  type: "ability-activated";
  player: Seat;
  instanceId: string;
}

export const activationReasons = {
  source: "Ability source is unavailable",
  window: "Activation unavailable in this priority window",
  prohibited: "Activation unavailable",
  additionalCost: "Additional activation cost handler required",
  ram: "Not enough available RAM for this activation",
} as const;
export type ActivationProblem = keyof typeof activationReasons;

export function activationSourceAvailable(
  state: GameState,
  player: Seat,
  id: string,
): boolean {
  const source = state.objects[id];
  return (
    !!source &&
    source.controller === player &&
    !source.running &&
    !source.abilitySpent &&
    [
      ...state.arena,
      ...state.environment,
      ...state.players.flatMap((p) => [
        ...p.zones.mainframe,
        ...p.zones.ramBank,
      ]),
    ].includes(id)
  );
}

export function activationWindowAvailable(
  state: GameState,
  player: Seat,
): boolean {
  return (
    !state.outcome &&
    !state.pendingDecision &&
    state.triggersOrdered &&
    !state.pendingRuleEvents.length &&
    !state.pendingTriggers.length &&
    !!state.priorityWindow &&
    canAct(state.priorityWindow, player)
  );
}

export function availableActivationRam(
  state: GameState,
  player: Seat,
  id: string,
  evaluated: ActivationEvaluation,
): string[] {
  return availablePaymentRam(state, player, evaluated.definitions).filter(
    (ramId) => !evaluated.run || ramId !== id,
  );
}

/** Shared announcement preflight for previews and commands. Interpreter-supplied
 * costs and permissions remain authoritative; additional costs need explicit handlers.
 */
export function activationProblem(
  state: GameState,
  player: Seat,
  id: string,
  abilityId: string,
  evaluated: ActivationEvaluation,
): ActivationProblem | null {
  if (
    !activationSourceAvailable(state, player, id) ||
    evaluated.sourceCharacteristics.cardType === "gear"
  )
    return "source";
  if (!activationWindowAvailable(state, player)) return "window";
  if (
    !evaluated.allowed ||
    evaluated.abilityId !== abilityId ||
    !evaluated.handler
  )
    return "prohibited";
  if (!Number.isSafeInteger(evaluated.ramCost) || evaluated.ramCost < 0)
    throw new Error("Invalid evaluated activation cost");
  if (evaluated.additionalCostText && !evaluated.additionalCost)
    return "additionalCost";
  if (
    availableActivationRam(state, player, id, evaluated).length <
    evaluated.ramCost
  )
    return "ram";
  return null;
}

/** CR 602: every activation requires a refreshed, unspent source, even without a run cost.
 * Gear-granted abilities are evaluated against their host character, never the gear itself.
 */
export function activateAbility(
  state: GameState,
  userId: string,
  revision: number,
  id: string,
  abilityId: string,
  ram: string[],
  input: unknown,
  evaluated: ActivationEvaluation,
): GameState {
  if (state.outcome || state.revision !== revision)
    throw new Error("Ended game or stale revision");
  const player = state.players.findIndex((p) => p.userId === userId);
  if (player !== 0 && player !== 1) throw new Error("Not a match participant");
  const problem = activationProblem(state, player, id, abilityId, evaluated);
  if (problem) throw new Error(activationReasons[problem]);
  if (evaluated.run && ram.includes(id))
    throw new Error("Source cannot pay both run and RAM costs");
  const choices = abilityChoicesSchema.parse(input);
  if (
    choices.cacheActionId !== undefined &&
    evaluated.handler !== "trojan/redirect" &&
    evaluated.handler !== "trojan/rubber-ducky" &&
    evaluated.handler !== "serial-killer/rewrite-v1"
  )
    throw Error("Unexpected cache action target");
  if (choices.sacrificeRam !== undefined && !evaluated.additionalCost)
    throw new Error("Unexpected additional cost selection");
  if (choices.sacrificeCharacters !== undefined && !evaluated.additionalCost)
    throw Error("Unexpected character destruction cost");
  evaluated.validateChoices(structuredClone(state), structuredClone(choices));
  evaluated.additionalCost?.validate(
    structuredClone(state),
    structuredClone(choices),
  );
  let destroyedCharacterAttacks: ActivatedAbilitySnapshot["destroyedCharacterAttacks"];
  let next = payRam(
    state,
    player,
    evaluated.ramCost,
    ram,
    evaluated.definitions,
    undefined,
    evaluated.run ? [id] : [],
  );
  next.objects[id].abilitySpent = true;
  if (evaluated.revealSource) next.objects[id].faceDown = false;
  const capturedSource = structuredClone(next.objects[id]);
  if (evaluated.additionalCost) {
    next = evaluated.additionalCost.pay(next, structuredClone(choices));
    destroyedCharacterAttacks = evaluated.additionalCost.capture?.(
      state,
      choices,
      next,
    );
    if (
      next.revision !== state.revision ||
      next.engineVersion !== state.engineVersion ||
      next.rulesVersion !== state.rulesVersion ||
      next.pendingDecision ||
      next.outcome
    )
      throw new Error(
        "Additional cost changed transaction identity or requires a decision",
      );
  }
  next.priorityWindow = addPriorityAction(state.priorityWindow!, {
    id: `activate:${revision}:${id}`,
    kind: "activated",
    controller: player,
    sourceId: id,
    targetIncarnations: captureTargetIncarnations(state, choices.targets),
    activatedAbility: {
      ...(destroyedCharacterAttacks ? { destroyedCharacterAttacks } : {}),
      abilityId,
      handler: evaluated.handler,
      choices,
      source: capturedSource,
      characteristics: structuredClone(evaluated.sourceCharacteristics),
    },
  });
  next.pendingRuleEvents.push({
    type: "ability-activated",
    player,
    instanceId: id,
  });
  recordObjectTargeting(next, id, player, choices.targets);
  if (
    evaluated.run &&
    evaluated.sourceCharacteristics.cardType === "character" &&
    evaluated.psychosis
  )
    next = resolvePsychosis(
      next,
      state,
      [id],
      { type: "activation-run", actionId: `activate:${revision}:${id}` },
      evaluated.psychosis,
    );
  next.revision++;
  assertGameZones(next);
  return next;
}
