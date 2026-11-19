import type { GameOutcome } from "./game-state";
import type { Seat } from "./setup";

export function outcomeLabel(outcome: GameOutcome, viewer: Seat): string {
  if (outcome.type === "abandoned")
    return `${outcome.by === viewer ? "You" : "Opponent"} abandoned the game. No winner.`;
  if (outcome.type === "draw") return "Game ended in a draw.";
  const winner = outcome.winner === viewer ? "You won" : "Opponent won";
  return outcome.reason === "concession"
    ? `${winner} by concession.`
    : `${winner}.`;
}
