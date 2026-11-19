import test from "node:test";
import assert from "node:assert/strict";
import { validateDeck } from "../src/deckscape/lib/validation";
import type { Card, Entry } from "../src/deckscape/lib/types";
const card = (
  id: string,
  type: string = "character",
  extra: Partial<Card> = {},
) =>
  ({
    id,
    name: id,
    normalized_name: id,
    card_type: type,
    copies_limit: 4,
    is_basic_ram: false,
    ...extra,
  }) as Card;
const cards = [
  card("mf", "mainframe"),
  card("ram", "ram", { is_basic_ram: true, copies_limit: null }),
  ...Array.from({ length: 70 }, (_, i) => card(`c${i}`)),
];
const valid: Entry[] = [
  { card_id: "mf", section: "mainframe", quantity: 1 },
  { card_id: "ram", section: "ram", quantity: 25 },
  ...Array.from({ length: 13 }, (_, i) => ({
    card_id: `c${i}`,
    section: "cyberdeck" as const,
    quantity: i === 12 ? 2 : 4,
  })),
];
test("valid constructed deck includes 25 basic RAM despite copy limits", () =>
  assert.deepEqual(validateDeck(valid, cards), []));
test("size boundaries 49, 50, 255, 256", () => {
  for (const size of [49, 50, 255, 256]) {
    let remaining = size;
    const entries = valid.slice(0, 2);
    for (let i = 0; remaining; i++) {
      const n = Math.min(remaining, 4);
      entries.push({ card_id: `c${i}`, section: "cyberdeck", quantity: n });
      remaining -= n;
    }
    assert.equal(
      validateDeck(entries, cards).some((i) => i.code === "cyberdeck"),
      size === 49 || size === 256,
    );
  }
});
test("copy limit combines sideboard and alternate printings", () => {
  const alternate = card("alt", "character", { normalized_name: "c0" });
  assert.ok(
    validateDeck(
      [...valid, { card_id: "alt", section: "sideboard", quantity: 1 }],
      [...cards, alternate],
    ).some((i) => i.code === "copies"),
  );
});
test("sideboard is 12 plus one mainframe", () => {
  const entries: Entry[] = [
    ...valid,
    ...[20, 21, 22].map((i) => ({
      card_id: `c${i}`,
      section: "sideboard" as const,
      quantity: 4,
    })),
    { card_id: "mf", section: "sideboard_mainframe", quantity: 1 },
  ];
  assert.deepEqual(validateDeck(entries, cards), []);
  assert.ok(
    validateDeck(
      [...entries, { card_id: "c23", section: "sideboard", quantity: 1 }],
      cards,
    ).some((i) => i.code === "sideboard"),
  );
});
test("unknown cards, wrong sections, missing mainframe, invalid quantities, and zero-copy tokens fail", () => {
  assert.ok(validateDeck([], cards).length === 3);
  assert.ok(
    validateDeck(
      [...valid, { card_id: "ram", section: "cyberdeck", quantity: 1 }],
      cards,
    ).some((i) => i.code === "section"),
  );
  assert.ok(
    validateDeck(
      [...valid, { card_id: "no", section: "cyberdeck", quantity: 1 }],
      cards,
    ).some((i) => i.code === "unknown"),
  );
  assert.ok(
    validateDeck(
      [...valid, { card_id: "c30", section: "sideboard", quantity: 1.5 }],
      cards,
    ).some((i) => i.code === "entry"),
  );
  assert.ok(
    validateDeck(
      [...valid, { card_id: "token", section: "sideboard", quantity: 1 }],
      [...cards, card("token", "character", { copies_limit: 0 })],
    ).some((i) => i.code === "copies"),
  );
});

test("Nanobot Swarm permits cyberdeck copies across printings but caps sideboard copies", () => {
  const swarm = card("swarm", "character", {
    normalized_name: "nanobot swarm",
    copies_limit: 0,
  });
  const alternate = { ...swarm, id: "swarm-alt" };
  const catalog = [...cards, swarm, alternate];
  const entries: Entry[] = [
    ...valid.slice(0, 2),
    { card_id: swarm.id, section: "cyberdeck", quantity: 20 },
    { card_id: alternate.id, section: "cyberdeck", quantity: 30 },
    { card_id: swarm.id, section: "sideboard", quantity: 4 },
  ];
  assert.deepEqual(validateDeck(entries, catalog), []);
  assert.ok(
    validateDeck(
      [
        ...entries,
        { card_id: alternate.id, section: "sideboard", quantity: 1 },
      ],
      catalog,
    ).some((i) => i.code === "copies"),
  );
  entries[2].quantity = 226;
  assert.ok(validateDeck(entries, catalog).some((i) => i.code === "cyberdeck"));
});
