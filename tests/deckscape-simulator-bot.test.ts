import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import starters from "../src/deckscape/data/starter-decks.json";
import { readBotPlaybook } from "../src/deckscape/lib/simulator/bot-playbook";
import {
  compileCodexPlaybook,
  prepareBotAnalysisInput,
} from "../src/deckscape/lib/simulator/bot-analysis";
import type { Entry } from "../src/deckscape/lib/types";
import { botCandidates } from "../src/deckscape/lib/simulator/bot-policy";
import { activationValue } from "../src/deckscape/lib/simulator/bot-activation-value";
import { advanceBot } from "../src/deckscape/lib/simulator/bot-executor";
import { createExpandedRuntimeV6 } from "../src/deckscape/lib/simulator/expanded-runtime-v6";
import { createSetup, applySetupCommand } from "../src/deckscape/lib/simulator/setup";
import { openPriority } from "../src/deckscape/lib/simulator/priority";
import { captureEventObservation } from "../src/deckscape/lib/simulator/event-observation";
import { initialRandomState, rollD20 } from "../src/deckscape/lib/simulator/random";
import { gameFromSetup, type GameState } from "../src/deckscape/lib/simulator/game-state";
import { createCharacterToken } from "../src/deckscape/lib/simulator/token-lifecycle";
import { runtimeTokenDefinition } from "../src/deckscape/lib/simulator/runtime-token-definition";
import {
  addSourceBoundKeywordEffect,
  addUntilTurnEndCombatEffect,
} from "../src/deckscape/lib/simulator/timed-combat-effects";
import { addUntilTurnEndStatEffect } from "../src/deckscape/lib/simulator/timed-stat-effects";
import {
  readMatchBattlefield,
  readActivationQuote,
  submitMatchCommand,
  type MatchStore,
  type StoredMatch,
  type CommandReceipt,
} from "../src/deckscape/lib/simulator/match-service";

const { admission, runtime } = createExpandedRuntimeV6();

// Controlled analyzer output exercises the production compiler without a live
// model or database. Tactical acceptance uses actual published versions.
function generatedBook(index: number) {
  const deck = starters.decks[index];
  const cardId = (name: string) =>
    [...admission.definitions.entries()].find(
      ([, pin]) =>
        pin.definition.characteristics.name.toUpperCase() ===
        name.toUpperCase(),
    )![0];
  const entries: Entry[] = [
    { card_id: cardId(deck.mainframe), section: "mainframe", quantity: 1 },
    ...deck.cyberdeck.map((card) => ({
      card_id: cardId(card.name),
      section: "cyberdeck" as const,
      quantity: card.quantity,
    })),
    { card_id: cardId("BASIC RAM"), section: "ram", quantity: 25 },
  ];
  const input = prepareBotAnalysisInput(
    { id: randomUUID(), name: deck.name, entries },
    admission,
  );
  return compileCodexPlaybook(
    {
      reserveRam: 0,
      aggression: 0.6,
      priorities: input.cards
        .filter((card) => card.section === "cyberdeck")
        .map((card) => ({
          cardId: card.card_id,
          action: "play",
          ability: null,
          weight: 0,
          target: "any",
          when: "always",
          requiresCardIds: [],
        })),
    },
    input,
    "Controlled regression analyzer output; not tactical acceptance",
  );
}

function fixture(
  keys: readonly [number, number],
  seed: number,
  names?: string[],
  mainframe?: string,
) {
  const version = (name: string) =>
    [...admission.definitions.values()].find(
      (p) =>
        p.definition.characteristics.name.toUpperCase() === name.toUpperCase(),
    )!.version;
  const ids: [string, string] = [randomUUID(), randomUUID()];
  const decks = keys.map((index) => {
    const deck = starters.decks[index];
    return {
      mainframe: version(mainframe ?? deck.mainframe),
      cyberdeck: names
        ? [
            ...names,
            ...Array<string>(50 - names.length).fill("DUST DEVIL INITIATE"),
          ].map(version)
        : deck.cyberdeck.flatMap((c) =>
            Array<string>(c.quantity).fill(version(c.name)),
          ),
      ramDeck: Array<string>(25).fill(version("BASIC RAM")),
    };
  });
  let setup = createSetup(
    ids,
    [decks[0], decks[1]],
    initialRandomState(seed.toString(16).padStart(64, "0")),
  );
  while (setup.decision.type !== "ready") {
    const seat = setup.decision.seat;
    const next = applySetupCommand(
      setup,
      ids[seat],
      setup.revision,
      setup.decision.type === "choose-starter"
        ? { type: "choose-starter", startingPlayer: seat }
        : { type: "mulligan", bottomOrder: [] },
    );
    assert.equal(next.accepted, true);
    setup = next.state;
  }
  const mid = randomUUID();
  const initial = runtime.commands.settle(
    gameFromSetup(setup, admission.engine.version, admission.rulesVersion),
  );
  let match: StoredMatch = {
    id: mid,
    player0: ids[0],
    player1: ids[1],
    engineVersion: admission.engine.version,
    rulesVersion: admission.rulesVersion,
    revision: initial.revision,
    state: initial,
  };
  const receipts = new Map<string, CommandReceipt>();
  const actions: { actor: string; action: string }[] = [];
  const store: MatchStore = {
    async load(id) {
      return id === mid ? structuredClone(match) : null;
    },
    async receipt(_mid, id) {
      return receipts.get(id) ?? null;
    },
    async commit(_mid, id, actor, command, next) {
      if (command.expectedRevision !== match.revision)
        throw new Error("Stale match revision");
      match = {
        ...match,
        revision: next.revision,
        state: structuredClone(next),
      };
      receipts.set(id, {
        actorId: actor,
        expectedRevision: command.expectedRevision,
        revision: next.revision,
        command,
      });
      actions.push({ actor, action: command.action.type });
      return { applied: true, acceptedRevision: next.revision };
    },
  };
  return {
    store,
    resolve: () => runtime,
    ids,
    mid,
    actions,
    version,
    get state() {
      return match.state as GameState;
    },
    books: keys.map(generatedBook),
  };
}

test("generated starter regression playbooks compile against reviewed deck cards", () => {
  for (const [index, deck] of starters.decks.entries()) {
    const book = generatedBook(index);
    assert.ok(book.priorities.length > 0);
    assert.deepEqual(readBotPlaybook(book, book.deck), book);
    const names = new Set([
      deck.mainframe,
      ...deck.cyberdeck.map((c) => c.name),
    ]);
    book.priorities.forEach((p) => assert.ok(names.has(p.card), p.card));
  }
  assert.deepEqual(
    readBotPlaybook({ code: "run arbitrary code" }, "unknown").priorities,
    [],
  );
});

test("bot receives only its participant view and does not act during the other seat's decision", async () => {
  const f = fixture([0, 3], 1);
  const snapshots = await Promise.all(
    f.ids.map((id) => readMatchBattlefield(f.store, f.resolve, f.mid, id)),
  );
  for (let seat = 0; seat < 2; seat++) {
    const opponent = snapshots[seat].view.players.find((p) => p.seat !== seat)!;
    assert.equal(opponent.hand, undefined);
    assert.equal(opponent.cyberdeckTop, undefined);
    if (!snapshots[seat].turnPrompt && !snapshots[seat].decision)
      assert.deepEqual(botCandidates(snapshots[seat], f.books[seat]), []);
  }
});

test("Antivirus is held when its counter-removal mode has no effect on the bot's Mainframe", async () => {
  const cybernetic = starters.decks.findIndex(
    (d) => d.key === "genesis-starter-cybernetic",
  );
  const f = fixture([cybernetic, cybernetic], 1);
  const seat = f.state.turn.activePlayer;
  for (let step = 0; f.state.turn.step !== "deploy" && step < 10; step++) {
    await advanceBot(f.store, f.resolve, f.mid, f.ids[seat], f.books[seat], 1);
  }
  assert.equal(f.state.turn.step, "deploy");
  const zones = f.state.players[seat].zones;
  const antivirus = [...zones.hand, ...zones.cyberdeck].find(
    (id) => f.state.objects[id].definitionVersion === f.version("ANTIVIRUS"),
  )!;
  assert.ok(antivirus);
  zones.cyberdeck = [...zones.hand, ...zones.cyberdeck].filter(
    (id) => id !== antivirus,
  );
  zones.hand = [antivirus];
  const ownMainframe = f.state.objects[zones.mainframe[0]];
  const otherMainframe =
    f.state.objects[f.state.players[1 - seat].zones.mainframe[0]];
  const snapshot = () =>
    readMatchBattlefield(f.store, f.resolve, f.mid, f.ids[seat]);
  const plays = async () =>
    botCandidates(await snapshot(), f.books[seat]).filter(
      (c) => c.action.type === "play-program" && c.action.id === antivirus,
    );
  const initial = await snapshot();
  assert.equal(initial.turnPrompt?.type, "pass");
  if (initial.turnPrompt?.type !== "pass")
    throw Error("Missing priority prompt");
  assert.ok(
    initial.turnPrompt.programs
      ?.find((p) => p.id === antivirus)
      ?.variants.some((v) => v.key === "remove-counters"),
    "The engine permits the empty effect; bot utility must reject it",
  );
  assert.deepEqual(await plays(), []);
  otherMainframe.counters = { CORRUPTION: 2 };
  ownMainframe.counters = { CORRUPTION: 0 };
  assert.deepEqual(
    await plays(),
    [],
    "Enemy Mainframe counters and zero counters do not benefit this mode",
  );
  ownMainframe.counters = { CORRUPTION: 2 };
  const useful = await plays();
  assert.ok(
    useful.some(
      (c) =>
        c.action.type === "play-program" && c.action.choices.modes[0] === 1,
    ),
  );
  await advanceBot(f.store, f.resolve, f.mid, f.ids[seat], f.books[seat], 1);
  assert.ok(
    f.state.priorityWindow?.stack.some((a) => a.sourceId === antivirus),
  );
  for (
    let step = 0;
    step < 4 && !f.state.players[seat].zones.recycleBin.includes(antivirus);
    step++
  ) {
    for (let actingSeat = 0; actingSeat < 2; actingSeat++) {
      await advanceBot(
        f.store,
        f.resolve,
        f.mid,
        f.ids[actingSeat],
        f.books[actingSeat],
        1,
      );
    }
  }
  assert.ok(f.state.players[seat].zones.recycleBin.includes(antivirus));
  assert.deepEqual(f.state.objects[zones.mainframe[0]].counters, {});
  assert.deepEqual(
    f.state.objects[f.state.players[1 - seat].zones.mainframe[0]].counters,
    { CORRUPTION: 2 },
  );
});

