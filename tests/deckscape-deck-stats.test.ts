import test from "node:test";
import assert from "node:assert/strict";
import { openingHand, mulligan, drawNext, deckStats } from "../src/deckscape/lib/deck-stats";
import type { Card, Entry } from "../src/deckscape/lib/types";
test("hand testing respects quantities, zones and one bottom-ordered mulligan", () => {
  const entries: Entry[] = [
    { card_id: "a", section: "cyberdeck", quantity: 4 },
    { card_id: "b", section: "cyberdeck", quantity: 4 },
    { card_id: "ram", section: "ram", quantity: 25 },
  ];
  const s = openingHand(entries, () => 0.5);
  assert.equal(s.hand.length, 5);
  assert.equal(s.pile.length, 3);
  assert.ok(![...s.hand, ...s.pile].includes("ram"));
  const m = mulligan(s, [4, 0]);
  assert.deepEqual(m.pile.slice(-2), [s.hand[4], s.hand[0]]);
  assert.equal(m.hand.length, 5);
  assert.throws(() => mulligan(m, [0]));
  assert.equal(drawNext(m).pile.length, 2);
  assert.throws(() => openingHand([]));
  assert.throws(() => mulligan(s, [0, 0]));
  assert.throws(() => mulligan(drawNext(s), [0]));
});
test("curve counts copies and separates zero, variable, and missing costs", () => {
  const cards = [
    { id: "a", card_type: "character", ram_cost: ["0"] },
    { id: "b", card_type: "program", ram_cost: ["X"] },
    { id: "c", card_type: "gear", ram_cost: [] },
    { id: "d", card_type: "program", ram_cost: ["2", "3"] },
  ] as Card[];
  const entries = cards.map((c) => ({
    card_id: c.id,
    section: "cyberdeck" as const,
    quantity: 2,
  }));
  const stats = deckStats(
    [...entries, { card_id: "a", section: "sideboard", quantity: 1 }],
    cards,
  );
  assert.deepEqual(Object.fromEntries(stats.costs), {
    "0": 2,
    "5": 2,
    "Variable / other": 2,
    "No printed cost": 2,
  });
  assert.equal(Object.fromEntries(stats.types).program, 4);
});
