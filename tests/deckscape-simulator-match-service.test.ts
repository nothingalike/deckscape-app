import test from "node:test";
import assert from "node:assert/strict";
import { createSetup } from "../src/deckscape/lib/simulator/setup";
import { initialRandomState } from "../src/deckscape/lib/simulator/random";
import { gameFromSetup, type GameState } from "../src/deckscape/lib/simulator/game-state";
import {
  readMatchView,
  readMatchBattlefield,
  readMatchParticipantIds,
  submitMatchCommand,
  type MatchStore,
  type StoredMatch,
  type CommandReceipt,
  type MatchRuntimeResolver,
} from "../src/deckscape/lib/simulator/match-service";
import type { GameCommandRuntime } from "../src/deckscape/lib/simulator/commands";
import { decodeGameState } from "../src/deckscape/lib/simulator/state-schema";
import { createRuntimeRegistry } from "../src/deckscape/lib/simulator/runtime-registry";
import { characteristicsSchema } from "../src/deckscape/lib/simulator/characteristics";
import type { BattlefieldPresentationRuntime } from "../src/deckscape/lib/simulator/battlefield-presentation";
import { MatchClientSession } from "../src/deckscape/lib/simulator/match-client-session";
import { battlefieldSnapshotSchema } from "../src/deckscape/lib/simulator/battlefield-response";
import { auditSimulatorRecovery } from "../src/deckscape/lib/simulator/recovery-audit";

function fixture() {
  const p0 = "00000000-0000-4000-8000-000000000001",
    p1 = "00000000-0000-4000-8000-000000000002";
  const mid = "00000000-0000-4000-8000-000000000003",
    cid = "00000000-0000-4000-8000-000000000004";
  const deck = {
    mainframe: "a".repeat(64),
    cyberdeck: Array(50).fill("b".repeat(64)),
    ramDeck: Array(25).fill("c".repeat(64)),
  };
  const setup = createSetup(
    [p0, p1],
    [deck, deck],
    initialRandomState("12".repeat(32)),
  );
  setup.decision = { type: "ready" };
  setup.startingPlayer = 0;
  const state = gameFromSetup(setup, "test", "1.00");
  let stored: StoredMatch = {
    id: mid,
    player0: p0,
    player1: p1,
    engineVersion: "test",
    rulesVersion: "1.00",
    revision: 0,
    state,
  };
  const receipts = new Map<string, CommandReceipt>();
  const counts = { commits: 0, executions: 0, receipts: 0 };
  const unavailable = () => {
    throw new Error("Unbound test operation");
  };
  const commands: GameCommandRuntime = {
    settle: (snapshot) => snapshot,
    drawRestrictions: unavailable,
    forceQuit: unavailable,
    combat: unavailable,
    damage: unavailable,
    character: unavailable,
    gear: unavailable,
    program: unavailable,
  };
  const resolve: MatchRuntimeResolver = (engine, rules) => {
    assert.equal(engine, "test");
    assert.equal(rules, "1.00");
    return {
      decodeState: decodeGameState,
      get commands() {
        counts.executions++;
        return commands;
      },
      visibility: { canInspectFaceDown: () => false },
    };
  };
  const store: MatchStore = {
    load: async (id) => (id === mid ? structuredClone(stored) : null),
    receipt: async (_matchId, commandId) => {
      counts.receipts++;
      return receipts.get(commandId) ?? null;
    },
    commit: async (_matchId, commandId, actorId, command, next) => {
      counts.commits++;
      if (command.expectedRevision !== stored.revision)
        throw new Error("Stale match revision");
      stored = {
        ...stored,
        revision: next.revision,
        state: structuredClone(next),
      };
      receipts.set(commandId, {
        actorId,
        expectedRevision: command.expectedRevision,
        revision: next.revision,
        command: structuredClone(command),
      });
      return { applied: true, acceptedRevision: next.revision };
    },
  };
  return { p0, p1, mid, cid, state, store, resolve, counts };
}