test("each starter bot keeps its newly installed RAM through opening force-quit", async () => {
  for (let starter = 0; starter < starters.decks.length; starter++) {
    const f = fixture([starter, starter], starter + 1);
    const seat = f.state.turn.activePlayer;
    for (
      let step = 0;
      f.state.turn.step !== "force-quit" && step < 10;
      step++
    ) {
      await advanceBot(
        f.store,
        f.resolve,
        f.mid,
        f.ids[seat],
        f.books[seat],
        1,
      );
    }
    assert.equal(f.state.turn.step, "force-quit");
    const installed = [...f.state.players[seat].zones.ramBank];
    assert.ok(installed.length > 0);
    const snapshot = await readMatchBattlefield(
      f.store,
      f.resolve,
      f.mid,
      f.ids[seat],
    );
    assert.deepEqual(
      botCandidates(snapshot, f.books[seat])[0]?.action,
      {
        type: "force-quit",
        ids: [],
      },
      starters.decks[starter].key,
    );
    assert.equal(snapshot.turnPrompt?.type, "force-quit");
    if (snapshot.turnPrompt?.type === "force-quit") {
      snapshot.turnPrompt.candidates = [];
      assert.deepEqual(botCandidates(snapshot, f.books[seat])[0]?.action, {
        type: "force-quit",
        ids: [],
      });
    }
    const revision = f.state.revision;
    await advanceBot(f.store, f.resolve, f.mid, f.ids[seat], f.books[seat], 1);
    assert.ok(f.state.revision > revision);
    assert.deepEqual(f.state.players[seat].zones.ramBank, installed);
    assert.equal(f.state.turn.step, "deploy");
  }
});

for (const [pair, seed] of [
  [[0, 3], 1],
  [[1, 2], 2],
  [[2, 3], 3],
  [[0, 1], 4],
] as const) {
  test(
    `starter bots complete ${pair.join(" vs ")} with seed ${seed} through the match service`,
    { timeout: 120000 },
    async () => {
      const f = fixture(pair, seed);
      for (let n = 0; n < 3000 && !f.state.outcome; n++) {
        if (process.env.BOT_TRACE && n % 25 === 0)
          console.error(
            pair,
            n,
            f.state.turn,
            f.state.players.map((p) => [p.mainframeHealth, p.bioframeHealth]),
            f.state.pendingDecision?.type,
          );
        const revision = f.state.revision;
        for (let seat = 0; seat < 2; seat++)
          await advanceBot(
            f.store,
            f.resolve,
            f.mid,
            f.ids[seat],
            f.books[seat],
            1,
          );
        assert.ok(
          f.state.revision > revision,
          `No progress at ${JSON.stringify({ turn: f.state.turn, decision: f.state.pendingDecision })}`,
        );
      }
      assert.ok(
        f.state.outcome,
        `No completion after ${f.state.revision} commands`,
      );
      assert.ok(f.actions.some((a) => a.action === "play-character"));
      assert.ok(f.actions.some((a) => a.action === "attack"));
      assert.ok(
        !f.actions.some(
          (a) => a.action === "concede" || a.action === "abandon",
        ),
      );
    },
  );
}

async function xandraFixture() {
  const f = fixture([0, 0], 1, [
    "XANDRA, HIVE QUEEN",
    "NANOBOT SWARM",
    "NANOBOT SWARM",
    "NANOBOT SWARM",
    "PROJECT ARCHANGEL",
  ]);
  const seat = f.state.turn.activePlayer;
  const ids = (name: string, owner = seat) =>
    Object.values(f.state.objects)
      .filter(
        (o) => o.owner === owner && o.definitionVersion === f.version(name),
      )
      .map((o) => o.id);
  const place = (id: string, board: boolean) => {
    for (const player of f.state.players) {
      player.zones.hand = player.zones.hand.filter((x) => x !== id);
      player.zones.cyberdeck = player.zones.cyberdeck.filter((x) => x !== id);
    }
    if (board) {
      f.state.arena.push(id);
      const pin = [...admission.definitions.values()].find(
        (p) => p.version === f.state.objects[id].definitionVersion,
      )!;
      const character = pin.definition.characteristics;
      if (character.cardType !== "character")
        throw Error("Expected character fixture");
      const cost = character.ramCost;
      for (const ram of f.state.players[
        f.state.objects[id].owner
      ].zones.ramDeck.splice(0, cost)) {
        f.state.arena.push(ram);
        f.state.objects[ram].attachments = [{ kind: "ram", hostId: id }];
      }
    } else f.state.players[seat].zones.hand.push(id);
  };
  for (const player of f.state.players) {
    player.zones.cyberdeck.push(...player.zones.hand);
    player.zones.hand = [];
  }
  const queen = ids("XANDRA, HIVE QUEEN")[0];
  const swarms = ids("NANOBOT SWARM");
  swarms.slice(0, 2).forEach((id) => place(id, true));
  const target = ids("PROJECT ARCHANGEL", seat === 0 ? 1 : 0)[0];
  place(target, true);
  place(queen, false);
  const zones = f.state.players[seat].zones;
  zones.ramBank.push(...zones.ramDeck.splice(0, 3));
  f.state.turn.step = "deploy";
  f.state.priorityWindow = openPriority(seat, "deploy");
  const send = async (
    action: import("../src/deckscape/lib/simulator/commands").GameCommand["action"],
    actorSeat = seat,
  ) =>
    submitMatchCommand(
      f.store,
      f.resolve,
      f.mid,
      f.ids[actorSeat],
      randomUUID(),
      { expectedRevision: f.state.revision, action },
    );
  await send({
    type: "play-character",
    id: queen,
    ram: zones.ramBank.slice(0, 3),
    runCharacters: swarms.slice(0, 2),
  });
  for (
    let step = 0;
    step < 10 &&
    (f.state.priorityWindow?.stack.length || f.state.priorityWindow?.resolving);
    step++
  ) {
    const actor = f.state.priorityWindow?.priority;
    assert.notEqual(actor, null);
    await send({ type: "pass" }, actor!);
  }
  assert.ok(f.state.arena.includes(queen));
  assert.ok(swarms.slice(0, 2).every((id) => f.state.objects[id].running));
  // Give the bot priority after the actual play has run its two entry-cost NANOBOTs.
  f.state.priorityWindow = openPriority(seat, "deploy");
  return {
    f,
    seat,
    queen,
    swarms,
    target,
    place,
    send,
    book: readBotPlaybook(null, "xandra-regression"),
  };
}

test("Xandra bot preserves SWARM STRIKE when entry costs leave no ready NANOBOTs", async () => {
  const { f, seat, queen, book } = await xandraFixture();
  const snapshot = await readMatchBattlefield(
    f.store,
    f.resolve,
    f.mid,
    f.ids[seat],
  );
  assert.equal(snapshot.turnPrompt?.type, "pass");
  if (snapshot.turnPrompt?.type !== "pass") throw Error("Missing priority");
  assert.ok(
    snapshot.turnPrompt.activations
      ?.find((o) => o.id === queen)
      ?.abilities.find((a) => a.abilityId === "swarm-strike")
      ?.variants.some((v) => v.key === "swarm-0"),
    "Zero sacrifice remains legal for human players",
  );
  const quote = await readActivationQuote(
    f.store,
    f.resolve,
    f.mid,
    f.ids[seat],
    {
      expectedRevision: f.state.revision,
      id: queen,
      abilityId: "swarm-strike",
      choices: { targets: [], sacrificeCharacters: [], modes: [], x: null },
    },
  );
  assert.equal(quote.status, "ready");
  assert.ok(quote.affordable);
  const before = f.actions.length;
  await advanceBot(f.store, f.resolve, f.mid, f.ids[seat], book, 1);
  assert.equal(
    f.actions.slice(before).some((a) => a.action === "activate"),
    false,
    "Bot must pass rather than run Xandra for zero damage",
  );
  assert.equal(f.state.objects[queen].running, false);
});

test("Xandra bot holds its NANOBOTs when no enemy can be removed, even with a high playbook priority", async () => {
  const { f, seat, queen, swarms, target, place, book } = await xandraFixture();
  place(swarms[2], true);
  book.priorities = [
    {
      card: "XANDRA, HIVE QUEEN",
      action: "activate",
      ability: "SWARM STRIKE",
      weight: 100,
      target: "any",
      when: "always",
      requires: [],
    },
  ];
  const snapshot = await readMatchBattlefield(
    f.store,
    f.resolve,
    f.mid,
    f.ids[seat],
  );
  assert.ok(
    snapshot.presentations[swarms[2]].attack! <
      snapshot.presentations[target].defence!,
  );
  const before = f.actions.length;
  await advanceBot(f.store, f.resolve, f.mid, f.ids[seat], book, 1);
  assert.equal(
    f.actions.slice(before).some((a) => a.action === "activate"),
    false,
    "Nonlethal damage and friendly targets do not justify sacrificing a NANOBOT",
  );
  assert.equal(f.state.objects[queen].running, false);
  assert.ok(f.state.arena.includes(swarms[2]));
});

