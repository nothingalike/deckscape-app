import {
  boardZones,
  presentationFor,
  type CardPresentation,
  type PlayerGameView,
} from "./board-view";

/** Describe only participant-visible facts. Zone numbers match the battlefield's
 * accessible lists, so otherwise identical RAM and hosts can be distinguished. */
export function cardChoiceLabel(
  view: PlayerGameView,
  presentations: Readonly<Record<string, CardPresentation>>,
  id: string,
): string {
  const cards = boardZones(view).flatMap((zone) => zone.cards);
  const card = cards.find((item) => item.instanceId === id);
  if (!card) return "Unavailable card";
  const name = presentationFor(card, presentations).name;
  const side = (seat: 0 | 1) => (seat === view.seat ? "Your" : "Opponent’s");
  const commitment = card.attachments.find((link) => link.kind === "ram");
  for (const player of view.players) {
    const index = player.ramBank.findIndex((item) => item.instanceId === id);
    if (index < 0 || commitment) continue;
    const control =
      card.controller === player.seat
        ? ""
        : ` — controlled by ${card.controller === view.seat ? "you" : "opponent"}`;
    return `${side(player.seat)} RAM bank #${index + 1}: ${name} — ${card.running ? "Running" : "Refreshed"}${control}`;
  }
  if (!commitment) return name;
  const host = cards.find((item) => item.instanceId === commitment.hostId);
  const cached =
    host && view.cache.some((item) => item.instanceId === host.instanceId);
  const hostCards = cached
    ? view.cache
    : host
      ? view.arena.filter((item) => item.controller === host.controller)
      : [];
  const hostLabel = host
    ? `${side(host.controller).toLowerCase()} ${presentationFor(host, presentations).name} (${cached ? "cache" : "arena"} #${hostCards.findIndex((item) => item.instanceId === host.instanceId) + 1})`
    : "unavailable character";
  const committed = cards.filter((item) =>
    item.attachments.some(
      (link) => link.kind === "ram" && link.hostId === commitment.hostId,
    ),
  );
  const index = committed.findIndex((item) => item.instanceId === id);
  return `${side(card.controller)} ${name} — Committed to ${hostLabel} — RAM #${index + 1}`;
}
