import type { PlayerGameView } from "./board-view";
import { turnStageLabels } from "./turn-status";

export type PhaseAnnouncement = {
  key: string;
  label: string;
  revision: number;
};

/** A phase cue describes only the current authoritative view, never inferred actions. */
export function phaseAnnouncement(view: PlayerGameView): PhaseAnnouncement | null {
  if (view.outcome) return null;
  let label: string = turnStageLabels[view.turn.step];
  if (view.turn.step === "combat" && view.combat) {
    const stage = view.combat.stage;
    if (stage === "attackers-window" || stage === "attackers") {
      label = "Declare Attackers";
    } else if (stage === "blockers-window" || stage === "blockers") {
      label = "Declare Blockers";
    } else if (stage === "damage-window" || stage === "damage" || stage === "damage-applied") {
      label = "Combat Damage";
    } else {
      label = "Combat";
    }
  }
  return {
    key: `${view.turn.number}:${view.turn.activePlayer}:${label}`,
    label,
    revision: view.revision,
  };
}

/** Do not turn a bulk reconciliation or tab restoration into a stale animation. */
export function shouldAnnouncePhase(
  previous: PhaseAnnouncement | null,
  next: PhaseAnnouncement | null,
  visible: boolean,
  restoring: boolean,
) {
  return !!previous && !!next && visible && !restoring &&
    previous.key !== next.key && next.revision === previous.revision + 1;
}
