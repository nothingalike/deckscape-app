import test from "node:test";
import assert from "node:assert/strict";
import { createSetup, applySetupCommand } from "../src/deckscape/lib/simulator/setup";
import { initialRandomState } from "../src/deckscape/lib/simulator/random";
import { setupStateSchema } from "../src/deckscape/lib/simulator/setup-state-schema";
import { projectSetup } from "../src/deckscape/lib/simulator/setup-view";

const deck = {
  mainframe: "a".repeat(64),
  cyberdeck: Array(40).fill("b".repeat(64)),
  ramDeck: Array(20).fill("c".repeat(64)),
};
const start = () =>
  createSetup(
    ["alice", "bob"],
    [deck, deck],
    initialRandomState("12".repeat(32)),
  );

test("setup pins distinct instances and starts mulligans with selected starting player", () => {
  const state = start();
  assert.deepEqual(state, start());
  assert.equal(Object.keys(state.instances).length, 122);
  assert.equal(state.players[0].mainframeHealth, 20);
  assert.equal(state.players[1].bioframeHealth, 20);
  if (state.decision.type !== "choose-starter")
    throw new Error("Missing decision");
  assert.ok(state.openingRolls?.length);
  assert.ok(state.openingRolls.slice(0, -1).every(([a, b]) => a === b));
  const [first, second] = state.openingRolls.at(-1)!;
  assert.notEqual(first, second);
  assert.equal(state.decision.seat, first > second ? 0 : 1);
  const result = applySetupCommand(
    state,
    state.players[state.decision.seat].userId,
    0,
    { type: "choose-starter", startingPlayer: 1 },
  );
  assert.equal(result.accepted, true);
  assert.deepEqual(result.state.decision, { type: "mulligan", seat: 1 });
  assert.equal(result.state.players[0].hand.length, 5);
  assert.equal(state.players[0].hand.length, 0);
});

test("one partial mulligan preserves chosen bottom order without reshuffling", () => {
  let state = start();
  if (state.decision.type !== "choose-starter")
    throw new Error("Missing decision");
  state = applySetupCommand(
    state,
    state.players[state.decision.seat].userId,
    0,
    { type: "choose-starter", startingPlayer: 0 },
  ).state;
  const bottomOrder = [state.players[0].hand[3], state.players[0].hand[1]];
  const expectedDraw = state.players[0].cyberdeck.slice(0, 2);
  const result = applySetupCommand(state, "alice", 1, {
    type: "mulligan",
    bottomOrder,
  });
  assert.equal(result.accepted, true);
  assert.deepEqual(result.state.players[0].cyberdeck.slice(-2), bottomOrder);
  assert.deepEqual(result.state.players[0].hand.slice(-2), expectedDraw);
  assert.deepEqual(result.state.random, state.random);
  assert.equal(
    applySetupCommand(result.state, "alice", 2, {
      type: "mulligan",
      bottomOrder: [],
    }).accepted,
    false,
  );
  const kept = applySetupCommand(result.state, "bob", 2, {
    type: "mulligan",
    bottomOrder: [],
  });
  assert.deepEqual(kept.state.decision, { type: "ready" });
});

test("invalid decisions return the original state unchanged", () => {
  const state = start();
  const result = applySetupCommand(state, "outsider", 0, {
    type: "choose-starter",
    startingPlayer: 0,
  });
  assert.equal(result.accepted, false);
  assert.equal(result.state, state);
  if (state.decision.type !== "choose-starter")
    throw new Error("Missing decision");
  const opened = applySetupCommand(
    state,
    state.players[state.decision.seat].userId,
    0,
    { type: "choose-starter", startingPlayer: 0 },
  ).state;
  const id = opened.players[0].hand[0];
  for (const bottomOrder of [[id, id], [opened.players[1].hand[0]]]) {
    const rejected = applySetupCommand(opened, "alice", 1, {
      type: "mulligan",
      bottomOrder,
    });
    assert.equal(rejected.accepted, false);
    assert.equal(rejected.state, opened);
  }
});

test("a later series game's fixed chooser does not roll new dice", () => {
  const state = createSetup(
    ["alice", "bob"],
    [deck, deck],
    initialRandomState("12".repeat(32)),
    1,
  );
  assert.deepEqual(state.decision, { type: "choose-starter", seat: 1 });
  assert.equal(state.openingRolls, null);
});

test("a tied D20 contest rerolls until one player wins", () => {
  const tied = Array.from({ length: 200 }, (_, index) =>
    createSetup(
      ["alice", "bob"],
      [deck, deck],
      initialRandomState(index.toString(16).padStart(64, "0")),
    ),
  ).find((state) => (state.openingRolls?.length ?? 0) > 1);
  assert.ok(tied, "Expected a reproducible tied opening roll seed");
  assert.ok(tied.openingRolls!.slice(0, -1).every(([a, b]) => a === b));
  const [a, b] = tied.openingRolls!.at(-1)!;
  assert.notEqual(a, b);
  assert.equal(tied.decision.type, "choose-starter");
  if (tied.decision.type === "choose-starter")
    assert.equal(tied.decision.seat, a > b ? 0 : 1);
});

test("older saved setups without roll metadata remain readable", () => {
  const state = start();
  const { openingRolls: _oldMetadata, ...legacy } = state;
  const restored = setupStateSchema.parse(legacy);
  assert.equal(projectSetup(restored, "alice").openingRolls, null);
});
