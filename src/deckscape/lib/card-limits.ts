import type { Card } from "./types";

// Printed NANOBOT SWARM text: "A cyberdeck can have any number of cards
// named [Nanobot Swarm]." Match gameplay name so alternate printings agree.
export function isNanobotSwarm(card: { normalized_name?: string }) {
  return card.normalized_name === "nanobot swarm";
}

export function deckCopyLimit(
  card: Pick<Card, "copies_limit"> & { normalized_name?: string },
) {
  return isNanobotSwarm(card) ? 4 : (card.copies_limit ?? 4);
}