test("Xandra bot uses one ready NANOBOT to finish a damaged enemy and preserves the others", async () => {
  const { f, seat, queen, swarms, target, place, send, book } =
    await xandraFixture();
  place(swarms[2], true);
  const snapshot = await readMatchBattlefield(
    f.store,
    f.resolve,
    f.mid,
    f.ids[seat],
  );
  f.state.objects[target].damage.MF =
    snapshot.presentations[target].defence! -
    snapshot.presentations[swarms[2]].attack!;
  await advanceBot(f.store, f.resolve, f.mid, f.ids[seat], book, 1);
  const action = f.state.priorityWindow!.stack.find(
    (a) => a.sourceId === queen,
  )!;
  assert.ok(action?.activatedAbility, "A useful removal is activated");
  assert.deepEqual(action.activatedAbility.choices.sacrificeCharacters, [
    swarms[2],
  ]);
  assert.deepEqual(action.activatedAbility.choices.targets, [target]);
  for (
    let step = 0;
    step < 10 &&
    (f.state.priorityWindow?.stack.length || f.state.priorityWindow?.resolving);
    step++
  )
    await send({ type: "pass" }, f.state.priorityWindow!.priority!);
  assert.equal(
    f.state.arena.includes(target),
    false,
    "Real resolution removes the enemy",
  );
  assert.ok(swarms.slice(0, 2).every((id) => f.state.arena.includes(id)));
  assert.ok(f.state.players[seat].zones.recycleBin.includes(swarms[2]));
});

test("Xandra bot combines two sacrifices on one target only when needed for removal", async () => {
  const { f, seat, queen, swarms, target, send, book } = await xandraFixture();
  for (const id of swarms.slice(0, 2)) f.state.objects[id].running = false;
  const snapshot = await readMatchBattlefield(
    f.store,
    f.resolve,
    f.mid,
    f.ids[seat],
  );
  const attack = snapshot.presentations[swarms[0]].attack!;
  f.state.objects[target].damage.BF =
    snapshot.presentations[target].defence! - (attack + 1);
  await advanceBot(f.store, f.resolve, f.mid, f.ids[seat], book, 1);
  const action = f.state.priorityWindow!.stack.find(
    (a) => a.sourceId === queen,
  )!;
  assert.ok(action?.activatedAbility);
  assert.equal(action.activatedAbility.choices.sacrificeCharacters?.length, 2);
  assert.deepEqual(action.activatedAbility.choices.targets, [target, target]);
  for (
    let step = 0;
    step < 10 &&
    (f.state.priorityWindow?.stack.length || f.state.priorityWindow?.resolving);
    step++
  )
    await send({ type: "pass" }, f.state.priorityWindow!.priority!);
  assert.equal(f.state.arena.includes(target), false);
});

test("Xandra bot does not spend a NANOBOT on a target whose ARMOR prevents removal", async () => {
  const { f, seat, queen, swarms, target, place, book } = await xandraFixture();
  place(swarms[2], true);
  const snapshot = await readMatchBattlefield(
    f.store,
    f.resolve,
    f.mid,
    f.ids[seat],
  );
  f.state.objects[target].damage.BF =
    snapshot.presentations[target].defence! - 1;
  f.state.objects[target].counters.ARMOR = 1;
  const before = f.actions.length;
  await advanceBot(f.store, f.resolve, f.mid, f.ids[seat], book, 1);
  assert.equal(
    f.actions.slice(before).some((a) => a.action === "activate"),
    false,
  );
  assert.equal(f.state.objects[queen].running, false);
  assert.ok(f.state.arena.includes(swarms[2]));
});

async function abilityFixture(
  card: string,
  ability: string,
  options: {
    friends?: string[];
    enemies?: string[];
    hand?: string[];
    opponentTurn?: boolean;
    runningEnemy?: boolean;
    emptyRamDeck?: boolean;
    counters?: Record<string, number>;
    bank?: number;
    enemyHealth?: number;
    seat?: 0 | 1;
  } = {},
) {
  const names = [
    card,
    ...(options.friends ?? []),
    ...(options.enemies ?? ["DUST DEVIL INITIATE"]),
    ...(options.hand ?? []),
  ];
  const f = fixture([0, 0], 1, names);
  const seat = options.seat ?? 1;
  const other = seat === 0 ? 1 : 0;
  f.state.turn.activePlayer = options.opponentTurn ? other : seat;
  f.state.turn.step = "deploy";
  f.state.priorityWindow = openPriority(f.state.turn.activePlayer, "deploy");
  if (options.opponentTurn) {
    f.state.priorityWindow.priority = seat;
    f.state.priorityWindow.swiftCheck = true;
  }
  for (const p of f.state.players) {
    p.zones.cyberdeck.push(...p.zones.hand);
    p.zones.hand = [];
  }
  const place = (
    name: string,
    owner: 0 | 1,
    zone: "arena" | "hand" = "arena",
  ) => {
    const id = f.state.players[owner].zones.cyberdeck.find(
      (id) => f.state.objects[id].definitionVersion === f.version(name),
    )!;
    assert.ok(id, name);
    f.state.players[owner].zones.cyberdeck = f.state.players[
      owner
    ].zones.cyberdeck.filter((x) => x !== id);
    if (zone === "hand") f.state.players[owner].zones.hand.push(id);
    else {
      f.state.arena.push(id);
      const characteristics = [...admission.definitions.values()].find(
        (p) => p.version === f.version(name),
      )!.definition.characteristics;
      if (
        characteristics.cardType === "program" &&
        characteristics.subtype === "environment"
      ) {
        f.state.arena = f.state.arena.filter((x) => x !== id);
        f.state.environment.push(id);
      }
      for (const ram of f.state.players[owner].zones.ramDeck.splice(
        0,
        characteristics.cardType === "character" ? characteristics.ramCost : 0,
      )) {
        f.state.arena.push(ram);
        f.state.objects[ram].attachments = [{ kind: "ram", hostId: id }];
      }
    }
    return id;
  };
  const source = place(card, seat);
  const friends = (options.friends ?? []).map((n) => place(n, seat));
  const enemies = (options.enemies ?? ["DUST DEVIL INITIATE"]).map((n) =>
    place(n, other),
  );
  (options.hand ?? []).forEach((n) => place(n, seat, "hand"));
  if (options.runningEnemy)
    enemies.forEach((id) => {
      f.state.objects[id].running = true;
    });
  if (options.counters) f.state.objects[source].counters = options.counters;
  if (options.enemyHealth !== undefined)
    f.state.players[other].bioframeHealth = options.enemyHealth;
  const own = f.state.players[seat].zones;
  own.ramBank.push(...own.ramDeck.splice(0, options.bank ?? 12));
  if (options.emptyRamDeck) {
    own.recycleBin.push(...own.ramDeck);
    own.ramDeck = [];
  }
  const book = readBotPlaybook(null, "ability-regression");
  const read = () =>
    readMatchBattlefield(f.store, f.resolve, f.mid, f.ids[seat]);
  const snapshot = await read();
  const sourceOption =
    snapshot.turnPrompt?.type === "pass"
      ? snapshot.turnPrompt.activations?.find((o) => o.id === source)
      : undefined;
  const projected = sourceOption?.abilities.find((a) => a.label === ability);
  assert.ok(projected, `${card}/${ability} must be projected`);
  book.priorities = sourceOption!.abilities.map((a) => ({
    card,
    ability: a.label,
    action: "activate",
    weight: a.label === ability ? 999 : -100,
    target: "enemy",
    when: "always",
    requires: [],
  }));
  const candidates = () =>
    read().then((s) =>
      botCandidates(s, book).filter(
        (c) =>
          c.action.type === "activate" &&
          c.action.id === source &&
          c.action.abilityId === projected.abilityId,
      ),
    );
  const advance = () =>
    advanceBot(f.store, f.resolve, f.mid, f.ids[seat], book, 1);
  const resolve = async () => {
    for (
      let n = 0;
      n < 12 &&
      !f.state.outcome &&
      !f.state.pendingDecision &&
      (f.state.priorityWindow?.stack.length ||
        f.state.priorityWindow?.resolving);
      n++
    ) {
      const actor = f.state.priorityWindow!.priority!;
      await submitMatchCommand(
        f.store,
        f.resolve,
        f.mid,
        f.ids[actor],
        randomUUID(),
        { expectedRevision: f.state.revision, action: { type: "pass" } },
      );
    }
  };
  return {
    f,
    seat,
    source,
    friends,
    enemies,
    read,
    candidates,
    advance,
    resolve,
    abilityId: projected.abilityId,
    place,
  };
}

