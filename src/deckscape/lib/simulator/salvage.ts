import { assertGameZones, type GameState } from "./game-state";
import type { Seat } from "./setup";
import type { AbilityChoices } from "./activate-ability";
import type { ActivatedBehavior } from "./resolve-ability";
import type { CharacterTargetEvaluation } from "./character-status-effects";
import { isCurrentActionTarget } from "./action-targets";
import { advanceObjectIncarnation } from "./object-incarnation";

export interface SalvageEffects extends CharacterTargetEvaluation {
  /** Apply movement replacements/prohibitions before the base transition. */
  moveToHand(state: GameState, player: Seat, id: string): GameState;
}
function target(choices: AbilityChoices): string {
  if (
    choices.targets.length !== 1 ||
    choices.modes.length ||
    choices.x !== null ||
    choices.playerTarget !== undefined
  )
    throw new Error("Invalid Salvage choices");
  return choices.targets[0];
}
export function salvageTargets(
  state: GameState,
  player: Seat,
  sourceId: string,
  evaluated: CharacterTargetEvaluation,
): string[] {
  const current = evaluated.characteristics(structuredClone(state));
  return state.players[player].zones.recycleBin.filter((id) => {
    const card = current.get(id);
    if (!card) throw new Error("Salvage target characteristics unavailable");
    return (
      !state.objects[id].token &&
      card.cardType === "gear" &&
      evaluated.canTarget(structuredClone(state), sourceId, id)
    );
  });
}
export function validateSalvageChoices(
  state: GameState,
  player: Seat,
  sourceId: string,
  choices: AbilityChoices,
  evaluated: CharacterTargetEvaluation,
): void {
  if (
    !salvageTargets(state, player, sourceId, evaluated).includes(
      target(choices),
    )
  )
    throw new Error("Illegal Salvage target");
}
/** DUMPSTER DIVER: the recycle bin and hand belong to the captured activation controller. */
export function dumpsterSalvage(effects: SalvageEffects): ActivatedBehavior {
  const behavior: ActivatedBehavior = {
    hasLegalTargets(state, action) {
      const id = target(action.activatedAbility.choices);
      return (
        isCurrentActionTarget(state, action, id) &&
        salvageTargets(
          state,
          action.controller,
          action.sourceId,
          effects,
        ).includes(id)
      );
    },
    resolve(state, action) {
      if (!behavior.hasLegalTargets(state, action)) return state;
      return effects.moveToHand(
        state,
        action.controller,
        target(action.activatedAbility.choices),
      );
    },
  };
  return behavior;
}

/** An already evaluated return from the recycle bin is neither a draw nor a departure from play. */
export function moveRecycledCardToHand(
  state: GameState,
  player: Seat,
  id: string,
): GameState {
  if (
    state.outcome ||
    !state.players[player].zones.recycleBin.includes(id) ||
    state.objects[id]?.owner !== player ||
    state.objects[id].token
  )
    throw new Error("Recycled card is unavailable");
  const next = structuredClone(state);
  next.players[player].zones.recycleBin = next.players[
    player
  ].zones.recycleBin.filter((value) => value !== id);
  next.players[player].zones.hand.push(id);
  advanceObjectIncarnation(next, id);
  assertGameZones(next);
  return next;
}
