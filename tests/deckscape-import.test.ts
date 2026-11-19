import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchCatalog,
  normalizeCard,
  importDiff,
  type SourceCard,
} from "../src/deckscape/lib/catalog-import";
const a: SourceCard = {
  id: "61045c1b-73b0-46f2-8cc0-4c379c5d31e4",
  name: "Basic Ram",
  card_copies_limit: 4,
};
const b: SourceCard = {
  id: "e45525aa-735a-4c2d-a442-4b64786c3809",
  name: "Token",
  card_type: "character",
  card_copies_limit: 0,
};
test("all pages are collected and counts verified", async () =>
  assert.equal(
    (
      await fetchCatalog(async (offset) => ({
        cards: offset ? [b] : [a],
        total: 2,
        has_more: !offset,
        offset,
      }))
    ).length,
    2,
  ));
test("partial, malformed, duplicate, drifting and interrupted pages fail", async () => {
  await assert.rejects(
    fetchCatalog(async () => ({
      cards: [a],
      total: 2,
      has_more: false,
      offset: 0,
    })),
  );
  await assert.rejects(
    fetchCatalog(async () => ({
      cards: [],
      total: 1,
      has_more: true,
      offset: 0,
    })),
  );
  await assert.rejects(
    fetchCatalog(async (offset) => ({
      cards: [a],
      total: 2,
      has_more: !offset,
      offset,
    })),
  );
  await assert.rejects(
    fetchCatalog(async () => ({
      cards: [{ name: "missing id" }],
      total: 1,
      has_more: false,
      offset: 0,
    })),
  );
  await assert.rejects(
    fetchCatalog(async (offset) => {
      if (offset) throw new Error("network failed");
      return { cards: [a], total: 2, has_more: true, offset };
    }),
  );
  await assert.rejects(
    fetchCatalog(async (offset) => ({
      cards: offset ? [b] : [a],
      total: offset ? 3 : 2,
      has_more: !offset,
      offset,
    })),
  );
});
test("correction is tied to source ID and preserves zero limits", () => {
  assert.equal(normalizeCard(a, a.id).is_basic_ram, true);
  assert.equal(normalizeCard(a, a.id).copies_limit, null);
  assert.equal(normalizeCard(b, a.id).copies_limit, 0);
});
test("repeat imports are idempotent and changes/missing IDs reported", () => {
  const c = normalizeCard(a, a.id),
    d = normalizeCard(b, a.id);
  assert.deepEqual(importDiff([c], [c]), {
    total: 1,
    added: 0,
    changed: 0,
    missing: [],
  });
  assert.equal(importDiff([{ ...c, rules_text: "Updated" }], [c]).changed, 1);
  assert.equal(importDiff([{ ...c, image_hash: "new" }], [c]).changed, 1);
  assert.equal(importDiff([c], [c, d]).missing[0].id, d.id);
});
test("Postgres JSONB key ordering does not count as a card change", () => {
  const c = normalizeCard(a, a.id);
  const reordered = {
    ...c,
    raw: Object.fromEntries(Object.entries(c.raw).reverse()),
  };
  assert.equal(importDiff([c], [reordered]).changed, 0);
});