test("authenticated battlefield reads join effective details to one redacted revision", async () => {
  const { state, p0, mid, store, resolve } = fixture();
  const ownHand = state.players[0].zones.cyberdeck.shift()!;
  const opponentHand = state.players[1].zones.cyberdeck.shift()!;
  const faceDown = state.players[1].zones.cyberdeck.shift()!;
  state.players[0].zones.hand.push(ownHand);
  state.players[1].zones.hand.push(opponentHand);
  state.arena.push(faceDown);
  state.objects[faceDown].faceDown = true;
  state.objects[faceDown].definitionVersion = "d".repeat(64);
  const before = structuredClone(state);
  const printed = characteristicsSchema.parse({
    name: "Current name",
    rulesText: "Current text",
    factions: [],
    tags: [],
    iconic: false,
    copiesLimit: 4,
    cardType: "character",
    ramCost: 1,
    requirements: {},
    activatedAbilities: [],
    attack: 7,
    defence: -2,
    attackType: "MF",
    ports: { head: 0, body: 0, leftArm: 0, rightArm: 0 },
  });
  const artworkRequests: string[] = [];
  const mainframe = characteristicsSchema.parse({
    name: "Fixture mainframe",
    rulesText: "",
    factions: [],
    tags: [],
    iconic: false,
    copiesLimit: 1,
    cardType: "mainframe",
    prefix: "",
    tiers: [{ persistents: 0, factions: {}, operator: "base", text: "Base" }],
  });
  let evaluations = 0;
  const ram = characteristicsSchema.parse({
    name: "Basic RAM",
    rulesText: "",
    factions: [],
    tags: [],
    iconic: false,
    copiesLimit: null,
    cardType: "ram",
    isBasicRam: true,
  });
  const battlefield: BattlefieldPresentationRuntime = {
    characteristics(snapshot) {
      evaluations++;
      snapshot.players[0].mainframeHealth = 1;
      return new Map(
        Object.keys(snapshot.objects).map((id) => [
          id,
          {
            ...(snapshot.players.some((player) =>
              player.zones.mainframe.includes(id),
            )
              ? mainframe
              : printed),
            name:
              id === opponentHand
                ? "SECRET OPPONENT HAND"
                : id === faceDown
                  ? "SECRET FACE DOWN"
                  : printed.name,
            internalSecret: "PRIVATE HANDLER DATA",
          },
        ]),
      );
    },
    artworkUrl(version) {
      artworkRequests.push(version);
      return `https://example.com/pinned/${version}.webp`;
    },
  };
  const baseRuntime = resolve("test", "1.00");
  const runtime = {
    ...baseRuntime,
    battlefield,
    commands: {
      ...baseRuntime.commands,
      character: () => ({
        allowed: true,
        swift: false,
        ramCost: 1,
        synergy: {},
        definitions: new Map([
          ["b".repeat(64), printed],
          ["c".repeat(64), ram],
        ]),
      }),
    },
  };
  const registry = createRuntimeRegistry([
    {
      engineVersion: "test",
      rulesVersion: "1.00",
      availableForNewMatches: false,
      runtime,
    },
  ]);
  await assert.rejects(
    readMatchBattlefield(store, registry.resolve, mid, "outsider"),
    /unavailable/,
  );
  assert.equal(evaluations, 0);
  const result = await readMatchBattlefield(store, registry.resolve, mid, p0);
  assert.deepEqual(battlefieldSnapshotSchema.parse(result), result);
  assert.equal(result.view.revision, state.revision);
  assert.deepEqual(result.presentations[ownHand], {
    name: "Current name",
    rulesText: "Current text",
    attack: 7,
    defence: -2,
    attackType: "MF",
    artworkUrl: `https://example.com/pinned/${state.objects[ownHand].definitionVersion}.webp`,
  });
  assert.equal(result.presentations[opponentHand], undefined);
  assert.equal(result.presentations[faceDown], undefined);
  assert.equal(result.requirements[ownHand]?.action, "play-character");
  assert.equal(result.requirements[opponentHand], undefined);
  assert.equal(result.requirements[faceDown], undefined);
  assert.ok(!artworkRequests.includes("d".repeat(64)));
  for (const secret of [
    state.random.seed,
    "SECRET OPPONENT HAND",
    "SECRET FACE DOWN",
    "PRIVATE HANDLER DATA",
  ])
    assert.ok(!JSON.stringify(result).includes(secret));
  assert.deepEqual(state, before);
  const allowed = await readMatchBattlefield(
    store,
    () => ({
      ...runtime,
      visibility: { canInspectFaceDown: (_state, id) => id === faceDown },
    }),
    mid,
    p0,
  );
  assert.equal(allowed.presentations[faceDown].name, "SECRET FACE DOWN");
  assert.equal(allowed.presentations[opponentHand], undefined);
  assert.equal(allowed.requirements[faceDown], undefined);
  assert.equal(allowed.requirements[opponentHand], undefined);
});

