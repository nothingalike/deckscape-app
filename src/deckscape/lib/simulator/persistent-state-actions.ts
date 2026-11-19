import type { GameState } from "./game-state";
import {
  planAttachmentStateActions,
  type AttachmentStateEvaluation,
  type AttachmentStatePlan,
} from "./attachment-state-actions";
import type { PersistentDeparture } from "./destruction";
import type { SettlementRuntime } from "./settle";

/** CR 705.6a/q: zero defence bins even an indestructible character; positive defence with
 * lethal marked damage destroys only when destruction is allowed. Collect from the same
 * snapshot as illegal attachments so currently applicable departures are simultaneous.
 */
export function planPersistentStateActions(
  state: GameState,
  evaluated: AttachmentStateEvaluation,
): AttachmentStatePlan {
  const plan = planAttachmentStateActions(state, evaluated);
  for (const id of state.arena) {
    const card = evaluated.characteristics.get(id)!;
    if (card.cardType !== "character") continue;
    const object = state.objects[id];
    if (card.defence <= 0) plan.departures.push({ id, kind: "bin" });
    else if (
      object.damage.MF + object.damage.BF >= card.defence &&
      evaluated.canDestroy.has(id)
    )
      plan.departures.push({
        id,
        kind: "destroy",
        sourceId: object.lastDamageSourceId,
        ...(object.lastDamageController !== undefined
          ? { destroyedBy: object.lastDamageController }
          : {}),
        reason: "normal",
      });
  }
  return plan;
}

type StateActionResult = ReturnType<SettlementRuntime["stateBasedActions"]>;
export interface PersistentStateActionRuntime {
  evaluate(state: GameState): AttachmentStateEvaluation;
  /** Resolves host-following before further SBA checks or departure-trigger dispatch. */
  followTether(state: GameState, id: string): StateActionResult;
  /** All intents go through one movement replacement evaluation and simultaneous application.
   * A prevented batch must return changed=false unless some other state actually changed.
   */
  depart(
    state: GameState,
    departures: readonly PersistentDeparture[],
  ): StateActionResult;
}

/** One departure-related pass for the settlement loop. RAM balancing, tokens, counters,
 * and other SBAs must be composed by the owning engine runtime as well.
 */
export function performPersistentStateActions(
  state: GameState,
  runtime: PersistentStateActionRuntime,
): StateActionResult {
  if (state.outcome || state.pendingDecision)
    return {
      state: structuredClone(state),
      changed: false,
      decisionPending: !!state.pendingDecision,
    };
  const plan = planPersistentStateActions(
    state,
    runtime.evaluate(structuredClone(state)),
  );
  const follow = plan.tetherFollowers[0];
  if (follow) return runtime.followTether(structuredClone(state), follow.id);
  if (plan.departures.length)
    return runtime.depart(structuredClone(state), plan.departures);
  return {
    state: structuredClone(state),
    changed: false,
    decisionPending: false,
  };
}
