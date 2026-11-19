import type { CardPresentation, VisibleBoardCard } from "./board-view";

export interface BoardCardStatus {
  text: string;
  color: string;
}

/** At most two compact rows; inspection retains every named effect and counter. */
export function boardCardStateSummary(
  card: VisibleBoardCard,
  details: CardPresentation,
): BoardCardStatus[] {
  const rows: BoardCardStatus[] = [];
  const damage = [
    card.damage.MF ? `${card.damage.MF} MF` : "",
    card.damage.BF ? `${card.damage.BF} BF` : "",
  ].filter(Boolean);
  if (damage.length)
    rows.push({ text: `${damage.join(" · ")} damage`, color: "#743641" });
  const counters = Object.entries(card.counters).filter(
    ([, amount]) => amount !== 0,
  );
  const parts = [
    ...(counters.length === 1
      ? [`${counters[0][0]}: ${counters[0][1]}`]
      : counters.length
        ? [`${counters.length} counters`]
        : []),
    ...((details.effects?.length ?? 0)
      ? [
          `${details.effects!.length} effect${details.effects!.length === 1 ? "" : "s"}`,
        ]
      : []),
    ...(card.abilitySpent ? ["Ability spent"] : []),
  ];
  if (parts.length) rows.push({ text: parts.join(" · "), color: "#304750" });
  return rows;
}

/** Visible HUD labels derived only from authorized current state and presentation data. */
export function boardCardStatuses(
  card: VisibleBoardCard,
  details: CardPresentation,
): BoardCardStatus[] {
  const statuses: BoardCardStatus[] = [];
  for (const effect of details.effects ?? [])
    statuses.push({ text: effect.label, color: "#1d6b60" });
  if (card.damage.MF)
    statuses.push({ text: `${card.damage.MF} MF damage`, color: "#245f9e" });
  if (card.damage.BF)
    statuses.push({ text: `${card.damage.BF} BF damage`, color: "#9e303e" });
  for (const [name, amount] of Object.entries(card.counters))
    if (amount) statuses.push({ text: `${name}: ${amount}`, color: "#49396c" });
  if (card.abilitySpent)
    statuses.push({ text: "Ability spent", color: "#49396c" });
  return statuses;
}
