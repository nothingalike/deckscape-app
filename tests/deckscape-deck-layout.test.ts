import test from "node:test";
import assert from "node:assert/strict";
import { addDestination, profileGroups } from "../src/deckscape/lib/deck-layout";
import type { Card, Entry } from "../src/deckscape/lib/types";
import {
  changeDeckCardEntries,
  getDeckCardAction,
} from "../src/deckscape/lib/deck-card-strategy";
test("placement distinguishes mainframe and sideboard slots and rejects unsupported cards", () => {
  const card = (card_type: string, copies_limit: number | null = null) => ({
    card_type,
    copies_limit,
  });
  assert.equal(addDestination(card("mainframe")), "mainframe");
  assert.equal(addDestination(card("mainframe"), true), "sideboard_mainframe");
  assert.equal(addDestination(card("ram")), "ram");
  assert.equal(addDestination(card("ram"), true), null);
  for (const type of ["character", "program", "gear"]) {
    assert.equal(addDestination(card(type)), "cyberdeck");
    assert.equal(addDestination(card(type), true), "sideboard");
  }
  assert.equal(addDestination(card("token")), null);
  assert.equal(addDestination(card("character", 0)), null);
  assert.equal(addDestination(card("unknown")), null);
});
test("profile grouping preserves quantities and section membership", () => {
  const entries: Entry[] = [
    { card_id: "p", section: "cyberdeck", quantity: 4 },
    { card_id: "c", section: "cyberdeck", quantity: 2 },
    { card_id: "p", section: "sideboard", quantity: 1 },
    { card_id: "missing", section: "cyberdeck", quantity: 1 },
  ];
  const before = JSON.stringify(entries);
  const groups = profileGroups(entries, [
    { id: "c", card_type: "character" },
    { id: "p", card_type: "program" },
  ] as Card[]);
  assert.deepEqual(
    groups.map((g) => g.label),
    ["Characters", "Programs", "Unknown cards"],
  );
  assert.equal(
    groups.flatMap((g) => g.entries).reduce((n, e) => n + e.quantity, 0),
    7,
  );
  assert.equal(JSON.stringify(entries), before);
});

test("Nanobot Swarm remains addable despite upstream zero-copy metadata", () => {
  const swarm = {
    card_type: "character",
    copies_limit: 0,
    normalized_name: "nanobot swarm",
  };
  assert.equal(addDestination(swarm), "cyberdeck");
  assert.equal(addDestination(swarm, true), "sideboard");
});

test("mainframe strategy requests confirmation and replaces only the target slot", () => {
  const card = { id: "new", card_type: "mainframe", copies_limit: 1 };
  const entries: Entry[] = [
    { card_id: "old", section: "mainframe", quantity: 1 },
    { card_id: "side", section: "sideboard_mainframe", quantity: 1 },
  ];
  const original = structuredClone(entries);
  assert.equal(getDeckCardAction(card, entries)?.requiresReplacement, true);
  assert.deepEqual(entries, original);
  const replaced = changeDeckCardEntries(entries, card, "mainframe", 1);
  assert.deepEqual(replaced, [
    entries[1],
    { card_id: "new", section: "mainframe", quantity: 1 },
  ]);
  assert.equal(getDeckCardAction(card, replaced)?.canAdd, false);
  assert.equal(getDeckCardAction(card, replaced)?.requiresReplacement, false);
  assert.equal(
    getDeckCardAction(card, replaced, true)?.requiresReplacement,
    true,
  );
  assert.deepEqual(
    changeDeckCardEntries(replaced, card, "mainframe", 1),
    replaced,
  );
});

test("RAM and general strategies preserve quantities, separate sideboard and remove at zero", () => {
  const card = { id: "program", card_type: "program", copies_limit: 3 };
  const ram = { id: "ram", card_type: "ram", copies_limit: null };
  const entries: Entry[] = [
    { card_id: card.id, section: "cyberdeck", quantity: 3 },
    { card_id: card.id, section: "sideboard", quantity: 1 },
  ];
  assert.equal(getDeckCardAction(card, entries)?.quantity, 3);
  assert.equal(getDeckCardAction(card, entries, true)?.quantity, 1);
  // Editing an invalid private draft is still allowed; validation is separate.
  const added = changeDeckCardEntries(entries, card, "cyberdeck", 1);
  assert.equal(added[0].quantity, 4);
  assert.equal(entries[0].quantity, 3);
  assert.deepEqual(changeDeckCardEntries(entries, card, "sideboard", -1), [
    entries[0],
  ]);
  assert.equal(getDeckCardAction(ram, entries, true), null);
  assert.equal(getDeckCardAction(ram, entries)?.section, "ram");
  assert.deepEqual(
    changeDeckCardEntries(entries, ram, "sideboard", 1),
    entries,
  );
  assert.equal(
    changeDeckCardEntries(entries, ram, "ram", 1).at(-1)?.quantity,
    1,
  );
  const ineligible = { ...card, card_type: "token" };
  assert.deepEqual(
    changeDeckCardEntries(entries, ineligible, "sideboard", -1),
    [entries[0]],
  );
});
