import test from "node:test";
import assert from "node:assert/strict";
import { parseDeckBackup, MAX_BACKUP_BYTES } from "../src/deckscape/lib/import-backup";
const deck = {
  id: "old-id",
  revision: 99,
  published_at: "2026-09-09",
  name: "Backup",
  description: "Keep this",
  entries: [
    {
      card_id: "b5d8de27-032f-4098-aebf-f1f9f132a504",
      section: "mainframe",
      quantity: 1,
    },
  ],
};
const encode = (d: unknown = deck, version = 1) =>
  JSON.stringify({ format: "deckscape-backup", version, deck: d });
test("backup import preserves draft content and discards identity and publication metadata", () => {
  assert.deepEqual(parseDeckBackup(encode()), {
    name: deck.name,
    description: deck.description,
    entries: deck.entries,
  });
  assert.deepEqual(
    parseDeckBackup(encode({ ...deck, entries: [] })).entries,
    [],
  );
});
test("backup import rejects malformed, unsupported, oversized and invalid content", () => {
  for (const text of [
    "no",
    "null",
    encode(deck, 2),
    " ".repeat(MAX_BACKUP_BYTES + 1),
    encode({ ...deck, name: "" }),
    encode({ ...deck, entries: [{ ...deck.entries[0], quantity: -1 }] }),
    encode({ ...deck, entries: [deck.entries[0], deck.entries[0]] }),
    encode({ ...deck, entries: Array(1001).fill(deck.entries[0]) }),
  ])
    assert.throws(() => parseDeckBackup(text));
});
