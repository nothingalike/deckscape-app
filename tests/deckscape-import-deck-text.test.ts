import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseDeckText,
  type ImportCard,
  MAX_DECK_TEXT,
} from "../src/deckscape/lib/import-deck-text";
const baseline = JSON.parse(
  readFileSync(
    join(__dirname, "fixtures/catalog-baseline.json"),
    "utf8",
  ),
);
const cards: ImportCard[] = baseline.cards.map((c: any) => ({
  id: c.id,
  name: c.name,
  normalized_name: c.normalizedName,
  card_type: c.type,
  copies_limit: c.copiesLimit,
  is_basic_ram: c.type === "ram",
}));
const sample = readFileSync(
  join(__dirname, "fixtures/external-corpo-deck.txt"),
  "utf8",
);
test("provided external export resolves against the catalog with 50 cyberdeck cards and 25 optional Basic RAM", () => {
  const r = parseDeckText(sample, cards);
  assert.equal(
    r.entries
      .filter((e) => e.section === "cyberdeck")
      .reduce((n, e) => n + e.quantity, 0),
    50,
  );
  assert.equal(r.entries.filter((e) => e.section === "mainframe").length, 1);
  assert.equal(r.entries.find((e) => e.section === "ram")?.quantity, 25);
  assert.equal(r.addedBasicRam, true);
  assert.deepEqual(r.issues, []);
});
test("case, spacing and CRLF normalize without losing punctuation or sideboard sections", () => {
  const r = parseDeckText(
    sample
      .replaceAll("\r\n", "\n")
      .toLowerCase()
      .replaceAll("4 b.o.b.", "2   b.o.b.\n2 B.O.B.")
      .replace("# sideboard\n", "# sideboard\n1 BLACKOUT BOYS\n")
      .replace("# sideboard mainframe", "# sideboard mainframe\n1 COYOTE")
      .replaceAll("\n", "\r\n"),
    cards,
  );
  assert.equal(
    r.entries.find(
      (e) => e.card_id === cards.find((c) => c.name === "B.O.B.")!.id,
    )?.quantity,
    4,
  );
  assert.equal(r.entries.find((e) => e.section === "sideboard")?.quantity, 1);
  assert.equal(
    r.entries.find((e) => e.section === "sideboard_mainframe")?.quantity,
    1,
  );
});
test("RAM checkbox does not overwrite explicit or empty RAM sections", () => {
  assert.equal(
    parseDeckText(sample, cards, false).entries.some(
      (e) => e.section === "ram",
    ),
    false,
  );
  const r = parseDeckText(sample + "\n# RAM deck\n7 Basic Ram", cards);
  assert.equal(r.addedBasicRam, false);
  assert.equal(r.entries.find((e) => e.section === "ram")?.quantity, 7);
  assert.equal(parseDeckText(sample + "\n# RAM", cards).addedBasicRam, false);
});
test("unknown, ambiguous, malformed and oversized lists fail without partial imports", () => {
  for (const text of [
    sample.replace("B.O.B.", "BOB"),
    sample.replace("4 BAILOUT", "0 BAILOUT"),
    sample.replace("# Sideboard", "# Unknown"),
    sample.replace("# Sideboard", "# __proto__"),
    sample.replace("# Sideboard", "# constructor"),
    sample.replace("4 BAILOUT", "BAILOUT"),
    "4 BAILOUT",
    "x".repeat(MAX_DECK_TEXT + 1),
    "",
  ])
    assert.throws(() => parseDeckText(text, cards));
  const bob = cards.find((c) => c.name === "B.O.B.")!;
  assert.throws(
    () => parseDeckText(sample, [...cards, { ...bob, id: "duplicate" }]),
    /ambiguous/,
  );
});
test("illegal deck composition is preserved as a draft with explicit validation issues", () => {
  const r = parseDeckText(sample.replace("4 BAILOUT", "8 BAILOUT"), cards);
  assert.ok(r.issues.some((i) => i.code === "copies"));
  assert.equal(
    r.entries.find(
      (e) => e.card_id === cards.find((c) => c.name === "BAILOUT")!.id,
    )?.quantity,
    8,
  );
});