const wasteCases: [string, string, Parameters<typeof abilityFixture>[2]][] = [
  ["BIG KAT", "TALLER", { enemies: ["ALICE, DREAMWALKER"] }],
  ["TAGGER", "REVOLUTION", { enemies: ["CODER"] }],
  ["QUEEN OF HEARTS", "OFF WITH THEIR HEADS", { enemies: [] }],
  ["NEOSEC FIRESTORM", "INCINERATE", { enemies: [] }],
  [
    "PROJECT ARCHANGEL",
    "JUDGMENT DAY",
    { enemies: [], friends: ["NANOBOT SWARM"] },
  ],
  ["MOSHER", "WINDMILL", { enemies: [], friends: ["DUST DEVIL INITIATE"] }],
  ["STAGE DIVER", "LEAP OF FAITH", { enemies: [] }],
  ["LILITH, THE DARK MOON", "THE PATH OF DARKNESS", {}],
  ["LUNA, THE SACRED MOON", "THE PATH OF LIGHT", {}],
  ["ANIMA PROXY", "REVERSE POLARITY", {}],
  ["VENTURE CAPITALIST", "CASH OUT", { counters: { interest: 0 } }],
  ["ALICE, DREAMWALKER", "CHECKMATE", {}],
  ["ECLIPSE DROPSHIP", "INFILTRATE", {}],
  ["NANOBOT HARVESTER", "POLLINATE", { emptyRamDeck: true }],
  ["ACPD DRONES", "DETAIN", { runningEnemy: true }],
  ["SKIN SMASHER", "COUNT IN", { enemies: [] }],
  ["EXTERMINATOR", "GAS CLOUD", { enemies: [] }],
  ["TRIXIE, TECHNO QUEEN", "FLOOR SCORE", {}],
  ["ASHARA, HIGH PRIESTESS", "QUICKEN THE PULSE", {}],
  ["LUG NUT", "BORK", { opponentTurn: true }],
  ["CRYOBLADE ASSASSIN", "CLOAKED STRIKE", { opponentTurn: true }],
  ["LASERSAW BERSERKER", "RAMPAGE", { opponentTurn: true }],
];
for (const [card, ability, config] of wasteCases)
  test(`ability value: hold ${card}/${ability} despite high priority`, async () => {
    const h = await abilityFixture(card, ability, config);
    assert.equal((await h.candidates()).length, 0);
    await h.advance();
    assert.notEqual(h.f.actions.at(-1)?.action, "activate");
    assert.ok(h.f.state.arena.includes(h.source));
    assert.equal(h.f.state.objects[h.source].running, false);
    assert.equal(h.f.state.objects[h.source].abilitySpent, false);
  });

test("ability value: beneficial counters target a friend even with enemy playbook preference", async () => {
  for (const [card, ability, recipient] of [
    ["BIG KAT", "TALLER", "ALICE, DREAMWALKER"],
    ["TAGGER", "REVOLUTION", "CODER"],
  ]) {
    const h = await abilityFixture(card, ability, {
      friends: [recipient],
      enemies: [recipient],
    });
    assert.ok((await h.candidates()).length);
    await h.advance();
    await h.resolve();
    assert.equal(h.f.state.objects[h.friends[0]].counters["+1/+1"], 1);
    assert.equal(h.f.state.objects[h.enemies[0]].counters["+1/+1"] ?? 0, 0);
  }
});

test("ability value: useful nonlethal INCINERATE hits multiple enemies and preserves friends", async () => {
  const h = await abilityFixture("NEOSEC FIRESTORM", "INCINERATE", {
    friends: ["CODER"],
    enemies: ["DUST DEVIL INITIATE", "HEX, CODEMANCER"],
  });
  await h.advance();
  await h.resolve();
  assert.equal(h.f.state.objects[h.friends[0]].damage.BF, 0);
  for (const id of h.enemies) assert.equal(h.f.state.objects[id].damage.BF, 1);
  assert.ok(h.enemies.every((id) => h.f.state.arena.includes(id)));
});

test("ability value: run cost preserves Firestorm's larger unblocked attack", async () => {
  const h = await abilityFixture("NEOSEC FIRESTORM", "SEEKER MISSILE", {
    enemies: [],
  });
  assert.equal((await h.candidates()).length, 0);
  await h.advance();
  assert.equal(h.f.state.objects[h.source].running, false);
});

test("ability value: lethal player damage overrides lost attack value and targets either seat's opponent", async () => {
  for (const seat of [0, 1] as const) {
    const h = await abilityFixture("NEOSEC FIRESTORM", "SEEKER MISSILE", {
      enemyHealth: 3,
      seat,
    });
    await h.advance();
    await h.resolve();
    assert.equal(h.f.state.outcome?.type, "win");
    assert.equal(
      h.f.state.outcome?.type === "win" && h.f.state.outcome.winner,
      h.seat,
    );
  }
});

test("ability value: BLOOD MONEY couples nonzero X and sacrifices and resolves lethal damage", async () => {
  const h = await abilityFixture("MAXIMILLION GOLD", "BLOOD MONEY", {
    enemyHealth: 4,
  });
  const options = await h.candidates();
  assert.ok(options.length);
  for (const c of options) {
    assert.equal(c.action.type, "activate");
    if (c.action.type !== "activate") continue;
    assert.ok(c.action.choices.x! > 0);
    assert.equal(c.action.choices.x, c.action.choices.sacrificeRam?.length);
    assert.equal(c.action.choices.playerTarget, 0);
  }
  await h.advance();
  const a = h.f.state.priorityWindow!.stack.find(
    (a) => a.sourceId === h.source,
  )!.activatedAbility!;
  assert.equal(a.choices.x, 4, "prefer the smallest lethal sacrifice");
  await h.resolve();
  assert.equal(h.f.state.outcome?.type, "win");
});

test("ability value: human zero-payment BLOOD MONEY remains legal", async () => {
  const h = await abilityFixture("MAXIMILLION GOLD", "BLOOD MONEY");
  const quote = await readActivationQuote(
    h.f.store,
    h.f.resolve,
    h.f.mid,
    h.f.ids[h.seat],
    {
      expectedRevision: h.f.state.revision,
      id: h.source,
      abilityId: h.abilityId,
      choices: {
        targets: [],
        modes: [],
        x: 0,
        sacrificeRam: [],
        playerTarget: 0,
      },
    },
  );
  assert.equal(quote.status, "ready");
});

test("ability value: CASH OUT retains growth without demand and installs running RAM for future demand", async () => {
  const hold = await abilityFixture("VENTURE CAPITALIST", "CASH OUT", {
    counters: { interest: 2 },
    bank: 4,
    enemies: ["CODER"],
  });
  assert.equal((await hold.candidates()).length, 0);
  const use = await abilityFixture("VENTURE CAPITALIST", "CASH OUT", {
    counters: { interest: 2 },
    bank: 4,
    hand: ["NEOSEC FIRESTORM"],
  });
  await use.advance();
  await use.resolve();
  assert.equal(use.f.state.objects[use.source].counters.interest ?? 0, 0);
  assert.equal(use.f.state.players[use.seat].zones.ramBank.length, 6);
  assert.equal(
    use.f.state.players[use.seat].zones.ramBank.filter(
      (id) => use.f.state.objects[id].running,
    ).length,
    2,
  );
});

test("ability value: a positive quoted-cost increase can make an activation not worthwhile", async () => {
  const h = await abilityFixture("BIG KAT", "TALLER", {
    friends: ["ALICE, DREAMWALKER"],
  });
  const c = (await h.candidates())[0];
  assert.equal(c.action.type, "activate");
  if (c.action.type !== "activate") return;
  assert.equal(
    activationValue(
      await h.read(),
      h.source,
      h.abilityId,
      c.action.choices,
      10,
    ),
    null,
  );
});

test("ability value: executor holds chip damage whose quoted RAM cost exceeds payoff", async () => {
  const h = await abilityFixture("NEOSEC FIRESTORM", "INCINERATE");
  assert.ok(
    (await h.candidates()).length,
    "effect exists before quoting its cost",
  );
  await h.advance();
  assert.notEqual(h.f.actions.at(-1)?.action, "activate");
  assert.equal(h.f.state.objects[h.source].abilitySpent, false);
});

test("ability value: favorable sweeps and self-destruction remove more enemy value than they lose", async () => {
  for (const [card, ability, enemies] of [
    [
      "PROJECT ARCHANGEL",
      "JUDGMENT DAY",
      ["NEOSEC FIRESTORM", "NEOSEC FIRESTORM"],
    ],
    ["MOSHER", "WINDMILL", ["CODER", "CODER", "CODER"]],
    ["STAGE DIVER", "LEAP OF FAITH", ["CODER", "CODER"]],
  ] as const) {
    const h = await abilityFixture(card, ability, { enemies: [...enemies] });
    await h.advance();
    assert.equal(h.f.actions.at(-1)?.action, "activate", card);
    await h.resolve();
    for (const id of h.enemies)
      assert.equal(h.f.state.arena.includes(id), false, card);
  }
});

test("ability value: ARMOR-protected removal does not justify spending INCINERATE", async () => {
  const h = await abilityFixture("NEOSEC FIRESTORM", "INCINERATE", {
    enemies: ["CODER"],
  });
  h.f.state.objects[h.enemies[0]].counters.ARMOR = 1;
  assert.equal((await h.candidates()).length, 0);
  await h.advance();
  assert.notEqual(h.f.actions.at(-1)?.action, "activate");
});

test("ability value: Luna heals above starting health when recycled tarots justify her cost", async () => {
  const h = await abilityFixture("LUNA, THE SACRED MOON", "THE PATH OF LIGHT", {
    hand: ["THE LOVERS", "THE HIGH PRIESTESS", "THE SUN"],
    enemies: [],
  });
  const zones = h.f.state.players[h.seat].zones;
  zones.recycleBin.push(...zones.hand);
  zones.hand = [];
  const before = h.f.state.players[h.seat].mainframeHealth;
  await h.advance();
  await h.resolve();
  assert.equal(h.f.state.players[h.seat].mainframeHealth, before + 3);
  assert.equal(h.f.state.players[h.seat].bioframeHealth, 23);
});

test("ability value: POLLINATE installs RAM when the deck has resources", async () => {
  const h = await abilityFixture("NANOBOT HARVESTER", "POLLINATE", {
    enemies: [],
  });
  assert.ok((await h.candidates()).length);
  await h.advance();
  await h.resolve();
  assert.equal(h.f.state.players[h.seat].zones.ramBank.length, 13);
});

test("ability value: temporary buffs keep useful attacks and reject expired combat", async () => {
  const h = await abilityFixture("CRYOBLADE ASSASSIN", "CLOAKED STRIKE");
  const snapshot = await h.read();
  await h.advance();
  await h.resolve();
  assert.equal(h.f.state.objects[h.source].abilitySpent, true);
  snapshot.view.turn.step = "reset";
  snapshot.view.combat = {
    stage: "damage-applied",
    attackers: [h.source],
    blockers: [],
  };
  assert.equal(
    activationValue(snapshot, h.source, h.abilityId, {
      targets: [],
      modes: [],
      x: null,
    }),
    null,
  );
});