test("participant ids are exposed only to accounts in the match", async () => {
  const { p0, p1, mid, store } = fixture();
  assert.deepEqual(await readMatchParticipantIds(store, mid, p0), [p0, p1]);
  await assert.rejects(
    readMatchParticipantIds(store, mid, "outsider"),
    /unavailable/,
  );
});

test("battlefield reads fail explicitly when pinned presentation data is missing", async () => {
  const { p0, mid, store, resolve } = fixture();
  await assert.rejects(
    readMatchBattlefield(store, resolve, mid, p0),
    /battlefield runtime unavailable/,
  );
  await assert.rejects(
    readMatchBattlefield(
      store,
      () => ({
        ...resolve("test", "1.00"),
        battlefield: {
          characteristics: () => new Map(),
          artworkUrl: () => undefined,
        },
      }),
      mid,
      p0,
    ),
    /characteristics unavailable/,
  );
});

test("accepted concession retries return receipts without executing twice", async () => {
  const { p0, mid, cid, state, store, resolve, counts } = fixture();
  const command = { expectedRevision: 0, action: { type: "concede" } };
  const first = await submitMatchCommand(store, resolve, mid, p0, cid, command);
  assert.equal(first.applied, true);
  assert.equal(first.acceptedRevision, 1);
  assert.deepEqual((await readMatchView(store, resolve, mid, p0)).outcome, {
    type: "win",
    winner: 1,
    reason: "concession",
  });
  const retry = await submitMatchCommand(store, resolve, mid, p0, cid, command);
  assert.equal(retry.applied, false);
  assert.equal(retry.acceptedRevision, 1);
  assert.equal(counts.commits, 1);
  assert.equal(counts.executions, 1);
  assert.equal(JSON.stringify(retry).includes(state.random.seed), false);
  await assert.rejects(
    submitMatchCommand(store, resolve, mid, p0, cid, {
      expectedRevision: 0,
      action: { type: "pass" },
    }),
    /reused/,
  );
});

test("client reconnect retries the original command receipt after losing the accepted response", async () => {
  const { p0, mid, cid, store, resolve, counts } = fixture();
  const read = async () => ({
    view: await readMatchView(store, resolve, mid, p0),
    presentations: {},
    decision: null,
    turnPrompt: null,
  });
  const ids: string[] = [];
  let lost = true;
  const client = new MatchClientSession(
    await read(),
    {
      read,
      async send(id, command) {
        ids.push(id);
        const result = await submitMatchCommand(
          store,
          resolve,
          mid,
          p0,
          id,
          command,
        );
        if (lost) {
          lost = false;
          throw new Error("Connection lost after commit");
        }
        return {
          status: "accepted",
          acceptedRevision: result.acceptedRevision,
        };
      },
    },
    () => cid,
  );
  await client.submit({ expectedRevision: 0, action: { type: "concede" } });
  assert.equal(client.getSnapshot().phase, "reconnecting");
  assert.equal(client.getSnapshot().commandPending, true);
  assert.equal(
    (await client.submit({ expectedRevision: 0, action: { type: "concede" } }))
      .ok,
    false,
  );
  await client.reconnect();
  assert.deepEqual(ids, [cid, cid]);
  assert.equal(counts.commits, 1);
  assert.equal(counts.executions, 1);
  assert.equal(client.getSnapshot().snapshot.view.revision, 1);
  assert.equal(client.getSnapshot().snapshot.view.outcome?.type, "win");
  assert.equal(client.getSnapshot().commandPending, false);
  client.close();
});

