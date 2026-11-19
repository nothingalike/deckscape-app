import test from "node:test";
import assert from "node:assert/strict";
import manifest from "../src/deckscape/data/starter-decks.json";
import { resolveStarters } from "../src/deckscape/lib/starter-decks";
import type { Card } from "../src/deckscape/lib/types";
const names = new Map<string, string>();
for (const d of manifest.decks) {
  names.set(d.mainframe, "mainframe");
  for (const c of d.cyberdeck) names.set(c.name, "character");
  names.set(d.ram.name, "ram");
}
const cards = [...names].map(([name, type]) => ({
  id: crypto.randomUUID(),
  name,
  normalized_name: name.toLowerCase(),
  card_type: type,
  set_code: "GENESIS",
  is_basic_ram: type === "ram",
  copies_limit: type === "ram" ? null : 4,
})) as Card[];
test("four transcribed starters each resolve to 1 mainframe, 50 cyberdeck, 25 RAM", () => {
  const result = resolveStarters(manifest, cards);
  assert.equal(result.length, 4);
  for (const d of result) {
    assert.equal(
      d.entries.reduce((n, e) => n + e.quantity, 0),
      76,
    );
    assert.ok(d.description.startsWith(manifest.edition));
    assert.ok(!d.description.includes("https://"));
  }
});
test("missing or ambiguous cards fail instead of substituting", () => {
  assert.throws(() => resolveStarters(manifest, cards.slice(1)), /0 matches/);
  assert.throws(
    () =>
      resolveStarters(manifest, [
        ...cards,
        { ...cards[0], id: crypto.randomUUID() },
      ]),
    /2 matches/,
  );
});
test("wrong totals, duplicate keys, and copy-limit violations fail", () => {
  const changed = structuredClone(manifest);
  changed.decks[0].cyberdeck[0].quantity++;
  assert.throws(() => resolveStarters(changed, cards), /expected 50/);
  const duplicate = structuredClone(manifest);
  duplicate.decks[1].key = duplicate.decks[0].key;
  assert.throws(() => resolveStarters(duplicate, cards), /unique/);
  assert.throws(
    () =>
      resolveStarters(
        manifest,
        cards.map((c) => ({ ...c, copies_limit: 0 })),
      ),
    /maximum 0/,
  );
});