test("ability value: RAMPAGE can secure an unblocked win instead of waiting for a kill", async () => {
  const h = await abilityFixture("LASERSAW BERSERKER", "RAMPAGE", {
    enemies: [],
    enemyHealth: 6,
  });
  await h.advance();
  await h.resolve();
  assert.equal(h.f.state.objects[h.source].abilitySpent, true);
  const snapshot = await h.read();
  assert.ok(snapshot.presentations[h.source].attack! >= 6);
});

test("ability value: visible drug plays can justify FLOOR SCORE", async () => {
  const h = await abilityFixture("TRIXIE, TECHNO QUEEN", "FLOOR SCORE", {
    hand: ["STIM PACK", "REDLINE"],
    enemies: [],
  });
  const snapshot = await h.read();
  assert.ok(
    snapshot.turnPrompt?.type === "pass" &&
      snapshot.turnPrompt.programs!.length >= 2,
  );
  assert.ok(
    botCandidates(snapshot, readBotPlaybook(null, "discount")).some(
      (c) => c.action.type === "activate" && c.action.id === h.source,
    ),
  );
  await h.advance();
  await h.resolve();
  assert.equal(h.f.state.objects[h.source].abilitySpent, true);
});

test("ability value: Ashara duplicates a visible upcoming friendly environment trigger", async () => {
  const h = await abilityFixture(
    "ASHARA, HIGH PRIESTESS",
    "QUICKEN THE PULSE",
    {
      friends: ["THE AMRITA", "DUST DEVIL INITIATE"],
      enemies: [],
    },
  );
  await h.advance();
  await h.resolve();
  assert.equal(h.f.state.objects[h.source].abilitySpent, true);
});

test("ability value: opposing ready threats justify DETAIN and friendly Thrashers justify COUNT IN", async () => {
  const detain = await abilityFixture("ACPD DRONES", "DETAIN", {
    enemies: ["PROJECT ARCHANGEL"],
  });
  await detain.advance();
  await detain.resolve();
  assert.equal(detain.f.state.objects[detain.enemies[0]].running, true);
  const buff = await abilityFixture("SKIN SMASHER", "COUNT IN", {
    friends: ["MOSHER"],
  });
  const before = (await buff.read()).presentations[buff.friends[0]].attack!;
  await buff.advance();
  await buff.resolve();
  assert.equal(
    (await buff.read()).presentations[buff.friends[0]].attack,
    before + 1,
  );
});

test("ability value: RAMPAGE can make a favorable defensive trade on the opponent turn", async () => {
  const h = await abilityFixture("LASERSAW BERSERKER", "RAMPAGE", {
    opponentTurn: true,
    friends: ["EXTERMINATOR", "CRYOBLADE ASSASSIN"],
    enemies: ["NEOSEC FIRESTORM"],
  });
  h.f.state.turn.step = "combat";
  h.f.state.combat = {
    stage: "damage-window",
    attackers: [h.enemies[0]],
    blockers: [{ attackerId: h.enemies[0], blockerId: h.source }],
  };
  h.f.state.priorityWindow = openPriority(0, "combat");
  await h.advance();
  assert.equal(h.f.actions.at(-1)?.action, "activate");
  await h.resolve();
  assert.equal(h.f.state.arena.includes(h.enemies[0]), false);
});

test("ability value: JUDGMENT DAY counts friendly protocols in the destruction trade", async () => {
  const h = await abilityFixture("PROJECT ARCHANGEL", "JUDGMENT DAY", {
    friends: ["ARTIFICIAL INFLATION"],
    enemies: ["NEOSEC FIRESTORM", "NEOSEC FIRESTORM"],
  });
  h.f.state.objects[h.friends[0]].attachments = [
    { kind: "protocol", hostId: h.f.state.players[h.seat].zones.mainframe[0] },
  ];
  assert.equal((await h.candidates()).length, 0);
  await h.advance();
  assert.notEqual(h.f.actions.at(-1)?.action, "activate");
  assert.ok(h.f.state.arena.includes(h.friends[0]));
});

test("ability value: Queen holds expensive destruction against ARMOR", async () => {
  const h = await abilityFixture("QUEEN OF HEARTS", "OFF WITH THEIR HEADS", {
    enemies: ["PROJECT ARCHANGEL"],
  });
  h.f.state.objects[h.enemies[0]].counters.ARMOR = 1;
  await h.advance();
  assert.notEqual(h.f.actions.at(-1)?.action, "activate");
  assert.ok(h.f.state.arena.includes(h.enemies[0]));
});

function zeroAttackFixture() {
  const f = fixture(
    [0, 0],
    1,
    ["UNPAID INTERN", "DUST DEVIL INITIATE"],
    "WNDRTECH",
  );
  const seat = f.state.turn.activePlayer;
  const other: 0 | 1 = seat === 0 ? 1 : 0;
  for (const player of f.state.players) {
    player.zones.cyberdeck.push(...player.zones.hand);
    player.zones.hand = [];
  }
  const board = (name: string, owner: 0 | 1) => {
    const zones = f.state.players[owner].zones;
    const id = zones.cyberdeck.find(
      (id) => f.state.objects[id].definitionVersion === f.version(name),
    )!;
    assert.ok(id);
    zones.cyberdeck = zones.cyberdeck.filter((candidate) => candidate !== id);
    f.state.arena.push(id);
    const printed = [...admission.definitions.values()].find(
      (pin) => pin.version === f.version(name),
    )!.definition.characteristics;
    if (printed.cardType !== "character") throw Error("Expected character");
    for (const ram of zones.ramDeck.splice(0, printed.ramCost)) {
      f.state.arena.push(ram);
      f.state.objects[ram].attachments = [{ kind: "ram", hostId: id }];
    }
    return id;
  };
  const intern = board("UNPAID INTERN", seat);
  const attacker = board("DUST DEVIL INITIATE", seat);
  const enemy = board("DUST DEVIL INITIATE", other);
  f.state.objects[enemy].running = true;
  f.state.turn.number = 2;
  f.state.turn.step = "combat";
  f.state.combat = { stage: "attackers", attackers: [], blockers: [] };
  f.state.priorityWindow = null;
  const token = runtimeTokenDefinition(
    "pawn",
    admission.engine.version,
    admission.rulesVersion,
    "MF",
  );
  const pawn = `token:${f.state.nextTokenNumber}`;
  Object.assign(
    f.state,
    createCharacterToken(
      f.state,
      seat,
      f.state.players[seat].zones.mainframe[0],
      token.version,
      new Map([[token.version, token.characteristics]]),
    ),
  );
  Object.assign(f.state, runtime.commands.settle(f.state));
  const book = readBotPlaybook(null, "zero-attack-regression");
  const read = () =>
    readMatchBattlefield(f.store, f.resolve, f.mid, f.ids[seat]);
  const advance = () =>
    advanceBot(f.store, f.resolve, f.mid, f.ids[seat], book, 1);
  return { f, seat, other, intern, pawn, attacker, enemy, book, read, advance };
}

for (const aggression of [0.1, 1]) {
  test(`bot preserves zero-attack tokens and non-tokens at aggression ${aggression}`, async () => {
    const h = zeroAttackFixture();
    h.book.aggression = aggression;
    const snapshot = await h.read();
    assert.equal(snapshot.turnPrompt?.type, "attack");
    if (snapshot.turnPrompt?.type !== "attack")
      throw Error("Expected attackers");
    for (const id of [h.intern, h.pawn]) {
      assert.ok(
        snapshot.turnPrompt.candidates.includes(id),
        "Human attack remains legal",
      );
      assert.equal(snapshot.presentations[id].attack, 0);
    }
    await h.advance();
    assert.deepEqual(h.f.state.combat?.attackers, [h.attacker]);
    assert.equal(h.f.state.objects[h.intern].running, false);
    assert.equal(h.f.state.objects[h.pawn].running, false);
  });
}

test("bot attacks with a zero-base character after its effective attack is buffed", async () => {
  const h = zeroAttackFixture();
  h.f.state.objects[h.pawn].counters["+1/+1"] = 1;
  const snapshot = await h.read();
  assert.equal(snapshot.presentations[h.pawn].attack, 1);
  await h.advance();
  assert.ok(h.f.state.combat?.attackers.includes(h.pawn));
  assert.ok(!h.f.state.combat?.attackers.includes(h.intern));
});

test("bot holds a positive-base character whose effective attack is reduced to zero", async () => {
  const h = zeroAttackFixture();
  Object.assign(
    h.f.state,
    addUntilTurnEndStatEffect(
      h.f.state,
      h.f.state.players[h.seat].zones.mainframe[0],
      h.attacker,
      { layer: "7a", operation: "set", attack: 0 },
      runtime.commands.combat!(h.f.state).characteristics,
    ),
  );
  assert.equal((await h.read()).presentations[h.attacker].attack, 0);
  assert.equal((await h.advance()).applied, 1);
  assert.equal(h.f.state.combat?.stage, "blockers-window");
  assert.deepEqual(h.f.state.combat?.attackers, []);
  assert.equal(h.f.state.objects[h.attacker].running, false);
});

