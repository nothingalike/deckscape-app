import type { ActivatedBehavior } from "./resolve-ability";

/** Reviewed install-N-running activations share untargeted resolution. The owning
 * resource interpreter applies current prohibitions and entry replacements per install. */
export function installRamAbility(amount: number): ActivatedBehavior {
  if (!Number.isSafeInteger(amount) || amount < 1)
    throw new Error("Invalid installation count");
  return {
    hasLegalTargets(_state, action) {
      const choices = action.activatedAbility.choices;
      if (choices.targets.length || choices.modes.length || choices.x !== null)
        throw new Error("Invalid untargeted installation choices");
      return true;
    },
    resolve(state, action, effects) {
      let next = state;
      for (let i = 0; i < amount && !next.outcome; i++) {
        next = effects.install(next, action.controller, true);
        if (next.pendingDecision)
          throw new Error(
            "RAM installation requires a resumable replacement interpreter",
          );
      }
      return next;
    },
  };
}
