import { assertGameZones, type GameState } from "./game-state";
import type { CacheAction } from "./priority";
import type { ActivatedAbilitySnapshot } from "./activate-ability";
import type { ScriptEffects } from "./resolve-script";

export type ActivatedAction = CacheAction & {
  activatedAbility: ActivatedAbilitySnapshot;
};
export interface ActivatedBehavior {
  hasLegalTargets(state: GameState, action: ActivatedAction): boolean;
  resolve(
    state: GameState,
    action: ActivatedAction,
    effects: ScriptEffects,
  ): GameState;
}

/** CR 602.7/606: the source need not remain in play or retain its ability. The saved
 * handler/choices/source snapshot belong to the cache action, not the current source.
 */
export function resolveActivatedAbility(
  state: GameState,
  behaviors: ReadonlyMap<string, ActivatedBehavior>,
  effects: ScriptEffects,
): GameState {
  const action = state.priorityWindow?.resolving;
  if (
    state.outcome ||
    !action ||
    action.kind !== "activated" ||
    !action.activatedAbility ||
    state.pendingRuleEvents.length ||
    state.pendingTriggers.length
  )
    throw new Error("No activated ability resolution ready");
  const behavior = behaviors.get(action.activatedAbility.handler);
  if (!behavior) throw new Error("Missing activated ability handler");
  const captured: ActivatedAction = {
    ...structuredClone(action),
    activatedAbility: structuredClone(action.activatedAbility),
  };
  let next = structuredClone(state);
  if (
    behavior.hasLegalTargets(structuredClone(next), structuredClone(captured))
  )
    next = behavior.resolve(next, captured, effects);
  assertGameZones(next);
  return next;
}

/** Reviewed Nova, the White Rabbit — LUCIDITY: Draw 1. */
export const novaLucidity: ActivatedBehavior = {
  hasLegalTargets(_state, action) {
    const choices = action.activatedAbility.choices;
    if (choices.targets.length || choices.modes.length || choices.x !== null)
      throw new Error("Invalid Lucidity choices");
    return true;
  },
  resolve: (state, action, effects) =>
    effects.draw(state, action.controller, 1),
};