test("bot honors a mandatory zero-attack character while holding optional zero-attack characters", async () => {
  const h = zeroAttackFixture();
  Object.assign(
    h.f.state,
    addUntilTurnEndCombatEffect(
      h.f.state,
      h.f.state.players[h.seat].zones.mainframe[0],
      h.intern,
      { kind: "must-attack" },
      runtime.commands.combat!(h.f.state).characteristics,
    ),
  );
  const snapshot = await h.read();
  assert.equal(snapshot.turnPrompt?.type, "attack");
  if (snapshot.turnPrompt?.type !== "attack") throw Error("Expected attackers");
  assert.deepEqual(snapshot.turnPrompt.required, [h.intern]);
  await h.advance();
  // Declaration membership is authoritative; policy ranking need not preserve
  // the old incidental ordering of voluntary and mandatory attackers.
  assert.deepEqual(
    new Set(h.f.state.combat?.attackers),
    new Set([h.attacker, h.intern]),
  );
  assert.equal(h.f.state.objects[h.pawn].running, false);
});

test("bot retains zero-attack characters as eligible blockers", async () => {
  const h = zeroAttackFixture();
  await h.advance();
  h.f.state.turn.activePlayer = h.other;
  h.f.state.priorityWindow = null;
  h.f.state.combat = { stage: "blockers", attackers: [h.enemy], blockers: [] };
  const snapshot = await h.read();
  assert.equal(snapshot.turnPrompt?.type, "block");
  if (snapshot.turnPrompt?.type !== "block") throw Error("Expected blockers");
  for (const id of [h.intern, h.pawn])
    assert.ok(
      snapshot.turnPrompt.blockers.some((blocker) => blocker.blockerId === id),
    );
  await h.advance();
  assert.ok(
    h.f.state.combat?.blockers.some((blocker) =>
      [h.intern, h.pawn].includes(blocker.blockerId),
    ),
  );
});

async function wonderlandFixture(
  cardName: string,
  inflation = false,
  rolls = [18],
  enemyName?: string,
) {
  const f = fixture([0, 0], 1, [
    "WONDERLAND",
    cardName,
    "THE ORACLE",
    ...(inflation ? ["ARTIFICIAL INFLATION"] : []),
    ...(rolls.length > 1 ? ["ALICE, DREAMWALKER"] : []),
  ]);
  const seat = f.state.turn.activePlayer;
  const zones = f.state.players[seat].zones;
  const find = (name: string) =>
    Object.values(f.state.objects).find(
      (o) => o.owner === seat && o.definitionVersion === f.version(name),
    )!.id;
  const source = find("WONDERLAND"),
    card = find(cardName),
    host = find("THE ORACLE");
  const protocol = inflation ? find("ARTIFICIAL INFLATION") : null;
  const alice = rolls.length > 1 ? find("ALICE, DREAMWALKER") : null;
  zones.cyberdeck = [...zones.hand, ...zones.cyberdeck].filter(
    (id) => ![source, card, host, protocol, alice].includes(id),
  );
  zones.hand = [];
  f.state.environment.push(source);
  f.state.arena.push(host);
  const hostDefinition = [...admission.definitions.values()].find(
    (pin) => pin.version === f.state.objects[host].definitionVersion,
  )!.definition.characteristics;
  assert.equal(hostDefinition.cardType, "character");
  if (hostDefinition.cardType !== "character")
    throw Error("Expected character host");
  for (const ram of zones.ramDeck.splice(
    0,
    hostDefinition.ramCost + (inflation ? 1 : 0),
  )) {
    f.state.arena.push(ram);
    f.state.objects[ram].attachments = [{ kind: "ram", hostId: host }];
  }
  if (protocol) {
    f.state.arena.push(protocol);
    f.state.objects[protocol].attachments = [
      { kind: "protocol", hostId: zones.mainframe[0] },
    ];
  }
  if (alice) {
    f.state.arena.push(alice);
    const definition = [...admission.definitions.values()].find(
      (pin) => pin.version === f.state.objects[alice].definitionVersion,
    )!.definition.characteristics;
    if (definition.cardType !== "character")
      throw Error("Expected Alice character");
    for (const ram of zones.ramDeck.splice(0, definition.ramCost)) {
      f.state.arena.push(ram);
      f.state.objects[ram].attachments = [{ kind: "ram", hostId: alice }];
    }
  }
  zones.ramBank.push(...zones.ramDeck.splice(0, 6));
  zones.cyberdeck.unshift(card);
  const other = seat === 0 ? 1 : 0;
  const enemy = enemyName
    ? Object.values(f.state.objects).find(
        (o) =>
          o.owner === other && o.definitionVersion === f.version(enemyName),
      )!.id
    : undefined;
  if (enemy) {
    const opponent = f.state.players[other].zones;
    opponent.hand = opponent.hand.filter((id) => id !== enemy);
    opponent.cyberdeck = opponent.cyberdeck.filter((id) => id !== enemy);
    f.state.arena.push(enemy);
    const definition = [...admission.definitions.values()].find(
      (pin) => pin.version === f.state.objects[enemy].definitionVersion,
    )!.definition.characteristics;
    if (definition.cardType !== "character")
      throw Error("Expected enemy character");
    for (const ram of opponent.ramDeck.splice(0, definition.ramCost)) {
      f.state.arena.push(ram);
      f.state.objects[ram].attachments = [{ kind: "ram", hostId: enemy }];
    }
  }
  f.state.turn.step = "netcheck";
  f.state.priorityWindow = null;
  let found = false;
  for (let seed = 0; seed < 100000; seed++) {
    const random = initialRandomState(seed.toString(16).padStart(64, "0"));
    let next = random;
    if (
      rolls.every((value) => {
        const roll = rollD20(next);
        next = roll.state;
        return roll.value === value;
      })
    ) {
      f.state.random = random;
      found = true;
      break;
    }
  }
  assert.ok(found, "Seed produces the requested Wonderland rolls");
  f.state.pendingRuleEvents.push({
    type: "netcheck-started",
    ...captureEventObservation(f.state),
    player: seat,
  });
  Object.assign(f.state, runtime.commands.settle(f.state));
  assert.equal(f.state.pendingDecision?.type, "optional-trigger");
  await advanceBot(f.store, f.resolve, f.mid, f.ids[seat], f.books[seat], 1);
  assert.equal(f.state.pendingDecision?.type, "wonderland");
  return { f, seat, card, host, enemy };
}

test("Wonderland bot keeps a beneficial INVERT after Alice's second roll", async () => {
  const { f, seat, enemy } = await wonderlandFixture(
    "METAL HEAD",
    false,
    [9, 9],
    "METAL HEAD",
  );
  assert.ok(enemy);
  const snapshot = await readMatchBattlefield(
    f.store,
    f.resolve,
    f.mid,
    f.ids[seat],
  );
  const channel = snapshot.presentations[enemy].attackType;
  assert.ok(channel);
  f.state.players[seat].mainframeHealth = channel === "MF" ? 5 : 20;
  f.state.players[seat].bioframeHealth = channel === "BF" ? 5 : 20;
  await advanceBot(f.store, f.resolve, f.mid, f.ids[seat], f.books[seat], 1);
  assert.equal(f.state.objects[enemy].counters.INVERT, 1);
  assert.equal(f.state.pendingDecision?.type, "wonderland");
  await advanceBot(f.store, f.resolve, f.mid, f.ids[seat], f.books[seat], 1);
  assert.equal(f.state.pendingDecision, null);
  assert.equal(
    f.state.objects[enemy].counters.INVERT,
    1,
    "The second roll must skip rather than restore the enemy's threatening attack channel",
  );
});

for (const example of [
  {
    name: "redirects an enemy away from the weaker frame",
    enemy: true,
    counters: 0,
    mf: 20,
    bf: 5,
    expected: 1,
  },
  {
    name: "removes enemy INVERT when that reduces pressure",
    enemy: true,
    counters: 1,
    mf: 5,
    bf: 20,
    expected: 0,
  },
  {
    name: "holds an enemy on the healthier frame",
    enemy: true,
    counters: 0,
    mf: 5,
    bf: 20,
    expected: 0,
  },
  {
    name: "redirects a friendly character toward the weaker frame",
    enemy: false,
    counters: 0,
    mf: 20,
    bf: 5,
    expected: 1,
  },
  {
    name: "removes friendly INVERT to pressure the weaker frame",
    enemy: false,
    counters: 1,
    mf: 5,
    bf: 20,
    expected: 0,
  },
  {
    name: "holds a friendly character on the weaker frame",
    enemy: false,
    counters: 0,
    mf: 5,
    bf: 20,
    expected: 0,
  },
  {
    name: "skips when both frames have equal health",
    enemy: false,
    counters: 0,
    mf: 20,
    bf: 20,
    expected: 0,
  },
]) {
  test(`Wonderland bot ${example.name}`, async () => {
    const { f, seat, host, enemy } = await wonderlandFixture(
      "METAL HEAD",
      false,
      [9],
      example.enemy ? "METAL HEAD" : undefined,
    );
    const target = example.enemy ? enemy! : host;
    f.state.objects[target].counters.INVERT = example.counters;
    const defender = f.state.players[example.enemy ? seat : seat === 0 ? 1 : 0];
    defender.mainframeHealth = example.mf;
    defender.bioframeHealth = example.bf;
    await advanceBot(f.store, f.resolve, f.mid, f.ids[seat], f.books[seat], 1);
    assert.equal(f.state.pendingDecision, null);
    assert.equal(
      f.state.objects[target].counters.INVERT ?? 0,
      example.expected,
    );
  });
}

test("Wonderland bot completes Alice's high roll before answering INVERT", async () => {
  const { f, seat, card } = await wonderlandFixture(
    "SCAVENGER",
    false,
    [18, 8],
  );
  await advanceBot(f.store, f.resolve, f.mid, f.ids[seat], f.books[seat], 1);
  assert.ok(f.state.cache.includes(card));
  assert.equal(f.state.random.counter, 2);
  assert.equal(
    f.state.pendingDecision?.type === "wonderland" &&
      f.state.pendingDecision.stage,
    "invert",
  );
  assert.equal(
    (await advanceBot(f.store, f.resolve, f.mid, f.ids[seat], f.books[seat], 1))
      .applied,
    1,
  );
  assert.equal(f.state.pendingDecision, null);
});

