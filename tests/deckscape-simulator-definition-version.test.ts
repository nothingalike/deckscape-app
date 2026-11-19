import test from "node:test";
import assert from "node:assert/strict";
import {
  planDefinitionVersions,
  versionDefinition,
  type EngineManifest,
} from "../src/deckscape/lib/simulator/definition-version";

const cardId = "ecc9914d-7879-46ff-9015-0c58a75cb31b";
const engine: EngineManifest = {
  version: "test-engine",
  handlers: new Map([["run-target", new Set([1])]]),
  implementedCards: new Set([cardId]),
  verifiedCards: new Set([cardId]),
};
const input = {
  schemaVersion: 1,
  cardId,
  rulesVersion: "1.00",
  engineVersion: engine.version,
  characteristics: {
    cardType: "character",
    name: "ACPD DRONES",
    factions: ["CORPO"],
    tags: [],
    iconic: false,
    rulesText: "Run target character.",
    copiesLimit: 4,
    ramCost: 3,
    requirements: {},
    activatedAbilities: [{ name: "DETAIN", ramCost: 1, run: true }],
    attack: 3,
    defence: 2,
    attackType: "BF",
    ports: { head: 0, body: 0, leftArm: 0, rightArm: 0 },
  },
  handlers: [
    { id: "run-target", version: 1, parameters: { choices: ["a", "b"] } },
  ],
  support: "verified",
};

test("definition hashes ignore object order but retain effect order and gameplay changes", () => {
  const original = versionDefinition(input, engine);
  assert.equal(
    versionDefinition(
      {
        ...input,
        characteristics: { ...input.characteristics, attack: 3, ramCost: 3 },
      },
      engine,
    ).version,
    original.version,
  );
  assert.notEqual(
    versionDefinition(
      {
        ...input,
        characteristics: { ...input.characteristics, attack: 4, ramCost: 3 },
      },
      engine,
    ).version,
    original.version,
  );
  assert.notEqual(
    versionDefinition(
      {
        ...input,
        handlers: [
          { ...input.handlers[0], parameters: { choices: ["b", "a"] } },
        ],
      },
      engine,
    ).version,
    original.version,
  );
});

test("publication preserves pinned versions and repeated imports add nothing", () => {
  const original = versionDefinition(input, engine);
  const existing = new Map([[original.version, original.serialized]]);
  assert.equal(
    planDefinitionVersions([input], engine, existing).additions.size,
    0,
  );
  const changed = planDefinitionVersions(
    [{ ...input, characteristics: { ...input.characteristics, attack: 4 } }],
    engine,
    existing,
  );
  assert.equal(changed.additions.size, 1);
  assert.equal(existing.get(original.version), original.serialized);
  assert.throws(
    () => planDefinitionVersions([input, input], engine, existing),
    /Duplicate/,
  );
  assert.throws(
    () =>
      planDefinitionVersions(
        [input],
        engine,
        new Map([[original.version, "changed"]]),
      ),
    /conflicts/,
  );
});

test("support claims require matching engine, handler versions and full-card coverage", () => {
  assert.throws(
    () => versionDefinition({ ...input, engineVersion: "other" }, engine),
    /different engine/,
  );
  assert.throws(
    () =>
      versionDefinition(
        {
          ...input,
          handlers: [{ id: "run-target", version: 2, parameters: {} }],
        },
        engine,
      ),
    /Unknown handler/,
  );
  assert.throws(
    () => versionDefinition(input, { ...engine, implementedCards: new Set() }),
    /complete implementation/,
  );
  assert.throws(
    () => versionDefinition(input, { ...engine, verifiedCards: new Set() }),
    /verified integration/,
  );
  assert.equal(
    versionDefinition(
      { ...input, support: "unimplemented", handlers: [] },
      { ...engine, implementedCards: new Set(), verifiedCards: new Set() },
    ).definition.support,
    "unimplemented",
  );
});