test("abandonment receipts replay after game end without converting the result to a draw or win", async () => {
  const { p1, mid, cid, store, resolve, counts } = fixture();
  const command = { expectedRevision: 0, action: { type: "abandon" } };
  const first = await submitMatchCommand(store, resolve, mid, p1, cid, command);
  const retry = await submitMatchCommand(store, resolve, mid, p1, cid, command);
  assert.equal(first.applied, true);
  assert.equal(retry.applied, false);
  assert.deepEqual((await readMatchView(store, resolve, mid, p1)).outcome, { type: "abandoned", by: 1 });
  assert.equal(retry.acceptedRevision, 1);
  assert.equal(counts.commits, 1);
  assert.equal(counts.executions, 1);
});

test("retired runtime still restores and processes its pinned match after a new release", async () => {
  const { p0, mid, cid, store, resolve } = fixture();
  const original = resolve("test", "1.00");
  const registry = createRuntimeRegistry([
    {
      engineVersion: "test",
      rulesVersion: "1.00",
      availableForNewMatches: false,
      runtime: original,
    },
    {
      engineVersion: "next",
      rulesVersion: "1.01",
      availableForNewMatches: true,
      runtime: {
        ...original,
        decodeState: () => {
          throw new Error("New runtime must not read old state");
        },
      },
    },
  ]);
  assert.throws(() => registry.forNewMatch("test", "1.00"), /not enabled/);
  assert.ok(registry.forNewMatch("next", "1.01"));
  const result = await submitMatchCommand(
    store,
    registry.resolve,
    mid,
    p0,
    cid,
    { expectedRevision: 0, action: { type: "concede" } },
  );
  assert.equal(result.acceptedRevision, 1);
  const view = await readMatchView(store, registry.resolve, mid, p0);
  assert.equal(view.engineVersion, "test");
  assert.equal(view.outcome?.type, "win");
});

