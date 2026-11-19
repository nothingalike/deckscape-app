import type { PlayerGameView } from "./board-view";
import { outcomeLabel } from "./outcome-label";

export const turnStageLabels = {
  "system-check": "System check",
  refresh: "Refresh",
  "draw-install": "Draw / install",
  "force-quit": "Force quit",
  deploy: "Deploy",
  netcheck: "Netcheck",
  combat: "Combat",
  reset: "Reset",
} as const;

/** Only the active player's empty Deploy priority closes Deploy immediately. */
export function passPriorityLabel(view: PlayerGameView) {
  return view.turn.step === "deploy" &&
    view.turn.activePlayer === view.seat &&
    view.priority?.mode === "priority" &&
    !view.priority.resolving &&
    view.priority.stack.length === 0
    ? "Proceed to combat"
    : "Pass priority";
}
const combatLabels = {
  "attackers-window": "Before attackers",
  attackers: "Choose attackers",
  "blockers-window": "Before blockers",
  blockers: "Choose blockers",
  "damage-window": "Before damage",
  damage: "Assign damage",
  "damage-applied": "Damage dealt",
  end: "Combat ending",
} as const;

/** Turn ownership and the current responder are independent public facts. */
export function turnStatus(view: PlayerGameView) {
  const ownTurn = view.turn.activePlayer === view.seat;
  const stage =
    view.turn.step === "combat" && view.combat
      ? `Combat → ${combatLabels[view.combat.stage]}`
      : turnStageLabels[view.turn.step];
  const decision = (player: number, action: string) =>
    player === view.seat
      ? `Your decision: ${action}`
      : `Opponent’s decision: ${action}`;
  let instruction = "Resolving turn";
  if (view.outcome) instruction = outcomeLabel(view.outcome, view.seat);
  else if (view.pendingDecision)
    instruction = decision(
      view.pendingDecision.player,
      "resolve the current effect",
    );
  else if (view.triggerOrder)
    instruction = decision(view.triggerOrder.player, "order triggered effects");
  else if (view.priority) {
    if (
      view.priority.mode === "priority" &&
      view.priority.player !== null &&
      !view.priority.resolving
    ) {
      const response =
        view.turn.step === "combat" || view.priority.stack.length > 0;
      instruction =
        view.priority.player === view.seat
          ? response
            ? "You may respond · Priority"
            : "You may act · Priority"
          : response
            ? "Opponent may respond · Priority"
            : "Opponent may act · Priority";
    } else instruction = "Resolving actions";
  } else if (!view.cache.length) {
    if (view.turn.step === "combat" && view.combat) {
      const action = {
        attackers: "select attackers",
        blockers: "select blockers",
        damage: "assign combat damage",
      }[view.combat.stage as "attackers" | "blockers" | "damage"];
      if (action)
        instruction = decision(
          view.combat.stage === "blockers"
            ? 1 - view.turn.activePlayer
            : view.turn.activePlayer,
          action,
        );
      else instruction = "Resolving combat";
    } else if (view.turn.step === "force-quit")
      instruction = decision(view.turn.activePlayer, "force quit or continue");
    else if (view.turn.step === "draw-install")
      instruction = decision(view.turn.activePlayer, "draw or install RAM");
  }
  return {
    owner: view.outcome
      ? "Game over"
      : ownTurn
        ? "Your turn"
        : "Opponent’s turn",
    stage,
    instruction,
  };
}
