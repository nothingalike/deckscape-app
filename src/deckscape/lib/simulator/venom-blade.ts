import type { CardCharacteristics } from "./characteristics";
import type { GameState } from "./game-state";
import type { ActivatedAction, ActivatedBehavior } from "./resolve-ability";
import {
  activatedDamage,
  type ActivatedDamageEffects,
} from "./activated-damage";
import { activatedSourceInformation } from "./activated-source-information";

export function venomBlade(
  source: CardCharacteristics,
  effects: ActivatedDamageEffects,
) {
  const targeted: ActivatedDamageEffects = {
    ...effects,
    canTarget: (state, sourceId, id, captured) =>
      state.objects[id]?.running === true &&
      effects.canTarget(state, sourceId, id, captured),
  };
  const base = {
    recipient: "character" as const,
    minimum: 1,
    maximum: 1,
    channel: "MF" as const,
    amount: 0,
  };
  const choices = activatedDamage(base, source, targeted);
  const evaluated = (state: GameState, action: ActivatedAction) => {
    const current = activatedSourceInformation(
      state,
      action,
      effects.characteristics(structuredClone(state)),
    );
    // CR 107.2b/107.3: negative results and an undefined attack produce zero damage.
    const amount =
      current.cardType === "character" ? Math.max(0, current.attack) : 0;
    return activatedDamage({ ...base, amount }, current, targeted).behavior;
  };
  const behavior: ActivatedBehavior = {
    hasLegalTargets: (state, action) =>
      evaluated(state, action).hasLegalTargets(state, action),
    resolve: (state, action, resources) =>
      evaluated(state, action).resolve(state, action, resources),
  };
  return { ...choices, behavior };
}
