import type { ActivatedBehavior } from "./resolve-ability";
import type { ActivatedDamageEffects } from "./activated-damage";
import { duelAbility, type DuelEffects } from "./duel";
import {
  continueAfterDamage,
  type ResolutionContinuationBehavior,
} from "./resolution-continuation";
import { validTargetIncarnations } from "./action-targets";

export interface DuelDestructionFollowup {
  amount: number;
  channel: "MF" | "BF";
}

/** Faceless Oni's conditional instruction uses actual post-duel destruction,
 * including replacements, rather than predicting a kill from marked damage. */
export function duelDestructionFollowup(
  spec: DuelDestructionFollowup,
  effects: DuelEffects & { followupDamage: ActivatedDamageEffects["damage"] },
) {
  if (
    !Number.isSafeInteger(spec.amount) ||
    spec.amount <= 0 ||
    !["MF", "BF"].includes(spec.channel)
  )
    throw new Error("Invalid duel destruction follow-up");
  const duel = duelAbility(effects);
  const behavior: ActivatedBehavior = {
    hasLegalTargets: duel.hasLegalTargets,
    resolve(state, action, resources) {
      const next = duel.resolve(state, action, resources);
      // Even prevented or zero duel damage proceeds through the explicit SBA
      // checkpoint. A missing duelist cannot cause a fresh destruction event.
      return continueAfterDamage(next);
    },
  };
  const resume: ResolutionContinuationBehavior = (state, action) => {
    const choices = action.activatedAbility.choices;
    if (
      !validTargetIncarnations(action) ||
      choices.targets.length !== 1 ||
      choices.modes.length ||
      choices.x !== null ||
      choices.playerTarget !== undefined
    )
      throw new Error("Invalid saved duel follow-up choices");
    const targetId = choices.targets[0];
    const destroyed = state.pendingRuleEvents.filter(
      (event) =>
        event.type === "persistent-destroyed" &&
        event.instanceId === targetId &&
        event.previous.incarnation === action.targetIncarnations![targetId] &&
        event.sourceId === action.sourceId,
    );
    if (destroyed.length > 1)
      throw new Error("Duplicate duel destruction observation");
    const event = destroyed[0];
    if (!event || event.type !== "persistent-destroyed") return state;
    return effects.followupDamage(
      state,
      [
        {
          sourceId: action.sourceId,
          recipient: "player",
          player: event.player,
          channel: spec.channel,
          amount: spec.amount,
        },
      ],
      action.activatedAbility.characteristics,
    );
  };
  return { behavior, resume };
}
