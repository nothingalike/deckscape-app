import { test } from "node:test";
import assert from "node:assert/strict";
import { deckExportSnapshot, deckText } from "../src/deckscape/lib/deck-export";
import { deckImageFilename, deckImageModel } from "../src/deckscape/lib/deck-image-export";
import { parseDeckText } from "../src/deckscape/lib/import-deck-text";
import type { Card, Deck } from "../src/deckscape/lib/types";

test("text export follows the shared format and retains empty sideboards", () => {
  const deck = {
    entries: [
      { card_id: "main", section: "mainframe", quantity: 1 },
      { card_id: "zen", section: "cyberdeck", quantity: 4 },
      { card_id: "admin", section: "cyberdeck", quantity: 2 },
      { card_id: "admin-alt", section: "cyberdeck", quantity: 2 },
    ],
  } as Deck;
  const cards = [
    { id: "main", name: "AETHERNET" },
    { id: "zen", name: "ZEN GARDEN" },
    { id: "admin", name: "ADMIN" },
    { id: "admin-alt", name: "ADMIN" },
  ];
  assert.equal(
    deckText(deck, cards),
    "# Mainframe\n1 AETHERNET\n\n# Cyberdeck\n4 ADMIN\n4 ZEN GARDEN\n\n# RAM\n\n# Sideboard\n\n# Sideboard Mainframe\n",
  );
});

test("text export preserves RAM, sideboard quantities, and unknown card references", () => {
  const deck = {
    entries: [
      { card_id: "ram", section: "ram", quantity: 25 },
      { card_id: "admin", section: "sideboard", quantity: 2 },
      { card_id: "side", section: "sideboard_mainframe", quantity: 1 },
    ],
  } as Deck;
  const text = deckText(deck, [
    { id: "ram", name: "RAM" },
    { id: "side", name: "SIDEWINDER" },
  ]);
  assert.match(text, /# RAM\n25 RAM/);
  assert.match(text, /# Sideboard\n2 Unknown card \(admin\)/);
  assert.match(text, /# Sideboard Mainframe\n1 SIDEWINDER/);
});

test("text export round-trips explicit empty RAM and unusual mainframe quantities", () => {
  const cards = [
    {
      id: "main",
      name: "MÉMORY PALACE",
      card_type: "mainframe",
      factions: ["HACKER"],
      image_path: null,
      copies_limit: null,
      is_basic_ram: false,
    },
    {
      id: "card",
      name: "ADMIN",
      card_type: "program",
      factions: ["HACKER"],
      image_path: null,
      copies_limit: 4,
      is_basic_ram: false,
    },
    {
      id: "ram",
      name: "Basic RAM",
      card_type: "ram",
      factions: [],
      image_path: null,
      copies_limit: null,
      is_basic_ram: true,
    },
  ] as Card[];
  const deck = {
    name: "Unicode round trip",
    description: "",
    entries: [
      { card_id: "main", section: "mainframe", quantity: 2 },
      { card_id: "card", section: "cyberdeck", quantity: 3 },
    ],
  } as Deck;
  const result = parseDeckText(deckText(deck, cards), cards);
  assert.equal(result.addedBasicRam, false);
  assert.deepEqual(result.entries, deck.entries);
});

test("promotional image data is a bounded click-time snapshot without publication claims", () => {
  const deck = {
    name: `  ${"Very long local deck ".repeat(8)}  `,
    description: "  A private   strategy.  ",
    entries: [{ card_id: "main", section: "mainframe", quantity: 1 }],
  } as Deck;
  const cards = [
    {
      id: "main",
      name: "AETHERNET",
      card_type: "mainframe",
      factions: ["HACKER"],
      image_path: "cards/aethernet.webp",
    },
    {
      id: "unused",
      name: "Unused",
      card_type: "program",
      factions: [],
      image_path: null,
    },
  ] as Card[];
  const snapshot = deckExportSnapshot(deck, cards);
  deck.name = "Changed after click";
  deck.entries[0].quantity = 9;
  cards[0].name = "Changed card";
  const model = deckImageModel(snapshot);
  assert.ok(model.title.length <= 96);
  assert.equal(model.title.at(-1), "…");
  assert.equal(model.description, "A private strategy.");
  assert.equal(model.mainframe, "AETHERNET");
  assert.equal(model.factions, "HACKER");
  assert.equal(snapshot.entries[0].quantity, 1);
  assert.equal(snapshot.cards.length, 1);
  assert.doesNotMatch(JSON.stringify(model), /published|deckscape\.run/i);
  assert.equal(
    deckImageFilename(" Déjà Vu / Test "),
    "deckscape-deja-vu-test.png",
  );
});

test("promotional image model uses a designed fallback without a mainframe", () => {
  const model = deckImageModel({
    name: "",
    description: "",
    entries: [{ card_id: "missing", section: "mainframe", quantity: 1 }],
    cards: [],
  });
  assert.equal(model.title, "Untitled deck");
  assert.equal(model.mainframe, "Constructed deck");
  assert.equal(model.description, "A private Neuroscape deck draft.");
  assert.equal(model.artworkUrl, null);
});
