import test from "node:test";
import assert from "node:assert/strict";
import { admitDeck } from "../src/deckscape/lib/simulator/deck-admission";
import {
  versionDefinition,
  type EngineManifest,
} from "../src/deckscape/lib/simulator/definition-version";
import type { Entry } from "../src/deckscape/lib/types";

const ids = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
];
const engine: EngineManifest = {
  version: "test",
  handlers: new Map(),
  implementedCards: new Set(ids),
  verifiedCards: new Set(ids),
};
const common = {
  name: "Example",
  factions: [],
  tags: [],
  iconic: false,
  rulesText: "",
  copiesLimit: null,
};
const characteristics = [
  {
    ...common,
    cardType: "mainframe",
    prefix: "",
    tiers: [
      { persistents: 1, factions: {}, operator: "base", text: "Example" },
    ],
  },
  {
    ...common,
    name: "Unlimited character",
    cardType: "character",
    ramCost: 1,
    requirements: {},
    activatedAbilities: [],
    attack: 1,
    defence: 1,
    attackType: "BF",
    ports: { head: 0, body: 0, leftArm: 0, rightArm: 0 },
  },
  { ...common, name: "Basic RAM", cardType: "ram", isBasicRam: true },
];
function definitions() {
  return new Map(
    ids.map((id, i) => {
      const result = versionDefinition(
        {
          schemaVersion: 1,
          cardId: id,
          rulesVersion: "1.00",
          engineVersion: "test",
          characteristics: characteristics[i],
          handlers: [],
          support: "verified",
        },
        engine,
      );
      return [id, { version: result.version, definition: result.definition }];
    }),
  );
}
const entries: Entry[] = [
  { card_id: ids[0], section: "mainframe", quantity: 1 },
  { card_id: ids[1], section: "cyberdeck", quantity: 50 },
  { card_id: ids[2], section: "ram", quantity: 25 },
];

test("admission expands legal pinned decks and preserves explicit unlimited copies", () => {
  const pinned = definitions();
  const deck = admitDeck(entries, pinned, engine);
  assert.equal(deck.cyberdeck.length, 50);
  assert.equal(deck.ramDeck.length, 25);
  assert.equal(deck.mainframe, pinned.get(ids[0])!.version);
});

test("illegal decks, altered snapshots and unsupported cards cannot start play", () => {
  assert.throws(
    () =>
      admitDeck(
        entries.map((e) => (e.section === "ram" ? { ...e, quantity: 24 } : e)),
        definitions(),
        engine,
      ),
    /exactly 25/,
  );
  const mismatched = definitions();
  mismatched.get(ids[1])!.version = "f".repeat(64);
  assert.throws(() => admitDeck(entries, mismatched, engine), /mismatch/);
  const unsupported = definitions();
  const original = unsupported.get(ids[1])!;
  const changed = versionDefinition(
    { ...original.definition, support: "unimplemented" },
    engine,
  );
  unsupported.set(ids[1], {
    version: changed.version,
    definition: changed.definition,
  });
  assert.throws(
    () => admitDeck(entries, unsupported, engine),
    /not ready for play/,
  );
});