test("upgrade audit and rollback preserve an old pending decision, action history, and redaction", async () => {
  const { state, p0, p1, mid, cid, store, resolve } = fixture();
  const ownCard = state.players[0].zones.cyberdeck.shift()!;
  const hiddenCard = state.players[1].zones.cyberdeck.shift()!;
  state.players[0].zones.hand.push(ownCard);
  state.players[1].zones.hand.push(hiddenCard);
  const sourceId = state.players[0].zones.cyberdeck[0];
  const choice = {
    prompt: "Retained release choice",
    options: [{ id: "old-option", label: "Old behavior" }],
  };
  state.triggersOrdered = true;
  state.pendingTriggers = [
    {
      sourceId,
      controller: 0,
      handler: "old-choice-v1",
      target: { kind: "player", player: 0 },
      event: { type: "turn-ending", player: 0 },
    },
  ];
  state.pendingDecision = {
    type: "trigger-choice",
    id: "retained-decision",
    player: 0,
    sourceId,
    triggerIndex: 0,
    ...choice,
  };
  const original = resolve("test", "1.00");
  const oldRuntime = {
    ...original,
    commands: {
      ...original.commands,
      triggerChoice: () => structuredClone(choice),
    },
  };
  const upgraded = createRuntimeRegistry([
    {
      engineVersion: "test",
      rulesVersion: "1.00",
      availableForNewMatches: false,
      runtime: oldRuntime,
    },
    {
      engineVersion: "next",
      rulesVersion: "1.01",
      availableForNewMatches: true,
      runtime: {
        ...oldRuntime,
        decodeState: () => {
          throw new Error("New runtime must not read old state");
        },
      },
    },
  ]);
  const before = await auditSimulatorRecovery(
    {
      unfinishedMatches: async () =>
        [await store.load(mid)].flatMap((x) => (x ? [x] : [])),
      acceptedActionRevisions: async () => [],
    },
    upgraded.resolve,
    () => new Date("2026-09-18T12:00:00.000Z"),
  );
  assert.deepEqual(before, {
    checkedAt: "2026-09-18T12:00:00.000Z",
    healthy: true,
    matchesChecked: 1,
    pendingDecisions: 1,
    releases: { "test / rules 1.00": 1 },
    issues: [],
  });

  const accepted = await submitMatchCommand(
    store,
    upgraded.resolve,
    mid,
    p0,
    cid,
    {
      expectedRevision: 0,
      action: {
        type: "answer-trigger-choice",
        decisionId: "retained-decision",
        choice: "old-option",
      },
    },
  );
  assert.equal(accepted.acceptedRevision, 1);

  // A rollback constructs a fresh registry, as a restarted old process would.
  const rolledBack = createRuntimeRegistry([
    {
      engineVersion: "test",
      rulesVersion: "1.00",
      availableForNewMatches: true,
      runtime: oldRuntime,
    },
  ]);
  const restored = await readMatchView(store, rolledBack.resolve, mid, p0);
  assert.equal(restored.revision, 1);
  assert.equal(restored.pendingDecision, null);
  assert.equal(JSON.stringify(restored).includes(ownCard), true);
  assert.equal(JSON.stringify(restored).includes(hiddenCard), false);
  assert.equal(JSON.stringify(restored).includes(p1), false);

  const after = await auditSimulatorRecovery(
    {
      unfinishedMatches: async () =>
        [await store.load(mid)].flatMap((x) => (x ? [x] : [])),
      acceptedActionRevisions: async () => [1],
    },
    rolledBack.resolve,
  );
  assert.equal(after.healthy, true);
  assert.equal(after.pendingDecisions, 0);
});

test("recovery audit reports missing runtimes, invalid snapshots, and action gaps without state data", async () => {
  const { state, mid, store, resolve } = fixture();
  const valid = (await store.load(mid))!;
  const missing = {
    ...structuredClone(valid),
    id: "00000000-0000-4000-8000-000000000005",
    engineVersion: "missing",
  };
  const invalid = {
    ...structuredClone(valid),
    id: "00000000-0000-4000-8000-000000000006",
    revision: 1,
  };
  const gap = {
    ...structuredClone(valid),
    id: "00000000-0000-4000-8000-000000000007",
    revision: 2,
    state: { ...structuredClone(state), revision: 2 },
  };
  const result = await auditSimulatorRecovery(
    {
      unfinishedMatches: async () => [missing, invalid, gap],
      acceptedActionRevisions: async (id) => (id === gap.id ? [2] : []),
    },
    createRuntimeRegistry([
      {
        engineVersion: "test",
        rulesVersion: "1.00",
        availableForNewMatches: false,
        runtime: resolve("test", "1.00"),
      },
    ]).resolve,
  );
  assert.equal(result.healthy, false);
  assert.deepEqual(
    result.issues.map((issue) => issue.code),
    ["runtime-unavailable", "snapshot-invalid", "action-history-invalid"],
  );
  assert.equal(JSON.stringify(result).includes(state.random.seed), false);
  assert.equal(JSON.stringify(result).includes(state.players[0].userId), false);
});