test("Wonderland bot still answers a low-roll destroy choice", async () => {
  const { f, seat, host } = await wonderlandFixture("SCAVENGER", false, [2]);
  assert.equal(
    (await advanceBot(f.store, f.resolve, f.mid, f.ids[seat], f.books[seat], 1))
      .applied,
    1,
  );
  assert.equal(f.state.pendingDecision, null);
  assert.ok(f.state.players[seat].zones.recycleBin.includes(host));
});

for (const cardName of [
  "SCAVENGER",
  "NEURAL DISRUPTOR",
  "FIREWALL",
  "ANTIVIRUS",
  "BINARY BLAST",
]) {
  for (const inflation of [false, true]) {
    test(`Wonderland bot plays ${cardName}${inflation ? " with a cost modifier" : ""} without stalling`, async () => {
      const { f, seat, card, host } = await wonderlandFixture(
        cardName,
        inflation,
      );
      const other = seat === 0 ? 1 : 0;
      assert.equal(
        (
          await advanceBot(
            f.store,
            f.resolve,
            f.mid,
            f.ids[other],
            f.books[other],
            1,
          )
        ).applied,
        0,
      );
      const revision = f.state.revision;
      const result = await advanceBot(
        f.store,
        f.resolve,
        f.mid,
        f.ids[seat],
        f.books[seat],
        1,
      );
      assert.equal(result.applied, 1);
      assert.ok(f.state.revision > revision);
      assert.equal(f.state.pendingDecision, null);
      assert.ok(f.state.cache.includes(card));
      assert.equal(
        f.state.players[seat].zones.ramBank.filter(
          (id) => f.state.objects[id].running,
        ).length,
        inflation && cardName !== "SCAVENGER" ? 1 : 0,
      );
      if (cardName === "SCAVENGER")
        assert.equal(
          Object.values(f.state.objects).filter((object) =>
            object.attachments.some(
              (attachment) =>
                attachment.kind === "ram" && attachment.hostId === card,
            ),
          ).length,
          inflation ? 1 : 0,
        );
      for (let step = 0; step < 12 && f.state.cache.includes(card); step++) {
        for (let actor = 0; actor < 2; actor++)
          await advanceBot(
            f.store,
            f.resolve,
            f.mid,
            f.ids[actor],
            f.books[actor],
            1,
          );
      }
      assert.ok(
        !f.state.cache.includes(card),
        "Both seats can continue through resolution",
      );
      if (cardName === "NEURAL DISRUPTOR")
        assert.equal(f.state.objects[card].attachments[0]?.hostId, host);
    });
  }
}

function combatChoiceFixture(ownNames: string[], enemyNames: string[]) {
  const f = fixture([0, 0], 1, [...ownNames, ...enemyNames]);
  const seat = f.state.turn.activePlayer;
  const other: 0 | 1 = seat === 0 ? 1 : 0;
  for (const player of f.state.players) {
    player.zones.cyberdeck.push(...player.zones.hand);
    player.zones.hand = [];
  }
  function board(name: string, owner: 0 | 1) {
    const zones = f.state.players[owner].zones;
    const id = zones.cyberdeck.find(
      (id) => f.state.objects[id].definitionVersion === f.version(name),
    )!;
    assert.ok(id, name);
    zones.cyberdeck = zones.cyberdeck.filter((c) => c !== id);
    f.state.arena.push(id);
    const card = [...admission.definitions.values()].find(
      (p) => p.version === f.version(name),
    )!.definition.characteristics;
    if (card.cardType !== "character") throw Error("Expected character");
    for (const ram of zones.ramDeck.splice(0, card.ramCost)) {
      f.state.arena.push(ram);
      f.state.objects[ram].attachments = [{ kind: "ram", hostId: id }];
    }
    return id;
  }
  const friends = ownNames.map((name) => board(name, seat));
  const enemies = enemyNames.map((name) => board(name, other));
  f.state.turn.number = 2;
  f.state.turn.step = "combat";
  f.state.priorityWindow = null;
  f.state.combat = { stage: "attackers", attackers: [], blockers: [] };
  Object.assign(f.state, runtime.commands.settle(f.state));
  const book = readBotPlaybook(null, "combat-regression");
  book.aggression = 1;
  const read = () =>
    readMatchBattlefield(f.store, f.resolve, f.mid, f.ids[seat], {
      botCombat: true,
    });
  const advance = () =>
    advanceBot(f.store, f.resolve, f.mid, f.ids[seat], book, 1);
  const effect = (
    id: string,
    change: Parameters<typeof addUntilTurnEndCombatEffect>[3],
  ) => {
    Object.assign(
      f.state,
      addUntilTurnEndCombatEffect(
        f.state,
        friends[0],
        id,
        change,
        runtime.commands.combat(f.state).characteristics,
      ),
    );
  };
  return { f, seat, other, friends, enemies, book, read, advance, effect };
}

for (const channel of ["MF", "BF"] as const) {
  test(`combat policy reserves a blocker against lethal ${channel} after the opponent refreshes`, async () => {
    const h = combatChoiceFixture(
      ["DUST DEVIL INITIATE", "DUST DEVIL INITIATE"],
      [channel === "MF" ? "DUST DEVIL INITIATE" : "VIRTUAL KID"],
    );
    h.f.state.players[h.seat][
      channel === "MF" ? "mainframeHealth" : "bioframeHealth"
    ] = 1;
    h.f.state.objects[h.enemies[0]].running = true;
    const snapshot = await h.read();
    assert.equal(
      snapshot.botCombat?.reply.find((c) => c.id === h.enemies[0])?.running,
      false,
    );
    await h.advance();
    assert.equal(
      h.f.state.combat?.attackers.length,
      1,
      "hybrid attack retains one useful blocker",
    );
    assert.equal(
      h.friends.filter((id) => !h.f.state.objects[id].running).length,
      1,
    );
  });
}

test("combat policy holds its only blocker rather than making a losing chip attack", async () => {
  const h = combatChoiceFixture(
    ["DUST DEVIL INITIATE"],
    ["DUST DEVIL INITIATE"],
  );
  h.f.state.players[h.seat].mainframeHealth = 2;
  h.f.state.objects[h.enemies[0]].running = true;
  await h.advance();
  assert.deepEqual(h.f.state.combat?.attackers, []);
});

test("combat policy takes a full-scale immediate win despite a lethal counterattack", async () => {
  const h = combatChoiceFixture(
    ["DUST DEVIL INITIATE", "DUST DEVIL INITIATE"],
    ["DUST DEVIL INITIATE"],
  );
  h.f.state.players[h.seat].mainframeHealth = 2;
  h.f.state.players[h.other].mainframeHealth = 4;
  h.f.state.objects[h.enemies[0]].running = true;
  await h.advance();
  assert.deepEqual(new Set(h.f.state.combat?.attackers), new Set(h.friends));
  // Resolve real priority windows and damage through the service, rather than merely
  // checking the policy's arithmetic prediction.
  for (let i = 0; i < 12 && !h.f.state.outcome; i++) {
    let acted = false;
    for (const actor of h.f.ids) {
      const snapshot = await readMatchBattlefield(
        h.f.store,
        h.f.resolve,
        h.f.mid,
        actor,
      );
      const prompt = snapshot.turnPrompt;
      if (!prompt) continue;
      const action =
        prompt.type === "pass"
          ? { type: "pass" as const }
          : prompt.type === "block"
            ? { type: "block" as const, assignments: [] }
            : prompt.type === "assign-damage"
              ? { type: "assign-damage" as const, splits: [] }
              : null;
      if (!action) continue;
      await submitMatchCommand(
        h.f.store,
        h.f.resolve,
        h.f.mid,
        actor,
        randomUUID(),
        { expectedRevision: snapshot.view.revision, action },
      );
      acted = true;
      break;
    }
    assert.ok(acted || h.f.state.outcome, "combat can progress");
  }
  assert.equal(h.f.state.outcome?.type, "win");
  if (h.f.state.outcome?.type === "win")
    assert.equal(h.f.state.outcome.winner, h.seat);
});

test("combat policy keeps attacking when the opposing frame is not threatened", async () => {
  const h = combatChoiceFixture(
    ["DUST DEVIL INITIATE", "DUST DEVIL INITIATE"],
    ["DUST DEVIL INITIATE"],
  );
  h.f.state.objects[h.enemies[0]].running = true;
  await h.advance();
  assert.equal(h.f.state.combat?.attackers.length, 2);
});

test("combat policy does not combine MF and BF damage into a false immediate win", async () => {
  const h = combatChoiceFixture(
    ["DUST DEVIL INITIATE", "VIRTUAL KID"],
    ["DUST DEVIL INITIATE"],
  );
  h.f.state.players[h.seat].mainframeHealth = 2;
  h.f.state.players[h.other].mainframeHealth = 3;
  h.f.state.players[h.other].bioframeHealth = 3;
  h.f.state.objects[h.enemies[0]].running = true;
  await h.advance();
  assert.equal(h.f.state.combat?.attackers.length, 1);
});

test("combat policy uses STAMINA attackers without needlessly reserving another blocker", async () => {
  const h = combatChoiceFixture(
    ["DUST DEVIL INITIATE", "DUST DEVIL INITIATE"],
    ["DUST DEVIL INITIATE"],
  );
  h.f.state.players[h.seat].mainframeHealth = 2;
  h.f.state.objects[h.enemies[0]].running = true;
  h.effect(h.friends[0], { kind: "grant-keyword", keyword: "STAMINA" });
  await h.advance();
  assert.equal(h.f.state.combat?.attackers.length, 2);
  assert.equal(h.f.state.objects[h.friends[0]].running, false);
});

