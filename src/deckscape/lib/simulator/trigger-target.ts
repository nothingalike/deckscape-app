import { z } from "zod";
import { validateTriggerChoiceContinuation } from "./trigger-choice";
import { isDeepStrictEqual } from "node:util";
import type { GameState } from "./game-state";
import { recordObjectTargeting } from "./targeting-events";
import type { Seat } from "./setup";
import type { TriggerBehavior } from "./resolve-trigger";

export const triggerTargetSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("program"),
      id: z.string().min(1),
      incarnation: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    })
    .strict(),
  z
    .object({
      kind: z.literal("recycle-character"),
      id: z.string().min(1),
      incarnation: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    })
    .strict(),
  z
    .object({
      kind: z.literal("ram"),
      id: z.string().min(1),
      incarnation: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    })
    .strict(),
  z
    .object({
      kind: z.literal("character"),
      id: z.string().min(1),
      incarnation: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    })
    .strict(),
  z
    .object({
      kind: z.literal("player"),
      player: z.union([z.literal(0), z.literal(1)]),
    })
    .strict(),
]);
export type TriggerTarget = z.infer<typeof triggerTargetSchema>;
export interface TriggerTargetDecision {
  type: "trigger-target";
  id: string;
  player: Seat;
  sourceId: string;
  triggerIndex: number;
  candidates: TriggerTarget[];
}
export interface TriggerTargetEvaluation {
  characteristics?: ReadonlyMap<
    string,
    import("./characteristics").CardCharacteristics
  >;
  candidates: readonly TriggerTarget[];
}

export function validateTriggerTargetContinuation(
  state: GameState,
): TriggerTargetDecision {
  const decision = state.pendingDecision;
  if (decision?.type !== "trigger-target")
    throw new Error("Trigger target decision unavailable");
  const trigger = state.pendingTriggers[decision.triggerIndex];
  if (
    !state.triggersOrdered ||
    state.pendingRuleEvents.length ||
    !trigger ||
    trigger.sourceId !== decision.sourceId ||
    trigger.controller !== decision.player ||
    trigger.target !== undefined ||
    !decision.candidates.length
  )
    throw new Error("Invalid trigger target continuation");
  const keys = decision.candidates.map((target) =>
    target.kind === "player"
      ? `player:${target.player}`
      : `${target.kind}:${target.id}`,
  );
  if (
    new Set(keys).size !== keys.length ||
    decision.candidates.some(
      (target) =>
        target.kind !== "player" &&
        (!(
          target.kind === "recycle-character"
            ? state.players.flatMap((p) => p.zones.recycleBin)
            : target.kind === "program"
              ? [...state.arena, ...state.environment]
              : target.kind === "character"
                ? state.arena
                : [
                    ...state.arena,
                    ...state.players.flatMap((player) => player.zones.ramBank),
                  ]
        ).includes(target.id) ||
          state.objects[target.id]?.incarnation !== target.incarnation),
    )
  )
    throw new Error("Invalid trigger target candidates");
  return decision;
}

/** All choices in placement order are completed before the top trigger resolves (603.4). */
export function prepareTriggerTargets(
  state: GameState,
  behaviors: ReadonlyMap<string, TriggerBehavior>,
): GameState {
  if (
    state.outcome ||
    state.pendingDecision ||
    !state.triggersOrdered ||
    state.pendingRuleEvents.length
  )
    throw new Error("Trigger placement is not ready");
  const next = structuredClone(state);
  for (const [index, trigger] of next.pendingTriggers.entries()) {
    const behavior = behaviors.get(trigger.handler);
    if (!behavior)
      throw new Error(`Missing trigger handler: ${trigger.handler}`);
    if (behavior.placementChoices && trigger.placementChoice === undefined) {
      if (behavior.optional || behavior.optionalPlayer)
        throw Error("Invalid placement choice binding");
      const choices = behavior.placementChoices(
        structuredClone(next),
        structuredClone(trigger),
      );
      if (choices.cardCount !== undefined)
        throw Error("Placement requires a named choice");
      next.pendingDecision = {
        type: "trigger-choice",
        timing: "placement",
        id: `trigger-choice:${next.revision}:${index}:${trigger.handler}`,
        player: trigger.controller,
        sourceId: trigger.sourceId,
        triggerIndex: index,
        ...choices,
      };
      validateTriggerChoiceContinuation(next);
      return next;
    }
    if (!behavior.targets || trigger.target !== undefined) continue;
    const candidates = z
      .array(triggerTargetSchema)
      .parse(behavior.targets(structuredClone(next), structuredClone(trigger)));
    if (!candidates.length) {
      trigger.target = null;
      continue;
    }
    next.pendingDecision = {
      type: "trigger-target",
      id: `trigger-target:${next.revision}:${index}:${trigger.handler}`,
      player: trigger.controller,
      sourceId: trigger.sourceId,
      triggerIndex: index,
      candidates,
    };
    validateTriggerTargetContinuation(next);
    return next;
  }
  return next;
}

export function evaluateTriggerTarget(
  state: GameState,
  behaviors: ReadonlyMap<string, TriggerBehavior>,
): TriggerTargetEvaluation {
  const decision = validateTriggerTargetContinuation(state),
    trigger = state.pendingTriggers[decision.triggerIndex];
  const behavior = behaviors.get(trigger.handler);
  if (!behavior?.targets)
    throw new Error("Trigger target evaluator unavailable");
  return {
    candidates: z
      .array(triggerTargetSchema)
      .parse(
        behavior.targets(structuredClone(state), structuredClone(trigger)),
      ),
  };
}

export function answerTriggerTarget(
  state: GameState,
  userId: string,
  revision: number,
  decisionId: string,
  option: number,
  evaluated: TriggerTargetEvaluation,
): GameState {
  if (state.outcome || state.revision !== revision)
    throw new Error("Ended game or stale revision");
  const decision = validateTriggerTargetContinuation(state);
  if (
    decision.id !== decisionId ||
    state.players[decision.player].userId !== userId
  )
    throw new Error("Not the deciding player or decision");
  const target = decision.candidates[option];
  if (
    !Number.isSafeInteger(option) ||
    !target ||
    !evaluated.candidates.some((candidate) =>
      isDeepStrictEqual(candidate, target),
    )
  )
    throw new Error("Illegal trigger target selection");
  const next = structuredClone(state);
  next.pendingTriggers[decision.triggerIndex].target = structuredClone(target);
  next.pendingDecision = null;
  if (target.kind !== "player") {
    const trigger = next.pendingTriggers[decision.triggerIndex];
    recordObjectTargeting(next, trigger.sourceId, trigger.controller, [
      target.id,
    ]);
  }
  next.revision++;
  return next;
}
