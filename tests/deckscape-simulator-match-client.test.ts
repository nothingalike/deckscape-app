import test from "node:test";
import assert from "node:assert/strict";
import { createSetup } from "../src/deckscape/lib/simulator/setup";
import { initialRandomState } from "../src/deckscape/lib/simulator/random";
import { gameFromSetup } from "../src/deckscape/lib/simulator/game-state";
import { projectGame } from "../src/deckscape/lib/simulator/game-view";
import {
  MatchClientSession,
  type BattlefieldSnapshot,
  type CommandDelivery,
} from "../src/deckscape/lib/simulator/match-client-session";

function snapshot(revision = 0): BattlefieldSnapshot {
  const deck = {
    mainframe: "a".repeat(64),
    cyberdeck: Array(50).fill("b".repeat(64)),
    ramDeck: Array(25).fill("c".repeat(64)),
  };
  const setup = createSetup(
    ["a", "b"],
    [deck, deck],
    initialRandomState("12".repeat(32)),
  );
  setup.decision = { type: "ready" };
  setup.startingPlayer = 0;
  const state = gameFromSetup(setup, "test", "1.00");
  state.revision = revision;
  return {
    view: projectGame(state, "a", { canInspectFaceDown: () => false }),
    presentations: {},
    decision: null,
    turnPrompt: null,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("a delayed pre-command poll is replaced immediately after an acknowledged revision", async () => {
  const delayed = deferred<BattlefieldSnapshot>();
  let reads = 0;
  const client = new MatchClientSession(
    snapshot(),
    {
      read: async () => (++reads === 1 ? delayed.promise : snapshot(1)),
      send: async () => ({ status: "accepted", acceptedRevision: 1 }),
    },
    () => "id",
  );
  const polling = client.refresh();
  const submitting = client.submit({
    expectedRevision: 0,
    action: { type: "pass" },
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  delayed.resolve(snapshot(0));
  await Promise.all([polling, submitting]);
  assert.equal(reads, 2);
  assert.equal(client.getSnapshot().phase, "ready");
  assert.equal(client.getSnapshot().snapshot.view.revision, 1);
  client.close();
});

test("unchanged reads do not notify subscribers, but connection changes do", async () => {
  let fail = false;
  const client = new MatchClientSession(snapshot(), {
    read: async () => {
      if (fail) throw new Error("offline");
      return snapshot();
    },
    send: async () => ({ status: "rejected", message: "unused" }),
  }, () => "id");
  let updates = 0;
  client.subscribe(() => updates++);
  await client.refresh();
  await client.refresh();
  assert.equal(updates, 0);
  fail = true;
  await client.refresh();
  assert.equal(updates, 1);
  fail = false;
  await client.refresh();
  assert.equal(updates, 2);
  client.close();
});

test("a newer notification during an existing read triggers one follow-up read", async () => {
  const delayed = deferred<BattlefieldSnapshot>();
  let reads = 0;
  const client = new MatchClientSession(snapshot(), {
    read: async () => (++reads === 1 ? delayed.promise : snapshot(2)),
    send: async () => ({ status: "rejected", message: "unused" }),
  }, () => "id");
  const first = client.refresh();
  const notified = client.notifyRevision(2);
  delayed.resolve(snapshot(1));
  await Promise.all([first, notified]);
  assert.equal(reads, 2);
  assert.equal(client.getSnapshot().snapshot.view.revision, 2);
  client.close();
});

test("overlapping submissions share no second command and caller mutations cannot alter the pending request", async () => {
  const accepted = deferred<CommandDelivery>();
  const sent: unknown[] = [];
  const client = new MatchClientSession(
    snapshot(),
    {
      read: async () => snapshot(1),
      send: async (id, command) => {
        sent.push({ id, command });
        return accepted.promise;
      },
    },
    () => "fixed-id",
  );
  const command = { expectedRevision: 0, action: { type: "pass" as const } };
  const first = client.submit(command);
  command.expectedRevision = 99;
  assert.equal(
    (await client.submit({ expectedRevision: 0, action: { type: "concede" } }))
      .ok,
    false,
  );
  accepted.resolve({ status: "accepted", acceptedRevision: 1 });
  await first;
  assert.deepEqual(sent, [
    {
      id: "fixed-id",
      command: { expectedRevision: 0, action: { type: "pass" } },
    },
  ]);
  client.close();
});

test("rejections unlock a fresh form after reload, while failed reads preserve the saved board", async () => {
  let fail = false;
  const client = new MatchClientSession(
    snapshot(),
    {
      read: async () => {
        if (fail) throw new Error("offline");
        return snapshot();
      },
      send: async () => ({
        status: "rejected",
        message: "The choice is unavailable.",
      }),
    },
    () => "id",
  );
  assert.deepEqual(
    await client.submit({ expectedRevision: 0, action: { type: "pass" } }),
    { ok: false, message: "The choice is unavailable." },
  );
  assert.equal(client.getSnapshot().formEpoch, 1);
  assert.equal(client.getSnapshot().phase, "ready");
  fail = true;
  await client.refresh();
  assert.equal(client.getSnapshot().phase, "reconnecting");
  assert.equal(client.getSnapshot().snapshot.view.outcome, null);
  assert.equal(client.getSnapshot().snapshot.view.revision, 0);
  fail = false;
  await client.reconnect();
  assert.equal(client.getSnapshot().phase, "ready");
  client.close();
});

test("foreign version pins and responses arriving after close never replace the board", async () => {
  const delayed = deferred<BattlefieldSnapshot>();
  let calls = 0;
  const foreign = snapshot(1);
  foreign.view.engineVersion = "another-engine";
  const client = new MatchClientSession(
    snapshot(),
    {
      read: async () => (++calls === 1 ? foreign : delayed.promise),
      send: async () => ({ status: "rejected", message: "unused" }),
    },
    () => "id",
  );
  await client.refresh();
  assert.equal(client.getSnapshot().snapshot.view.engineVersion, "test");
  const pendingRead = client.refresh();
  client.close();
  delayed.resolve(snapshot(2));
  assert.equal(await pendingRead, false);
  assert.equal(client.getSnapshot().snapshot.view.revision, 0);
  assert.equal(client.getSnapshot().phase, "closed");
});
