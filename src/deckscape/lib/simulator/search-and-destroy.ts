import type { CardCharacteristics } from "./characteristics";
import type { GameState } from "./game-state";
import type { AbilityChoices } from "./activate-ability";
import type { ActivatedAction, ActivatedBehavior } from "./resolve-ability";
import {
  activatedDamage,
  type ActivatedDamageEffects,
} from "./activated-damage";
import { isCurrentIncarnation } from "./object-incarnation";
import { activatedSourceInformation } from "./activated-source-information";

export interface SelfDestructionCost {
  /** CR 115.10: the interpreter reports whether the resolution-time cost was paid.
   * Replacement-cost semantics must be resolved here, never guessed from a destination. */
  pay(state: GameState, sourceId: string): { state: GameState; paid: boolean };
}

export function searchAndDestroy(
  source: CardCharacteristics,
  effects: ActivatedDamageEffects & SelfDestructionCost,
) {
  const damage = (recipient: "character" | "player", captured = source) =>
    activatedDamage(
      { recipient, minimum: 1, maximum: 1, channel: "BF", amount: 2 },
      captured,
      effects,
    );
  const selected = (choices: AbilityChoices, captured = source) =>
    damage(
      choices.playerTarget === undefined ? "character" : "player",
      captured,
    );
  const behavior: ActivatedBehavior = {
    hasLegalTargets: (state, action) =>
      selected(action.activatedAbility.choices).behavior.hasLegalTargets(
        state,
        action,
      ),
    resolve(state, action, resources) {
      if (
        !isCurrentIncarnation(state, action.activatedAbility.source) ||
        ![
          ...state.arena,
          ...state.environment,
          ...state.players.flatMap((p) => p.zones.ramBank),
        ].includes(action.sourceId)
      )
        return state;
      const payment = effects.pay(structuredClone(state), action.sourceId);
      const next = payment.state;
      if (typeof payment.paid !== "boolean")
        throw new Error("Resolution cost requires an explicit payment result");
      if (
        next.revision !== state.revision ||
        next.engineVersion !== state.engineVersion ||
        next.rulesVersion !== state.rulesVersion
      )
        throw new Error("Resolution cost changed transaction identity");
      if (next.pendingDecision)
        throw new Error("Resolution cost needs a saved continuation");
      if (!payment.paid || next.outcome) return next;
      const retained = next.priorityWindow?.resolving;
      if (retained?.id !== action.id || !retained.activatedAbility)
        throw new Error("Resolution cost changed the resolving action");
      const currentSource = activatedSourceInformation(
        next,
        retained as ActivatedAction,
        effects.characteristics(structuredClone(next)),
      );
      return selected(
        action.activatedAbility.choices,
        currentSource,
      ).behavior.resolve(next, action, resources);
    },
  };
  return {
    behavior,
    validate: (state: GameState, sourceId: string, choices: AbilityChoices) =>
      selected(choices).validate(state, sourceId, choices),
    variants: (state: GameState, sourceId: string) =>
      (["character", "player"] as const).map((recipient) => ({
        ...damage(recipient).variant(state, sourceId),
        key: recipient,
        label:
          recipient === "character" ? "Target a character" : "Target a player",
      })),
  };
}
