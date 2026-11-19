import { z } from "zod";
import type { GameState } from "./game-state";
import type { ActivatedAction } from "./resolve-ability";

export const resolutionContinuationSchema = z
  .object({
    kind: z.literal("activated-post-damage"),
    actionId: z.string().min(1),
    handler: z.string().min(1),
  })
  .strict();
export type ResolutionContinuation = z.infer<
  typeof resolutionContinuationSchema
>;
export type ResolutionContinuationBehavior = (
  state: GameState,
  action: ActivatedAction,
) => GameState;

/** The saved cache action already owns all source/target identities and choices.
 * A continuation records the exact instruction boundary, not another activation. */
export function validateResolutionContinuation(
  state: GameState,
): ActivatedAction {
  const continuation = state.resolutionContinuation;
  const window = state.priorityWindow,
    action = window?.resolving;
  if (
    !continuation ||
    continuation.kind !== "activated-post-damage" ||
    !action ||
    action.kind !== "activated" ||
    !action.activatedAbility ||
    continuation.actionId !== action.id ||
    continuation.handler !== action.activatedAbility.handler ||
    window?.mode !== "drain"
  )
    throw new Error("Invalid saved resolution continuation");
  return action as ActivatedAction;
}

/** Called once after a finalized damage batch. Settlement checks SBAs before
 * invoking the continuation, without resolving triggered abilities mid-instruction. */
export function continueAfterDamage(state: GameState): GameState {
  if (state.outcome) return state;
  const action = state.priorityWindow?.resolving;
  if (
    state.resolutionContinuation ||
    state.pendingDecision ||
    !action?.activatedAbility ||
    action.kind !== "activated" ||
    state.priorityWindow?.resolutionApplied
  )
    throw new Error("Cannot schedule post-damage continuation");
  const next = structuredClone(state);
  next.resolutionContinuation = {
    kind: "activated-post-damage",
    actionId: action.id,
    handler: action.activatedAbility.handler,
  };
  validateResolutionContinuation(next);
  return next;
}

/** A failure leaves the original saved boundary available for retry. The caller
 * must first finish all SBA passes (including any decisions they requested). */
export function resumeResolutionContinuation(
  state: GameState,
  handlers: ReadonlyMap<string, ResolutionContinuationBehavior>,
): GameState {
  const action = validateResolutionContinuation(state);
  if (
    state.outcome ||
    state.pendingDecision ||
    !state.priorityWindow?.resolutionApplied
  )
    throw new Error("Resolution continuation is not ready");
  const behavior = handlers.get(state.resolutionContinuation!.handler);
  if (!behavior) throw new Error("Resolution continuation handler unavailable");
  const next = structuredClone(state);
  next.resolutionContinuation = null;
  const result = behavior(next, structuredClone(action));
  if (
    result.priorityWindow?.resolving?.id !== action.id ||
    !result.priorityWindow.resolutionApplied
  )
    throw new Error("Continuation changed the resolving action");
  return result;
}
