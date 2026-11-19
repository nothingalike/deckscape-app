import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import starters from "../src/deckscape/data/starter-decks.json";
import { createStarterRuntimeV2 } from "../src/deckscape/lib/simulator/starter-runtime-v2";
import { createDustrunnerRuntimeV1 } from "../src/deckscape/lib/simulator/dustrunner-runtime-v1";
import { assessDeckReadiness } from "../src/deckscape/lib/simulator/deck-readiness";
import { admitDeck } from "../src/deckscape/lib/simulator/deck-admission";
import type { Entry } from "../src/deckscape/lib/types";
const { admission } = createStarterRuntimeV2();
const pins = [...admission.definitions.values()];
const id = (name: string) =>
  pins.find(
    (p) =>
      p.definition.characteristics.name.toUpperCase() === name.toUpperCase(),
  )!.definition.cardId;
const deck = (index: number): Entry[] => [
  {
    card_id: id(starters.decks[index].mainframe),
    section: "mainframe",
    quantity: 1,
  },
  ...starters.decks[index].cyberdeck.map((c) => ({
    card_id: id(c.name),
    section: "cyberdeck" as const,
    quantity: c.quantity,
  })),
  { card_id: id("Basic RAM"), section: "ram", quantity: 25 },
];
test("readiness agrees with admission for all starters and a legal four-faction custom deck", () => {
  for (let i = 0; i < 4; i++)
    assert.deepEqual(assessDeckReadiness(deck(i), [], admission), {
      ready: true,
      issues: [],
    });
  const characters = pins.filter(
    (p) => p.definition.characteristics.cardType === "character",
  );
  const chosen = ["CORPO", "DUSTRUNNER", "HACKER", "CYBERNETIC"].flatMap((f) =>
    characters
      .filter((p) => p.definition.characteristics.factions.includes(f))
      .slice(0, 4),
  );
  assert.equal(chosen.length, 16);
  const entries: Entry[] = [
    ...deck(0).filter((e) => e.section !== "cyberdeck"),
    ...chosen.map((p, i) => ({
      card_id: p.definition.cardId,
      section: "cyberdeck" as const,
      quantity: i < 2 ? 4 : 3,
    })),
  ];
  assert.deepEqual(assessDeckReadiness(entries, [], admission), {
    ready: true,
    issues: [],
  });
  assert.equal(
    admitDeck(entries, admission.definitions, admission.engine).cyberdeck
      .length,
    50,
  );
});
test("readiness lists every unsupported card and simultaneous legality problems", () => {
  const unknowns = [randomUUID(), randomUUID()];
  const entries: Entry[] = [
    { card_id: unknowns[0], section: "cyberdeck", quantity: 1 },
    { card_id: unknowns[1], section: "sideboard", quantity: 1 },
  ];
  const catalog = unknowns.map((id, i) => ({
    id,
    name: `Unimplemented ${i}`,
    normalized_name: `unimplemented ${i}`,
    card_type: "character",
    copies_limit: 4,
    is_basic_ram: false,
  }));
  const result = assessDeckReadiness(entries, catalog, admission);
  assert.equal(result.ready, false);
  for (const name of [
    "Unimplemented 0",
    "Unimplemented 1",
    "mainframe",
    "50–255",
    "25",
  ])
    assert.ok(
      result.issues.some((i) => i.includes(name)),
      name,
    );
  assert.throws(() =>
    admitDeck(entries, admission.definitions, admission.engine),
  );
});
test("readiness uses room release and retained characteristics, rejecting damaged pins", () => {
  const entries = deck(
    starters.decks.findIndex((d) => d.key.endsWith("hacker")),
  );
  assert.equal(
    assessDeckReadiness(entries, [], createDustrunnerRuntimeV1().admission)
      .ready,
    false,
  );
  const pin = pins[0];
  const broken = structuredClone(admission);
  broken.definitions.set(pin.definition.cardId, {
    ...pin,
    version: "0".repeat(64),
  });
  assert.equal(
    assessDeckReadiness(
      [{ card_id: pin.definition.cardId, section: "sideboard", quantity: 1 }],
      [],
      broken,
    ).ready,
    false,
  );
  assert.equal(assessDeckReadiness(entries, [], null).ready, false);
});

test("a mismatched rules release cannot show ready", () => {
  assert.equal(
    assessDeckReadiness(deck(0), [], { ...admission, rulesVersion: "unknown" })
      .ready,
    false,
  );
});

test("readiness leaves saved deck contents unchanged", () => {
  const entries = deck(0),
    before = structuredClone(entries);
  assessDeckReadiness(entries, [], admission);
  assert.deepEqual(entries, before);
});
