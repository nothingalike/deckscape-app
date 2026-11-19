import type { Card } from "./types";
export type CardSort = "number" | "name" | "ram";
const compare = (a: string, b: string) =>
  a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
export function sortCards(cards: Card[], sort: CardSort): Card[] {
  const number = (a: Card, b: Card) =>
    compare(a.set_code, b.set_code) ||
    (a.collector_number
      ? b.collector_number
        ? compare(a.collector_number, b.collector_number)
        : -1
      : b.collector_number
        ? 1
        : 0) ||
    compare(a.name, b.name) ||
    compare(a.id, b.id);
  const cost = (card: Card) =>
    card.ram_cost.length && card.ram_cost.every((c) => /^\d+$/.test(c))
      ? card.ram_cost.reduce((n, c) => n + Number(c), 0)
      : Infinity;
  return [...cards].sort(
    (a, b) =>
      (sort === "name"
        ? compare(a.name, b.name)
        : sort === "ram"
          ? cost(a) === cost(b)
            ? 0
            : cost(a) < cost(b)
              ? -1
              : 1
          : 0) || number(a, b),
  );
}