test("runtime registry rejects duplicate pins, unavailable versions, and mismatched snapshots", () => {
  const { state, resolve } = fixture();
  const runtime = resolve("test", "1.00");
  const release = {
    engineVersion: "test",
    rulesVersion: "1.00",
    availableForNewMatches: true,
    runtime,
  };
  assert.throws(() => createRuntimeRegistry([release, release]), /Duplicate/);
  const registry = createRuntimeRegistry([release]);
  assert.throws(() => registry.resolve("missing", "1.00"), /unavailable/);
  assert.throws(() => registry.resolve("test", "other-rules"), /unavailable/);
  assert.throws(
    () =>
      registry
        .resolve("test", "1.00")
        .decodeState({ ...state, engineVersion: "next" }),
    /does not match/,
  );
});

test("new-room admission requires an explicit enabled default and protects retained admission maps", () => {
  const { resolve } = fixture();
  const release = {
    engineVersion: "test",
    rulesVersion: "1.00",
    availableForNewMatches: true,
    runtime: resolve("test", "1.00"),
    defaultForNewMatches: true,
    admission: {
      engine: {
        version: "test",
        handlers: new Map<string, Set<number>>(),
        implementedCards: new Set<string>(),
        verifiedCards: new Set<string>(),
      },
      rulesVersion: "1.00",
      definitions: new Map(),
    },
  };
  assert.equal(createRuntimeRegistry([]).defaultNewMatch(), null);
  assert.throws(
    () => createRuntimeRegistry([{ ...release, admission: undefined }]),
    /Invalid default/,
  );
  assert.throws(
    () =>
      createRuntimeRegistry([{ ...release, availableForNewMatches: false }]),
    /Invalid default/,
  );
  assert.throws(
    () =>
      createRuntimeRegistry([
        {
          ...release,
          admission: { ...release.admission, rulesVersion: "changed" },
        },
      ]),
    /pins mismatch/,
  );
  const registry = createRuntimeRegistry([release]);
  assert.deepEqual(registry.defaultNewMatch(), {
    engineVersion: "test",
    rulesVersion: "1.00",
  });
  release.admission.engine.verifiedCards.add("later-input-mutation");
  const admitted = registry.admissionForNewMatch("test", "1.00");
  assert.equal(admitted.engine.verifiedCards.size, 0);
  (admitted.engine.verifiedCards as Set<string>).add("returned-mutation");
  assert.equal(
    registry.admissionForNewMatch("test", "1.00").engine.verifiedCards.size,
    0,
  );
  assert.throws(
    () => registry.admissionForNewMatch("missing", "1.00"),
    /not enabled/,
  );
  assert.throws(
    () =>
      createRuntimeRegistry([
        {
          ...release,
          defaultForNewMatches: false,
          availableForNewMatches: false,
        },
      ]).admissionForNewMatch("test", "1.00"),
    /not enabled/,
  );
});

test("outsiders cannot read views or inspect command receipts", async () => {
  const { mid, cid, store, resolve, counts } = fixture();
  await assert.rejects(
    readMatchView(store, resolve, mid, "stranger"),
    /unavailable/,
  );
  await assert.rejects(
    submitMatchCommand(store, resolve, mid, "stranger", cid, {
      expectedRevision: 0,
      action: { type: "concede" },
    }),
    /unavailable/,
  );
  assert.equal(counts.receipts, 0);
  assert.equal(counts.executions, 0);
});

test("a losing commit race does not return uncommitted state", async () => {
  const { p0, mid, cid, store, resolve } = fixture();
  await assert.rejects(
    submitMatchCommand(
      {
        ...store,
        commit: async () => {
          throw new Error("Stale match revision");
        },
      },
      resolve,
      mid,
      p0,
      cid,
      { expectedRevision: 0, action: { type: "concede" } },
    ),
    /Stale/,
  );
  const view = await readMatchView(store, resolve, mid, p0);
  assert.equal(view.revision, 0);
  assert.equal(view.outcome, null);
});
