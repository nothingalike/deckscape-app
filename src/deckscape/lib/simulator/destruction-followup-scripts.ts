import {
  destructionScript,
  type DestructionScriptEffects,
} from "./destruction-scripts";
import { applyHealthChanges } from "./health";
import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { ScriptBehavior } from "./resolve-script";

export interface DeathEffects {
  /** CR 115.10: an explicit resolution-cost result, including replacement semantics. */
  pay(
    s: GameState,
    sourceId: string,
    targetId: string,
  ): { state: GameState; paid: boolean };
  create(s: GameState, player: Seat, sourceId: string): GameState;
}
export function destructionFollowup(
  kind: "beatdown" | "death",
  effects: DestructionScriptEffects,
  death?: DeathEffects,
): ScriptBehavior {
  if (kind === "death" && !death)
    throw Error("Death resolution-cost/token runtime unavailable");
  const base = destructionScript("character", effects);
  return {
    hasLegalTargets: base.hasLegalTargets,
    resolve(s, a) {
      const target = a.programChoices.targets[0],
        card = effects.characteristics(s).get(target),
        controller = s.objects[target].controller;
      if (card?.cardType !== "character")
        throw Error("Character follow-up target unavailable");
      if (kind === "beatdown") {
        const amount = Math.max(0, card.attack),
          next = effects.destroy(s, a.sourceId, target);
        return next.outcome
          ? next
          : applyHealthChanges(
              next,
              a.sourceId,
              (["MF", "BF"] as const).map((channel) => ({
                player: a.controller,
                channel,
                amount,
                operation: "lose" as const,
                cause: "effect" as const,
              })),
            );
      }
      const payment = death!.pay(s, a.sourceId, target),
        next = payment.state;
      if (
        typeof payment.paid !== "boolean" ||
        next.revision !== s.revision ||
        next.engineVersion !== s.engineVersion ||
        next.rulesVersion !== s.rulesVersion ||
        next.pendingDecision
      )
        throw Error("Invalid Death resolution-cost result");
      return payment.paid && !next.outcome
        ? death!.create(next, controller, a.sourceId)
        : next;
    },
  };
}