test("combat policy retains required attackers even when defence would be safer", async () => {
  const h = combatChoiceFixture(
    ["DUST DEVIL INITIATE"],
    ["DUST DEVIL INITIATE"],
  );
  h.f.state.players[h.seat].mainframeHealth = 2;
  h.f.state.objects[h.enemies[0]].running = true;
  h.effect(h.friends[0], { kind: "must-attack" });
  await h.advance();
  assert.deepEqual(h.f.state.combat?.attackers, h.friends);
});

test("combat assessment is opt-in, does not mutate saved state, and ignores hidden draw order", async () => {
  const h = combatChoiceFixture(
    ["DUST DEVIL INITIATE", "DUST DEVIL INITIATE"],
    ["DUST DEVIL INITIATE"],
  );
  const before = structuredClone(h.f.state);
  const plain = await readMatchBattlefield(
    h.f.store,
    h.f.resolve,
    h.f.mid,
    h.f.ids[h.seat],
  );
  assert.equal(plain.botCombat, undefined);
  const first = await h.read();
  assert.deepEqual(h.f.state, before);
  assert.ok(first.botCombat);
  h.f.state.players[h.other].zones.cyberdeck.reverse();
  const next = await h.read();
  assert.deepEqual(first.botCombat, next.botCombat);
  assert.deepEqual(
    botCandidates(first, h.book, first.botCombat),
    botCandidates(next, h.book, next.botCombat),
  );
});

test("combat policy considers current enemy blocks before claiming a winning attack", async () => {
  const h = combatChoiceFixture(
    ["DUST DEVIL INITIATE", "DUST DEVIL INITIATE"],
    ["DUST DEVIL INITIATE"],
  );
  h.f.state.players[h.seat].mainframeHealth = 3;
  h.f.state.players[h.other].mainframeHealth = 4;
  h.f.state.objects[h.enemies[0]].counters["+1/+1"] = 1;
  const snapshot = await h.read();
  const plans = botCandidates(snapshot, h.book, snapshot.botCombat);
  assert.ok(
    plans.every((p) => p.score < 10_000_000),
    "the ready blocker prevents an immediate win",
  );
  await h.advance();
  assert.ok(
    h.f.state.combat!.attackers.length < 2,
    "retain defence against the surviving 3/3",
  );
});

test("combat policy reserves enough defence against Overrun instead of trusting one chump", async () => {
  const h = combatChoiceFixture(
    ["DUST DEVIL INITIATE", "DUST DEVIL INITIATE", "DUST DEVIL INITIATE"],
    ["BOONYEN, WARDRIVER"],
  );
  h.f.state.players[h.seat].bioframeHealth = 4;
  h.f.state.objects[h.enemies[0]].running = true;
  await h.advance();
  assert.ok(
    h.f.state.combat!.attackers.length <= 1,
    "at least two blockers are needed: one lets lethal excess through",
  );
});

test("combat assessment expires temporary block restrictions and attack buffs before the reply", async () => {
  const h = combatChoiceFixture(
    ["DUST DEVIL INITIATE", "DUST DEVIL INITIATE"],
    ["DUST DEVIL INITIATE"],
  );
  h.f.state.players[h.seat].mainframeHealth = 3;
  h.f.state.objects[h.enemies[0]].running = true;
  h.effect(h.friends[0], { kind: "cannot-block" });
  Object.assign(
    h.f.state,
    addUntilTurnEndStatEffect(
      h.f.state,
      h.friends[0],
      h.enemies[0],
      { layer: "7b", operation: "add", attack: 10 },
      runtime.commands.combat(h.f.state).characteristics,
    ),
  );
  const snapshot = await h.read();
  assert.equal(
    snapshot.botCombat?.now.find((c) => c.id === h.enemies[0])?.attack,
    12,
  );
  assert.equal(
    snapshot.botCombat?.reply.find((c) => c.id === h.enemies[0])?.attack,
    2,
  );
  assert.ok(
    !snapshot.botCombat?.now
      .find((c) => c.id === h.friends[0])
      ?.blocks.includes(h.enemies[0]),
  );
  assert.ok(
    snapshot.botCombat?.reply
      .find((c) => c.id === h.friends[0])
      ?.blocks.includes(h.enemies[0]),
  );
  await h.advance();
  assert.ok(
    h.f.state.combat!.attackers.length > 0,
    "the expired attack buff does not force an all-hold decision",
  );
});

test("combat policy actually blocks the threatened frame before a larger harmless attack", async () => {
  const h = combatChoiceFixture(
    ["UNPAID INTERN"],
    ["DUST DEVIL INITIATE", "VIRTUAL KID"],
  );
  h.f.state.players[h.seat].mainframeHealth = 1;
  h.f.state.objects[h.enemies[1]].counters["+1/+1"] = 3;
  h.f.state.turn.activePlayer = h.other;
  h.f.state.combat = { stage: "blockers", attackers: h.enemies, blockers: [] };
  await h.advance();
  assert.deepEqual(h.f.state.combat?.blockers, [
    { blockerId: h.friends[0], attackerId: h.enemies[0] },
  ]);
});

test("combat policy reserves the VISION blocker against persistent STEALTH", async () => {
  const h = combatChoiceFixture(
    ["DUST DEVIL INITIATE", "DUST DEVIL INITIATE"],
    ["DUST DEVIL INITIATE"],
  );
  h.f.state.players[h.seat].mainframeHealth = 2;
  h.f.state.objects[h.enemies[0]].running = true;
  for (const [id, keyword] of [
    [h.enemies[0], "STEALTH"],
    [h.friends[0], "VISION"],
  ] as const)
    Object.assign(
      h.f.state,
      addSourceBoundKeywordEffect(
        h.f.state,
        id,
        id,
        keyword,
        runtime.commands.combat(h.f.state).characteristics,
      ),
    );
  const snapshot = await h.read();
  assert.ok(
    snapshot.botCombat?.reply
      .find((c) => c.id === h.friends[0])
      ?.blocks.includes(h.enemies[0]),
  );
  assert.ok(
    !snapshot.botCombat?.reply
      .find((c) => c.id === h.friends[1])
      ?.blocks.includes(h.enemies[0]),
  );
  await h.advance();
  assert.deepEqual(h.f.state.combat?.attackers, [h.friends[1]]);
});

test("bot combat resolves Bloodletter damage after its host dies", async () => {
  const h = combatChoiceFixture(["DEBT COLLECTOR"], ["BADLANDS INFANTRY"]);
  const zones = h.f.state.players[h.other].zones;
  const gear = zones.cyberdeck.shift()!;
  h.f.state.objects[gear].definitionVersion = h.f.version("AEKANI BLOODLETTER");
  h.f.state.objects[gear].attachments = [
    { kind: "gear", hostId: h.enemies[0], port: "leftArm" },
  ];
  h.f.state.arena.push(gear);
  h.f.state.objects[h.friends[0]].running = true;
  h.f.state.combat = {
    stage: "damage",
    attackers: h.friends,
    blockers: [{ blockerId: h.enemies[0], attackerId: h.friends[0] }],
  };
  assert.equal((await h.advance()).applied, 1);
  for (
    let i = 0;
    i < 8 && h.f.state.players[h.other].bioframeHealth === 20;
    i++
  )
    for (const actor of h.f.ids)
      await advanceBot(h.f.store, h.f.resolve, h.f.mid, actor, h.book, 1);
  assert.equal(h.f.state.players[h.other].bioframeHealth, 20);
  assert.equal(h.f.state.pendingTriggers.length, 0);
  assert.equal(h.f.state.priorityWindow?.stack.length ?? 0, 0);
  assert.equal(
    h.f.state.objects[h.friends[0]].counters.BLEED ?? 0,
    0,
    "the departed damaged character is no longer a valid BLEED recipient",
  );
  assert.ok(h.f.state.players[h.seat].zones.recycleBin.includes(h.friends[0]));
  assert.ok(h.f.state.players[h.other].zones.recycleBin.includes(h.enemies[0]));
  assert.ok(h.f.state.players[h.other].zones.recycleBin.includes(gear));
});

test("combat policy attacks instead of waiting for a favorable counterattack the opponent can decline", async () => {
  const h = combatChoiceFixture(
    ["DUST DEVIL INITIATE"],
    ["DUST DEVIL INITIATE"],
  );
  h.f.state.objects[h.friends[0]].counters["+1/+1"] = 1;
  h.f.state.objects[h.enemies[0]].running = true;
  await h.advance();
  assert.deepEqual(
    h.f.state.combat?.attackers,
    h.friends,
    "a safe 3-strength attack beats waiting for the opposing 2/2 to attack into it",
  );
});

test("combat assessment excludes a blocker whose defence expires to zero", async () => {
  const h = combatChoiceFixture(
    ["DUST DEVIL INITIATE", "DUST DEVIL INITIATE"],
    ["DUST DEVIL INITIATE"],
  );
  h.f.state.players[h.seat].mainframeHealth = 1;
  h.f.state.objects[h.enemies[0]].running = true;
  const temporary = h.friends[0];
  h.f.state.objects[temporary].counters["-1/-1"] = 2;
  Object.assign(
    h.f.state,
    addUntilTurnEndStatEffect(
      h.f.state,
      temporary,
      temporary,
      { layer: "7b", operation: "add", attack: 2, defence: 2 },
      runtime.commands.combat(h.f.state).characteristics,
    ),
  );
  const snapshot = await h.read();
  assert.equal(snapshot.presentations[temporary].defence, 2);
  assert.ok(
    !snapshot.botCombat?.reply.some((c) => c.id === temporary),
    "zero-defence characters leave play during cleanup and cannot protect the following turn",
  );
  await h.advance();
  assert.deepEqual(h.f.state.combat?.attackers, [temporary]);
});
