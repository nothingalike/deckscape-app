import test from "node:test";
import assert from "node:assert/strict";
import {
  createEngineRuntime,
  type EngineRuntimeBindings,
} from "../src/deckscape/lib/simulator/engine-runtime";
import { resolveCacheAction } from "../src/deckscape/lib/simulator/cache-resolution";
import { bindPrograms } from "../src/deckscape/lib/simulator/program-bindings";
import specs from "../src/deckscape/lib/simulator/program-specifications-v1.json";
import environmentSpecs from "../src/deckscape/lib/simulator/environment-specifications-v1.json";
import protocolSpecs from "../src/deckscape/lib/simulator/protocol-specifications-v1.json";
import {
  resolveEnvironmentEntry,
  destroyEnvironment,
} from "../src/deckscape/lib/simulator/environment";
import {
  versionDefinition,
  type EngineManifest,
} from "../src/deckscape/lib/simulator/definition-version";
import { characteristicsSchema } from "../src/deckscape/lib/simulator/characteristics";
import { createSetup } from "../src/deckscape/lib/simulator/setup";
import { initialRandomState } from "../src/deckscape/lib/simulator/random";
import { gameFromSetup } from "../src/deckscape/lib/simulator/game-state";
import { resolveCharacterEntry } from "../src/deckscape/lib/simulator/play-character";
import {
  dispatchGameCommand,
  type GameCommand,
} from "../src/deckscape/lib/simulator/commands";
import { projectTurnPrompt } from "../src/deckscape/lib/simulator/project-turn-prompt";
import { projectGame } from "../src/deckscape/lib/simulator/game-view";
import { projectCharacterPlays } from "../src/deckscape/lib/simulator/project-character-plays";
import { projectProgramPlays } from "../src/deckscape/lib/simulator/project-program-plays";
import { quoteProgramPlay } from "../src/deckscape/lib/simulator/program-quote";
import { applyPersistentDepartureBatch } from "../src/deckscape/lib/simulator/destruction";
import { applyHealthChanges, applyHealthLosses } from "../src/deckscape/lib/simulator/health";
import { neuroscapeFactionsV1 } from "../src/deckscape/lib/simulator/factions-v1";
import { projectSavedDecision } from "../src/deckscape/lib/simulator/project-decision";
import { projectBattlefield } from "../src/deckscape/lib/simulator/battlefield-presentation";
import { battlefieldSnapshotSchema } from "../src/deckscape/lib/simulator/battlefield-response";
import { drawCards, installOne } from "../src/deckscape/lib/simulator/resource-effects";
import { openPriority } from "../src/deckscape/lib/simulator/priority";
import { novaLucidity } from "../src/deckscape/lib/simulator/resolve-ability";
import { evaluatePlayerSynergy } from "../src/deckscape/lib/simulator/synergy";
import { bindMainframePassives } from "../src/deckscape/lib/simulator/mainframe-passive-bindings";
import mainframeSpecs from "../src/deckscape/lib/simulator/mainframe-passive-specifications-v1.json";
import { applyCharacterStatLayers } from "../src/deckscape/lib/simulator/stat-layers";
import { resolveGearEntry } from "../src/deckscape/lib/simulator/play-gear";
import { projectGearPlays } from "../src/deckscape/lib/simulator/project-gear-plays";
import { applyDamageBatch } from "../src/deckscape/lib/simulator/damage-batch";
import { changePersistentStatus } from "../src/deckscape/lib/simulator/persistent-status";
import { removeAllMainframeCounters } from "../src/deckscape/lib/simulator/remove-mainframe-counters";
import { createDepartureRuntime } from "../src/deckscape/lib/simulator/departure-runtime";
import { bindDustDevilVultures } from "../src/deckscape/lib/simulator/dust-devil-vultures";
import mirageSpec from "../src/deckscape/lib/simulator/dust-devil-vultures-specification-v1.json";
import { applyTimedDamagePrevention } from "../src/deckscape/lib/simulator/timed-damage-prevention";
import { moveSearchedCardToHand } from "../src/deckscape/lib/simulator/past-life";
import { binCyberdeckCards } from "../src/deckscape/lib/simulator/top-cards";
import { baseCardD20 } from "../src/deckscape/lib/simulator/generational-wealth";
import { revealHand, discardHandCard } from "../src/deckscape/lib/simulator/hand-effects";
import {
  basePsychosisRoll,
  resolvePsychosisSelfHits,
} from "../src/deckscape/lib/simulator/psychosis";
import {
  combatKeywordRules,
  type CombatKeyword,
} from "../src/deckscape/lib/simulator/combat-keywords";

function fixture(withSynthetix = false, programKind = "moon-flower-cactus") {
  const spec = [...specs, ...environmentSpecs, ...protocolSpecs].find(
    (s) => s.kind === programKind,
  )!;
  const engine: EngineManifest = {
    version: "composed-fixture-v1",
    handlers: new Map([
      [spec.handlerId, new Set([1])],
      [mainframeSpecs[0].handlerId, new Set([1])],
    ]),
    implementedCards: new Set([spec.cardId]),
    verifiedCards: new Set(),
  };
  const pin = versionDefinition(
    {
      schemaVersion: 1,
      cardId: spec.cardId,
      engineVersion: engine.version,
      rulesVersion: "1.00",
      characteristics: spec.characteristics,
      support: "implemented",
      handlers: [{ id: spec.handlerId, version: 1, parameters: {} }],
    },
    engine,
  );
  const common = {
    name: "Fixture",
    factions: [],
    tags: [],
    iconic: false,
    rulesText: "",
    copiesLimit: 4,
  };
  const character = characteristicsSchema.parse({
    ...common,
    cardType: "character",
    factions:
      programKind === "market-manipulation" ||
      programKind === "genocide" ||
      programKind === "generational-wealth" ||
      programKind === "insurance-policy"
        ? ["CORPO"]
        : programKind.startsWith("overload-") ||
            programKind === "quantum-encryption" ||
            programKind === "phishing" ||
            programKind === "system-error"
          ? ["HACKER"]
          : withSynthetix
            ? ["DUSTRUNNER", "CYBERNETIC"]
            : ["DUSTRUNNER"],
    ramCost: 1,
    requirements: {},
    activatedAbilities: [],
    attack: 2,
    defence: 2,
    attackType: "BF",
    ports: { head: withSynthetix ? 1 : 0, body: 0, leftArm: 0, rightArm: 0 },
  });
  const ram = characteristicsSchema.parse({
    ...common,
    cardType: "ram",
    isBasicRam: true,
  });
  const mainframe = characteristicsSchema.parse({
    ...common,
    cardType: "mainframe",
    prefix: "",
    tiers: [
      {
        persistents: 0,
        factions: {},
        operator: "base",
        text: "No fixture effects",
      },
    ],
  });
  const mainframePin = versionDefinition(
    {
      schemaVersion: 1,
      cardId: mainframeSpecs[0].cardId,
      engineVersion: engine.version,
      rulesVersion: "1.00",
      characteristics: mainframeSpecs[0].characteristics,
      support: "unimplemented",
      handlers: [
        { id: mainframeSpecs[0].handlerId, version: 1, parameters: {} },
      ],
    },
    engine,
  );
  const cyberwareCard = characteristicsSchema.parse({
    ...common,
    cardType: "gear",
    factions: ["CYBERNETIC"],
    subtype: "cyberware",
    ramCost: 0,
    requirements: {},
    activatedAbilities: [],
    ports: { head: 1, body: 0, leftArm: 0, rightArm: 0 },
  });
  const definitions = new Map([
    ["a".repeat(64), mainframe],
    ["b".repeat(64), character],
    ["c".repeat(64), ram],
    [pin.version, pin.definition.characteristics],
    [mainframePin.version, mainframePin.definition.characteristics],
    ["d".repeat(64), cyberwareCard],
  ]);
  const deck = {
    mainframe: withSynthetix ? mainframePin.version : "a".repeat(64),
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
  const state = gameFromSetup(setup, engine.version, "1.00");
  const [hero, program] = state.players[0].zones.cyberdeck.splice(0, 2);
  state.players[0].zones.hand.push(hero, program);
  state.objects[program].definitionVersion = pin.version;
  const cyberware = withSynthetix
    ? state.players[0].zones.cyberdeck.shift()!
    : null;
  if (cyberware) {
    state.players[0].zones.hand.push(cyberware);
    state.objects[cyberware].definitionVersion = "d".repeat(64);
  }
  // A reduced-health fixture keeps the complete combat outcome test bounded.
  state.players[1].bioframeHealth = 6;
  const unavailable = () => {
    throw new Error("This fixture has no such card effect");
  };
  const beforeStats = (s: typeof state) =>
    new Map(
      Object.values(s.objects).map((o) => [
        o.id,
        definitions.get(o.definitionVersion)!,
      ]),
    );
  const mainframePassives = bindMainframePassives(
    withSynthetix ? [mainframePin] : [],
    engine,
    "1.00",
    { hasAbility: () => true },
  );
  const characteristics = (s: typeof state) => {
    const cards = beforeStats(s);
    return applyCharacterStatLayers(
      s,
      cards,
      mainframePassives.statEffects(s, cards),
    );
  };
  const attachment = (s: typeof state) => ({
    characteristics: characteristics(s),
    malicious: false,
    tether: false,
    permittedHosts: new Set(s.arena),
  });
  const departures: ReturnType<typeof createDepartureRuntime> =
    createDepartureRuntime({
      characteristics,
      replace: (snapshot, intents) => ({
        state: snapshot,
        departures: intents,
      }),
      ramReturnsRefreshed: (snapshot, intent) =>
        programs.ramReturnsRefreshed(snapshot, intent),
    });
  const programs = bindPrograms([pin], engine, "1.00", {
    combTheDesert: {
      canRun: () => true,
      psychosis: {
        characteristics,
        value: () => 0,
        roll: basePsychosisRoll,
        hitControllers: (s, failures) =>
          resolvePsychosisSelfHits(s, failures, (snapshot, packets) =>
            applyDamageBatch(
              snapshot,
              packets.map((p) => ({ ...p, prevented: 0 })),
              characteristics(snapshot),
            ),
          ),
      },
    },
    phishing: {
      canTargetPlayer: () => true,
      reveal: (s, sourceId, player) =>
        revealHand(s, sourceId, player, characteristics(s)),
      discard: discardHandCard,
    },
    play: (s, id) => {
      const card = definitions.get(s.objects[id].definitionVersion)!;
      if (card.cardType !== "program") throw new Error("Wrong fixture source");
      return {
        definitions,
        allowed: true,
        swift: card.swift,
        ramCost: card.ramCost,
        synergy: evaluatePlayerSynergy(s, characteristics(s))[0].factions,
      };
    },
    allowReversed: () => false,
    characteristics,
    canTarget: () => true,
    protocols: {
      roll: baseCardD20,
      install: (s, _sourceId, player, running) =>
        installOne(s, player, { definitions, prohibited: false, running }),
      hasAbility: () => true,
      damage: (s, packets) =>
        applyDamageBatch(
          s,
          applyTimedDamagePrevention(
            s,
            packets.map((packet) => ({ ...packet, prevented: 0 })),
            true,
          ),
          characteristics(s),
        ),
    },
    environments: {
      topCards: { moveToHand: moveSearchedCardToHand, bin: binCyberdeckCards },
      install: (s, _sourceId, player, running) =>
        installOne(s, player, { prohibited: false, running, definitions }),
      hasAbility: () => true,
      damage: (s, packets) =>
        applyDamageBatch(
          s,
          applyTimedDamagePrevention(
            s,
            packets.map((packet) => ({ ...packet, prevented: 0 })),
            true,
          ),
          characteristics(s),
        ),
      gainHealth: (s, sourceId, player, amount) =>
        applyHealthChanges(
          s,
          sourceId,
          (["MF", "BF"] as const).map((channel) => ({
            player,
            channel,
            amount,
            operation: "gain",
            cause: "effect",
          })),
        ),
      draw: (s, _sourceId, player, count) =>
        drawCards(s, player, count, {
          additionalCards: 0,
          prohibited: () => false,
        }),
    },
    genocide: {
      factions: () => neuroscapeFactionsV1,
      destroyCharacters: (s, sourceId, ids) =>
        departures.depart(
          s,
          ids.map((id) => ({
            id,
            kind: "destroy",
            sourceId,
            reason: "normal",
          })),
        ),
      loseHealth: (s, sourceId, player, amount) =>
        applyHealthChanges(
          s,
          sourceId,
          (["MF", "BF"] as const).map((channel) => ({
            player,
            channel,
            amount,
            operation: "lose",
            cause: "effect",
          })),
        ),
    },
    removeMainframeCounters: (s, sourceId, player) =>
      removeAllMainframeCounters(s, sourceId, player, characteristics(s)),
    destroy: (s, sourceId, targetId) =>
      departures.destroy(s, sourceId, targetId),
    runCharacters: (s, sourceId, ids) =>
      changePersistentStatus(
        s,
        sourceId,
        ids.map((instanceId) => ({ instanceId, operation: "run" })),
        { allowed: () => true },
      ),
    damage: {
      canTargetPlayer: () => true,
      damage: (s, packets) =>
        applyDamageBatch(
          s,
          applyTimedDamagePrevention(
            s,
            packets.map((packet) => ({ ...packet, prevented: 0 })),
            true,
          ),
          characteristics(s),
        ),
    },
    counter: unavailable,
  });
  const resources = {
    draw: (s: typeof state, p: 0 | 1, count: number) =>
      drawCards(s, p, count, {
        additionalCards: 0,
        prohibited: () => false,
      }),
    install: (s: typeof state, p: 0 | 1, running: boolean) =>
      installOne(s, p, { prohibited: false, running, definitions }),
  };
  // Compose the selected card's effects with real SBA, resource, damage and entry paths.
  const bindings: EngineRuntimeBindings = {
    engineVersion: engine.version,
    rulesVersion: "1.00",
    visibility: { canInspectFaceDown: () => false },
    battlefield: { characteristics, artworkUrl: () => undefined },
    commands: {
      ...programs,
      character: () => ({
        definitions,
        allowed: true,
        swift: false,
        ramCost: 1,
        synergy: {},
      }),
      gear: withSynthetix
        ? (s) => ({
            play: {
              definitions,
              allowed: true,
              swift: false,
              ramCost: 0,
              synergy: {},
            },
            attachment: attachment(s),
          })
        : unavailable,
      drawRestrictions: () => ({ cannotDraw: false, cannotInstall: false }),
      ramBalance: (s) => ({ characteristics: characteristics(s) }),
      forceQuit: () => ({
        canForceQuit: () => true,
        destroySimultaneously: departures.forceQuit,
      }),
      combat: (s) => ({
        characteristics: characteristics(s),
        canAttack: () => true,
        canBlock: () => true,
        hasStamina: (_snapshot, id) => {
          const cards = characteristics(s);
          const keywords = new Map(
            s.arena
              .filter((target) => cards.get(target)?.cardType === "character")
              .map((target) => [target, new Set<CombatKeyword>()]),
          );
          for (const grant of programs.environmentKeywordGrants(s, cards))
            keywords.get(grant.targetId)?.add(grant.keyword);
          return combatKeywordRules(s, cards, keywords).hasStamina(s, id);
        },
      }),
      damage: (s) => ({
        overrun: new Set<string>(),
        characteristics: characteristics(s),
        prepare: (snapshot, packets) => ({
          state: snapshot,
          packets: applyTimedDamagePrevention(
            snapshot,
            packets.map((p) => ({ ...p, prevented: 0 })),
            true,
          ),
        }),
      }),
    },
    stateBased: {
      evaluate: (s) => ({
        characteristics: characteristics(s),
        malicious: new Set(),
        tether: new Set(),
        canDestroy: new Set(s.arena),
      }),
      followTether: unavailable,
      depart: departures.stateBased,
      healthLoss: (s, candidates) => ({
        state: applyHealthLosses(s, candidates),
        changed: true,
        decisionPending: false,
      }),
    },
    automatic: {
      eventBehaviors: () =>
        new Map(
          [...definitions.keys()].map((v) => [
            v,
            programs.events.get(v) ?? { onEvent: () => [] },
          ]),
        ),
      systemCheck: () => ({
        definitions,
        requiredRam: () => 1,
        resolveInstability: unavailable,
      }),
      refresh: () => ({ canRefresh: () => true, canReboot: () => true }),
      characteristics,
      expireTurnEffects: (s) => s,
    },
    cache: {
      definitions: () => definitions,
      scripts: programs.scripts,
      activated: new Map(),
      resources,
      entries: {
        character: (s) => resolveCharacterEntry(s, definitions),
        gear: withSynthetix
          ? (s) => resolveGearEntry(s, attachment(s))
          : unavailable,
        protocol: programs.protocolEntry,
        environment: (s) =>
          resolveEnvironmentEntry(s, {
            definitions,
            allowsMultiple: () => false,
            destroy: (snapshot, id, sourceId) =>
              destroyEnvironment(snapshot, id, sourceId, false),
          }),
      },
    },
    triggers: programs.triggers,
  };
  return { state, hero, program, cyberware, bindings, definitions };
}

test("composed COMB THE DESERT saves its additional payment and resolves the paid X through normal priority", () => {
  for (const x of [0, 2]) {
    const { state, hero, program, bindings } = fixture(
      false,
      "comb-the-desert",
    );
    state.turn.step = "deploy";
    state.priorityWindow = openPriority(0, "deploy");
    state.players[0].zones.hand = state.players[0].zones.hand.filter(
      (id) => id !== hero,
    );
    const second = state.players[0].zones.cyberdeck.shift()!,
      ram = state.players[0].zones.ramDeck.splice(0, 4);
    state.arena.push(hero, second, ...ram.slice(0, 2));
    for (const [index, character] of [hero, second].entries())
      state.objects[ram[index]].attachments = [
        { kind: "ram", hostId: character },
      ];
    state.players[0].zones.ramBank.push(...ram.slice(2));
    const runtime = createEngineRuntime(bindings);
    const command = (
      snapshot: typeof state,
      user: string,
      action: GameCommand["action"],
    ) =>
      runtime.decodeState(
        JSON.parse(
          JSON.stringify(
            dispatchGameCommand(
              snapshot,
              user,
              { expectedRevision: snapshot.revision, action },
              runtime.commands,
            ),
          ),
        ),
      );
    const options = projectProgramPlays(
      state,
      projectGame(state, "a", runtime.visibility),
      runtime.commands,
      bindings.battlefield,
    );
    assert.deepEqual(options[0].variants[0].runCharacters?.candidates, [
      hero,
      second,
    ]);
    const choices = {
      modes: [],
      targets: [],
      reversed: false,
      x,
      runCharacters: [hero, second].slice(0, x),
    };
    const quote = quoteProgramPlay(
      state,
      "a",
      { expectedRevision: state.revision, id: program, choices },
      runtime.commands,
    );
    if (quote.status !== "ready")
      throw new Error("Missing COMB THE DESERT quote");
    let next = command(state, "a", {
      type: "play-program",
      id: program,
      choices,
      ram: quote.ram.slice(0, quote.cost),
    });
    assert.equal(next.objects[hero].running, x > 0);
    assert.equal(next.objects[second].running, x > 0);
    assert.deepEqual(
      next.priorityWindow!.stack.at(-1)!.programChoices,
      choices,
    );
    assert.equal(next.players[0].zones.hand.length, 0);
    next = command(next, "b", { type: "pass" });
    next = command(next, "a", { type: "pass" });
    assert.equal(next.players[0].zones.hand.length, x);
    assert.ok(next.players[0].zones.recycleBin.includes(program));
    assert.equal(next.priorityWindow?.mode, "priority");
  }
});

test("composed PHISHING reveals a hand, restores the caster's decision and resumes after the chosen discard", () => {
  for (const targetPlayer of [0, 1] as const) {
    const { state, hero, program, bindings } = fixture(false, "phishing");
    state.turn.step = "deploy";
    state.priorityWindow = openPriority(0, "deploy");
    state.players[0].zones.hand = state.players[0].zones.hand.filter(
      (id) => id !== hero,
    );
    const ram = state.players[0].zones.ramDeck.splice(0, 4);
    state.arena.push(hero, ram[0]);
    state.objects[ram[0]].attachments = [{ kind: "ram", hostId: hero }];
    state.players[0].zones.ramBank.push(...ram.slice(1));
    const held = state.players[targetPlayer].zones.cyberdeck.splice(0, 2);
    state.players[targetPlayer].zones.hand.push(...held);
    const runtime = createEngineRuntime(bindings);
    const command = (
      snapshot: typeof state,
      user: string,
      action: GameCommand["action"],
    ) =>
      runtime.decodeState(
        JSON.parse(
          JSON.stringify(
            dispatchGameCommand(
              snapshot,
              user,
              { expectedRevision: snapshot.revision, action },
              runtime.commands,
            ),
          ),
        ),
      );
    const choices = {
      modes: [],
      targets: [],
      reversed: false,
      x: null,
      playerTarget: targetPlayer,
    };
    const quote = quoteProgramPlay(
      state,
      "a",
      { expectedRevision: state.revision, id: program, choices },
      runtime.commands,
    );
    if (quote.status !== "ready") throw new Error("Missing PHISHING quote");
    let next = command(state, "a", {
      type: "play-program",
      id: program,
      choices,
      ram: quote.ram.slice(0, quote.cost),
    });
    assert.equal(next.reveals.length, 0);
    next = command(next, "b", { type: "pass" });
    next = command(next, "a", { type: "pass" });
    if (next.pendingDecision?.type !== "hand-choice")
      throw new Error("Missing hand choice");
    assert.deepEqual(next.pendingDecision.inspected, held);
    for (const user of ["a", "b"]) {
      const battlefield = projectBattlefield(
        next,
        user,
        runtime.visibility,
        bindings.battlefield,
      );
      const prompt = projectSavedDecision(
        next,
        battlefield.view,
        runtime.commands,
      );
      const snapshot = { ...battlefield, turnPrompt: null, decision: prompt };
      battlefieldSnapshotSchema.parse(snapshot);
      assert.equal(battlefield.view.reveals.length, 2);
      assert.equal(prompt?.type ?? null, user === "a" ? "hand-choice" : null);
      if (prompt?.type === "hand-choice") {
        assert.throws(() =>
          battlefieldSnapshotSchema.parse({
            ...snapshot,
            decision: { ...prompt, cards: [prompt.cards[0]] },
          }),
        );
        assert.throws(() =>
          battlefieldSnapshotSchema.parse({
            ...snapshot,
            decision: { ...prompt, cards: [prompt.cards[0], prompt.cards[0]] },
          }),
        );
      }
    }
    const answer: GameCommand["action"] = {
      type: "answer-hand-choice",
      decisionId: next.pendingDecision.id,
      selected: held[1],
    };
    const before = structuredClone(next);
    assert.throws(() => command(next, "b", answer), /deciding/);
    assert.throws(
      () => command(next, "a", { type: "pass" }),
      /resolution decision/,
    );
    assert.deepEqual(next, before);
    next = command(next, "a", answer);
    assert.equal(next.pendingDecision, null);
    assert.deepEqual(next.players[targetPlayer].zones.hand, [held[0]]);
    assert.ok(next.players[targetPlayer].zones.recycleBin.includes(held[1]));
    assert.ok(next.players[0].zones.recycleBin.includes(program));
    assert.equal(next.priorityWindow?.mode, "priority");
    assert.throws(() => command(next, "a", answer), /continuation/);
  }
});

test("composed resource protocols roll, install and return committed RAM through saved turn commands", () => {
  for (const kind of [
    "generational-wealth",
    "insurance-policy",
    "tax-evasion",
  ]) {
    const { state, hero, program, bindings } = fixture(false, kind);
    state.turn.step = "deploy";
    state.priorityWindow = openPriority(0, "deploy");
    state.players[0].zones.hand = state.players[0].zones.hand.filter(
      (id) => id !== hero,
    );
    const ram = state.players[0].zones.ramDeck.splice(0, 6),
      enemy = state.players[1].zones.cyberdeck.shift()!,
      enemyRam = state.players[1].zones.ramDeck.shift()!;
    state.arena.push(hero, ram[0], enemy, enemyRam);
    state.objects[ram[0]].attachments = [{ kind: "ram", hostId: hero }];
    state.objects[enemyRam].attachments = [{ kind: "ram", hostId: enemy }];
    state.players[0].zones.ramBank.push(...ram.slice(1));
    let taxAppliedDuringDestruction = false;
    if (kind === "tax-evasion") {
      const depart = bindings.stateBased.depart;
      bindings.stateBased.depart = (snapshot, intents) => {
        const result = depart(snapshot, intents);
        if (
          intents.some(
            (intent) => intent.id === hero && intent.kind === "destroy",
          )
        ) {
          assert.equal(result.state.objects[ram[0]].running, false);
          assert.equal(result.state.objects[enemyRam].running, true);
          taxAppliedDuringDestruction = true;
        }
        return result;
      };
    }
    const runtime = createEngineRuntime(bindings);
    const command = (
      snapshot: typeof state,
      user: string,
      action: GameCommand["action"],
    ) =>
      runtime.decodeState(
        JSON.parse(
          JSON.stringify(
            dispatchGameCommand(
              snapshot,
              user,
              { expectedRevision: snapshot.revision, action },
              runtime.commands,
            ),
          ),
        ),
      );
    const choices = {
      modes: [],
      targets: [],
      reversed: false,
      x: null,
      mainframeTarget: state.players[0].zones.mainframe[0],
    };
    const quote = quoteProgramPlay(
      state,
      "a",
      { expectedRevision: state.revision, id: program, choices },
      runtime.commands,
    );
    if (quote.status !== "ready")
      throw new Error("Missing resource protocol quote");
    let next = command(state, "a", {
      type: "play-program",
      id: program,
      choices,
      ram: quote.ram.slice(0, quote.cost),
    });
    next = command(next, "b", { type: "pass" });
    next = command(next, "a", { type: "pass" });
    assert.ok(next.arena.includes(program));
    const deckCount = next.players[0].zones.ramDeck.length;
    if (kind === "generational-wealth") {
      const expected = baseCardD20(next);
      next = command(next, "a", { type: "pass" });
      assert.deepEqual(next.random, expected.state.random);
      assert.equal(
        next.players[0].zones.ramDeck.length,
        deckCount - (expected.value >= 9 ? 1 : 0),
      );
      if (expected.value >= 9)
        assert.ok(next.objects[next.players[0].zones.ramBank.at(-1)!].running);
      assert.equal(next.turn.step, "combat");
    } else {
      let count = 0;
      let destroyedDuringOpponentCombat = false;
      while (!next.players[0].zones.recycleBin.includes(hero) && count++ < 45) {
        const seat =
          next.priorityWindow?.priority ??
          (next.combat?.stage === "blockers"
            ? ((1 - next.turn.activePlayer) as 0 | 1)
            : next.turn.activePlayer);
        const user = next.players[seat].userId;
        const prompt = projectTurnPrompt(
          next,
          projectGame(next, user, runtime.visibility),
          runtime.commands,
        );
        if (!prompt) throw new Error("Missing insurance turn prompt");
        let action: GameCommand["action"];
        if (prompt.type === "pass") action = { type: "pass" };
        else if (prompt.type === "draw-install")
          action = { type: "draw-install", choice: "install" };
        else if (prompt.type === "force-quit")
          action = { type: "force-quit", ids: [] };
        else if (prompt.type === "attack")
          action = {
            type: "attack",
            ids: next.turn.activePlayer === 1 ? [enemy] : [],
          };
        else if (prompt.type === "block")
          action = {
            type: "block",
            assignments:
              next.turn.activePlayer === 1
                ? [{ blockerId: hero, attackerId: enemy }]
                : [],
          };
        else if (prompt.type === "assign-damage")
          action = { type: "assign-damage", splits: [] };
        else throw new Error("Unexpected insurance choice");
        const before = next;
        next = command(next, user, action);
        if (next.players[0].zones.recycleBin.includes(hero)) {
          assert.equal(action.type, "pass");
          assert.equal(before.turn.activePlayer, 1);
          destroyedDuringOpponentCombat = true;
        }
      }
      assert.ok(count < 45);
      assert.ok(destroyedDuringOpponentCombat);
      // Settlement finishes combat and refreshes the installed RAM on our next turn.
      assert.equal(next.turn.activePlayer, 0);
      assert.equal(next.turn.number, state.turn.number + 2);
      assert.equal(next.turn.step, "draw-install");
      assert.ok(next.players[1].zones.recycleBin.includes(enemy));
      assert.equal(
        next.players[0].zones.ramDeck.length,
        deckCount - (kind === "insurance-policy" ? 1 : 0),
      );
      if (kind === "tax-evasion") assert.ok(taxAppliedDuringDestruction);
      assert.equal(
        next.objects[next.players[0].zones.ramBank.at(-1)!].running,
        false,
      );
    }
  }
});

test("composed virus protocols attach to the opponent and damage that player on their later install or NETCHECK", () => {
  for (const spec of protocolSpecs.filter(
    (s) => s.kind === "system-error" || s.kind === "growing-unrest",
  )) {
    const { state, hero, program, bindings } = fixture(false, spec.kind);
    state.turn.step = "deploy";
    state.priorityWindow = openPriority(0, "deploy");
    state.players[0].zones.hand = state.players[0].zones.hand.filter(
      (id) => id !== hero,
    );
    const ram = state.players[0].zones.ramDeck.splice(0, 6);
    state.arena.push(hero, ram[0]);
    state.objects[ram[0]].attachments = [{ kind: "ram", hostId: hero }];
    state.players[0].zones.ramBank.push(...ram.slice(1));
    const runtime = createEngineRuntime(bindings);
    const command = (
      snapshot: typeof state,
      user: string,
      action: GameCommand["action"],
    ) =>
      runtime.decodeState(
        JSON.parse(
          JSON.stringify(
            dispatchGameCommand(
              snapshot,
              user,
              { expectedRevision: snapshot.revision, action },
              runtime.commands,
            ),
          ),
        ),
      );
    const mainframe = state.players[1].zones.mainframe[0];
    const choices = {
      modes: [],
      targets: [],
      reversed: false,
      x: null,
      mainframeTarget: mainframe,
    };
    const variant = runtime.commands.programVariants!(state, program)[0];
    assert.deepEqual(
      variant.mainframes,
      state.players.flatMap((player) => player.zones.mainframe),
    );
    const quote = quoteProgramPlay(
      state,
      "a",
      { expectedRevision: state.revision, id: program, choices },
      runtime.commands,
    );
    if (quote.status !== "ready") throw new Error("Missing protocol quote");
    assert.equal(quote.cost, spec.characteristics.ramCost);
    let next = command(state, "a", {
      type: "play-program",
      id: program,
      ram: quote.ram.slice(0, quote.cost),
      choices,
    });
    next = command(next, "b", { type: "pass" });
    next = command(next, "a", { type: "pass" });
    assert.ok(next.arena.includes(program));
    assert.equal(next.objects[program].controller, 0);
    assert.deepEqual(next.objects[program].attachments, [
      { kind: "protocol", hostId: mainframe },
    ]);
    const originalHealth = next.players[1].mainframeHealth;
    let count = 0;
    while (next.players[1].mainframeHealth === originalHealth && count++ < 45) {
      const seat =
        next.priorityWindow?.priority ??
        (next.combat?.stage === "blockers"
          ? ((1 - next.turn.activePlayer) as 0 | 1)
          : next.turn.activePlayer);
      const user = next.players[seat].userId;
      const prompt = projectTurnPrompt(
        next,
        projectGame(next, user, runtime.visibility),
        runtime.commands,
      );
      if (!prompt) throw new Error("Missing protocol fixture turn prompt");
      let action: GameCommand["action"];
      if (prompt.type === "pass") action = { type: "pass" };
      else if (prompt.type === "draw-install")
        action = { type: "draw-install", choice: "install" };
      else if (prompt.type === "force-quit")
        action = { type: "force-quit", ids: [] };
      else if (prompt.type === "attack") action = { type: "attack", ids: [] };
      else if (prompt.type === "block")
        action = { type: "block", assignments: [] };
      else if (prompt.type === "assign-damage")
        action = { type: "assign-damage", splits: [] };
      else throw new Error("Unexpected protocol fixture choice");
      next = command(next, user, action);
    }
    assert.ok(count < 45);
    assert.equal(next.turn.activePlayer, 1);
    assert.equal(
      next.players[1].mainframeHealth,
      originalHealth - (spec.kind === "system-error" ? 2 : 1),
    );
    assert.equal(
      next.players[0].mainframeHealth,
      state.players[0].mainframeHealth,
    );
    assert.equal(
      next.players[1].bioframeHealth,
      state.players[1].bioframeHealth,
    );
  }
});

test("composed starter environments enter through paid commands and resolve NETCHECK or program-play triggers", () => {
  for (const spec of environmentSpecs) {
    const { state, hero, program, bindings, definitions } = fixture(
      false,
      spec.kind,
    );
    state.turn.step = "deploy";
    state.priorityWindow = openPriority(0, "deploy");
    state.players[0].zones.hand = state.players[0].zones.hand.filter(
      (id) => id !== hero,
    );
    state.arena.push(hero);
    const own = state.players[0].zones.ramDeck.splice(0, 10),
      enemy = state.players[1].zones.cyberdeck.shift()!,
      enemyRam = state.players[1].zones.ramDeck.shift()!;
    state.players[0].zones.ramBank.push(...own.slice(1));
    state.arena.push(own[0], enemy, enemyRam);
    state.objects[own[0]].attachments = [{ kind: "ram", hostId: hero }];
    state.objects[enemyRam].attachments = [{ kind: "ram", hostId: enemy }];
    if (spec.kind === "boardroom") {
      definitions.set("e".repeat(64), {
        ...definitions.get("b".repeat(64))!,
        factions: ["CORPO", "DUSTRUNNER"],
      });
      state.objects[enemy].definitionVersion = "e".repeat(64);
    }
    const gridInspected = state.players[0].zones.cyberdeck.slice(0, 3);
    if (spec.kind === "the-grid")
      state.objects[gridInspected[0]].definitionVersion =
        state.objects[program].definitionVersion;
    const runtime = createEngineRuntime(bindings);
    const command = (
      snapshot: typeof state,
      user: string,
      action: GameCommand["action"],
    ) =>
      runtime.decodeState(
        JSON.parse(
          JSON.stringify(
            dispatchGameCommand(
              snapshot,
              user,
              { expectedRevision: snapshot.revision, action },
              runtime.commands,
            ),
          ),
        ),
      );
    const choices = { modes: [], targets: [], reversed: false, x: null };
    const quote = quoteProgramPlay(
      state,
      "a",
      { expectedRevision: state.revision, id: program, choices },
      runtime.commands,
    );
    assert.equal(quote.status, "ready");
    if (quote.status !== "ready") throw new Error("Missing environment quote");
    assert.equal(quote.cost, spec.characteristics.ramCost);
    let next = command(state, "a", {
      type: "play-program",
      id: program,
      choices,
      ram: quote.ram.slice(0, quote.cost),
    });
    assert.deepEqual(next.environment, []);
    assert.equal(next.players[0].zones.hand.length, 0);
    next = command(next, "b", { type: "pass" });
    next = command(next, "a", { type: "pass" });
    assert.deepEqual(next.environment, [program]);
    assert.equal(next.players[0].zones.hand.length, 0);
    if (spec.kind === "the-net") {
      const second = next.players[0].zones.cyberdeck.shift()!;
      next.players[0].zones.hand.push(second);
      next.objects[second].definitionVersion =
        next.objects[program].definitionVersion;
      const ready = quoteProgramPlay(
        next,
        "a",
        { expectedRevision: next.revision, id: second, choices },
        runtime.commands,
      );
      if (ready.status !== "ready")
        throw new Error("Missing second environment quote");
      next = command(next, "a", {
        type: "play-program",
        id: second,
        choices,
        ram: ready.ram.slice(0, ready.cost),
      });
      assert.equal(next.players[0].zones.hand.length, 1);
      next = command(next, "b", { type: "pass" });
      next = command(next, "a", { type: "pass" });
      assert.deepEqual(next.environment, [second]);
      assert.ok(next.players[0].zones.recycleBin.includes(program));
      assert.equal(next.players[0].zones.hand.length, 1);
    } else {
      next = command(next, "a", { type: "pass" });
      if (spec.kind === "boardroom") {
        const decision = next.pendingDecision;
        if (decision?.type !== "optional-trigger")
          throw new Error("Missing BOARDROOM choice");
        assert.equal(decision.player, 1);
        const snapshot = structuredClone(next);
        const answer: GameCommand["action"] = {
          type: "answer-optional-trigger",
          decisionId: decision.id,
          useEffect: true,
        };
        assert.throws(() => command(next, "a", answer), /Not the deciding/);
        assert.throws(() =>
          dispatchGameCommand(
            next,
            "b",
            { expectedRevision: next.revision - 1, action: answer },
            runtime.commands,
          ),
        );
        for (const user of ["a", "b"]) {
          const battlefield = projectBattlefield(
            next,
            user,
            runtime.visibility,
            bindings.battlefield,
          );
          const projected = {
            ...battlefield,
            turnPrompt: projectTurnPrompt(
              next,
              battlefield.view,
              runtime.commands,
            ),
            decision: projectSavedDecision(
              next,
              battlefield.view,
              runtime.commands,
            ),
          };
          battlefieldSnapshotSchema.parse(projected);
          assert.equal(
            projected.decision?.type ?? null,
            user === "b" ? "optional-trigger" : null,
          );
        }
        assert.deepEqual(next, snapshot);
        next = command(next, "b", answer);
      }
      if (spec.kind === "the-grid") {
        const optional = next.pendingDecision;
        if (optional?.type !== "optional-trigger")
          throw new Error("Missing THE GRID optional choice");
        assert.equal(optional.player, 0);
        assert.equal(next.reveals.length, 0);
        next = command(next, "a", {
          type: "answer-optional-trigger",
          decisionId: optional.id,
          useEffect: true,
        });
        const decision = next.pendingDecision;
        if (decision?.type !== "top-cards")
          throw new Error("Missing THE GRID INDEX choice");
        assert.deepEqual(decision.inspected, gridInspected);
        assert.equal(next.reveals.length, 3);
        const saved = structuredClone(next);
        for (const user of ["a", "b"]) {
          const battlefield = projectBattlefield(
            next,
            user,
            runtime.visibility,
            bindings.battlefield,
          );
          const prompt = projectSavedDecision(
            next,
            battlefield.view,
            runtime.commands,
          );
          battlefieldSnapshotSchema.parse({
            ...battlefield,
            turnPrompt: null,
            decision: prompt,
          });
          assert.equal(battlefield.view.reveals.length, 3);
          assert.equal(prompt?.type ?? null, user === "a" ? "top-cards" : null);
        }
        const answer: GameCommand["action"] = {
          type: "answer-top-cards",
          decisionId: decision.id,
          selected: gridInspected[0],
        };
        assert.throws(() => command(next, "b", answer), /Not the deciding/);
        assert.deepEqual(next, saved);
        next = command(next, "a", answer);
      }
      assert.equal(next.turn.step, "combat");
      if (spec.kind === "acid-rain") {
        assert.equal(next.objects[hero].damage.BF, 1);
        assert.equal(next.objects[enemy].damage.BF, 1);
      } else if (spec.kind === "the-amrita") {
        assert.equal(
          next.players[0].mainframeHealth,
          state.players[0].mainframeHealth + 1,
        );
        assert.equal(
          next.players[0].bioframeHealth,
          state.players[0].bioframeHealth + 1,
        );
        assert.equal(
          next.players[1].bioframeHealth,
          state.players[1].bioframeHealth,
        );
      } else if (spec.kind === "boardroom") {
        assert.equal(next.pendingDecision, null);
        assert.equal(
          next.players[0].zones.ramBank.length,
          state.players[0].zones.ramBank.length,
        );
        assert.equal(
          next.players[1].zones.ramBank.length,
          state.players[1].zones.ramBank.length + 1,
        );
        assert.equal(
          next.objects[next.players[1].zones.ramBank.at(-1)!].running,
          true,
        );
      } else if (spec.kind === "the-grid") {
        assert.deepEqual(next.players[0].zones.hand, [gridInspected[0]]);
        assert.deepEqual(
          next.players[0].zones.recycleBin,
          gridInspected.slice(1),
        );
        assert.deepEqual(next.environment, [program]);
        assert.equal(next.pendingDecision, null);
      } else {
        next = command(next, "b", { type: "pass" });
        next = command(next, "a", { type: "pass" });
        next = command(next, "a", { type: "attack", ids: [hero] });
        assert.equal(next.objects[hero].running, spec.kind !== "max-gainz");
        assert.equal(
          next.players[1].mainframeHealth,
          state.players[1].mainframeHealth -
            (spec.kind === "the-pulse" ? 1 : 0),
        );
        // The declaration trigger has resolved before the opponent chooses a blocker.
        next = command(next, "b", { type: "pass" });
        next = command(next, "a", { type: "pass" });
        next = command(next, "b", {
          type: "block",
          assignments: [{ blockerId: enemy, attackerId: hero }],
        });
        assert.equal(
          next.players[1].mainframeHealth,
          state.players[1].mainframeHealth -
            (spec.kind === "the-pulse" ? 1 : 0),
        );
      }
    }
  }
});

test("composed GENOCIDE saves the caster's faction choice, destroys both sides and settles health loss including lethal outcomes", () => {
  for (const lethal of [false, true]) {
    const { state, hero, program, bindings } = fixture(false, "genocide");
    state.turn.step = "deploy";
    state.priorityWindow = openPriority(0, "deploy");
    state.players[0].zones.hand = state.players[0].zones.hand.filter(
      (id) => id !== hero,
    );
    state.arena.push(hero);
    const own = state.players[0].zones.ramDeck.splice(0, 6),
      enemy = state.players[1].zones.cyberdeck.shift()!,
      enemyRam = state.players[1].zones.ramDeck.shift()!;
    state.players[0].zones.ramBank.push(...own.slice(1));
    state.arena.push(own[0], enemy, enemyRam);
    state.objects[own[0]].attachments = [{ kind: "ram", hostId: hero }];
    state.objects[enemyRam].attachments = [{ kind: "ram", hostId: enemy }];
    if (lethal) {
      state.players[0].mainframeHealth = 2;
      state.players[0].bioframeHealth = 2;
    }
    const runtime = createEngineRuntime(bindings);
    const command = (
      snapshot: typeof state,
      user: string,
      action: GameCommand["action"],
    ) =>
      runtime.decodeState(
        JSON.parse(
          JSON.stringify(
            dispatchGameCommand(
              snapshot,
              user,
              { expectedRevision: snapshot.revision, action },
              runtime.commands,
            ),
          ),
        ),
      );
    const before = structuredClone(state);
    let next = command(state, "a", {
      type: "play-program",
      id: program,
      ram: own.slice(1),
      choices: { modes: [], targets: [], reversed: false, x: null },
    });
    assert.equal(next.pendingDecision, null);
    next = command(next, "b", { type: "pass" });
    assert.equal(next.pendingDecision, null);
    next = command(next, "a", { type: "pass" });
    const decision = next.pendingDecision;
    if (decision?.type !== "faction-choice")
      throw new Error("Missing GENOCIDE faction choice");
    assert.ok(next.cache.includes(program));
    assert.ok(next.arena.includes(hero) && next.arena.includes(enemy));
    assert.equal(
      next.players[0].bioframeHealth,
      state.players[0].bioframeHealth,
    );
    const prompt = projectSavedDecision(
      next,
      projectGame(next, "a", runtime.visibility),
      runtime.commands,
    );
    assert.deepEqual(prompt, {
      type: "faction-choice",
      decisionId: decision.id,
      revision: next.revision,
      factions: [...neuroscapeFactionsV1],
    });
    for (const user of ["a", "b"]) {
      const battlefield = projectBattlefield(
        next,
        user,
        runtime.visibility,
        bindings.battlefield,
      );
      const projected = {
        ...battlefield,
        turnPrompt: projectTurnPrompt(next, battlefield.view, runtime.commands),
        decision: projectSavedDecision(
          next,
          battlefield.view,
          runtime.commands,
        ),
      };
      battlefieldSnapshotSchema.parse(projected);
      if (user === "b") {
        assert.equal(
          battlefieldSnapshotSchema.safeParse({
            ...projected,
            decision: prompt,
          }).success,
          false,
        );
      } else {
        assert.equal(
          battlefieldSnapshotSchema.safeParse({
            ...projected,
            decision: { ...prompt, revision: next.revision - 1 },
          }).success,
          false,
        );
      }
    }
    assert.equal(
      projectSavedDecision(
        next,
        projectGame(next, "b", runtime.visibility),
        runtime.commands,
      ),
      null,
    );
    const answer: GameCommand["action"] = {
      type: "answer-faction-choice",
      decisionId: decision.id,
      faction: "CORPO",
    };
    const paused = structuredClone(next);
    assert.throws(() => command(next, "b", answer));
    assert.throws(() => command(next, "a", { type: "pass" }));
    assert.throws(() =>
      dispatchGameCommand(
        next,
        "a",
        { expectedRevision: next.revision - 1, action: answer },
        runtime.commands,
      ),
    );
    assert.deepEqual(next, paused);
    next = command(next, "a", answer);
    assert.equal(next.pendingDecision, null);
    assert.ok(next.players[0].zones.recycleBin.includes(hero));
    assert.ok(next.players[1].zones.recycleBin.includes(enemy));
    assert.ok(next.players[0].zones.recycleBin.includes(program));
    assert.ok(next.players[0].zones.ramBank.includes(own[0]));
    assert.ok(next.players[1].zones.ramBank.includes(enemyRam));
    assert.equal(
      next.players[0].mainframeHealth,
      state.players[0].mainframeHealth - 2,
    );
    assert.equal(
      next.players[0].bioframeHealth,
      state.players[0].bioframeHealth - 2,
    );
    assert.equal(
      next.players[1].bioframeHealth,
      state.players[1].bioframeHealth,
    );
    if (lethal)
      assert.deepEqual(next.outcome, {
        type: "win",
        winner: 1,
        reason: "health",
      });
    else {
      assert.equal(next.outcome, null);
      assert.equal(next.priorityWindow?.priority, 0);
    }
    assert.deepEqual(state, before);
  }
});

test("composed QUANTUM ENCRYPTION protects a combat turn, expires in cleanup, and allows damage on the next turn", () => {
  const { state, hero, program, bindings } = fixture(
    false,
    "quantum-encryption",
  );
  state.turn.step = "deploy";
  state.priorityWindow = openPriority(0, "deploy");
  state.players[0].zones.hand = state.players[0].zones.hand.filter(
    (id) => id !== hero,
  );
  state.arena.push(hero);
  const own = state.players[0].zones.ramDeck.splice(0, 5),
    enemy = state.players[1].zones.cyberdeck.shift()!,
    enemyRam = state.players[1].zones.ramDeck.shift()!;
  state.players[0].zones.ramBank.push(...own.slice(1));
  state.arena.push(own[0], enemy, enemyRam);
  state.objects[own[0]].attachments = [{ kind: "ram", hostId: hero }];
  state.objects[enemyRam].attachments = [{ kind: "ram", hostId: enemy }];
  const runtime = createEngineRuntime(bindings);
  const command = (
    snapshot: typeof state,
    user: string,
    action: GameCommand["action"],
  ) =>
    runtime.decodeState(
      JSON.parse(
        JSON.stringify(
          dispatchGameCommand(
            snapshot,
            user,
            { expectedRevision: snapshot.revision, action },
            runtime.commands,
          ),
        ),
      ),
    );
  let next = command(state, "a", {
    type: "play-program",
    id: program,
    ram: own.slice(1, 4),
    choices: { modes: [], targets: [], reversed: false, x: null },
  });
  next = command(next, "b", { type: "pass" });
  assert.equal(next.damagePreventions.length, 0);
  next = command(next, "a", { type: "pass" });
  assert.equal(next.damagePreventions.length, 1);
  const start = next.turn.number;
  let count = 0,
    protectedAttacks = 0,
    ordinaryAttacks = 0;
  while (next.turn.number < start + 2 && count++ < 40) {
    const seat =
      next.priorityWindow?.priority ??
      (next.combat?.stage === "blockers"
        ? ((1 - next.turn.activePlayer) as 0 | 1)
        : next.turn.activePlayer);
    const user = next.players[seat].userId;
    const prompt = projectTurnPrompt(
      next,
      projectGame(next, user, runtime.visibility),
      runtime.commands,
    );
    if (!prompt) throw new Error("Missing turn prompt");
    let action: GameCommand["action"];
    if (prompt.type === "pass") action = { type: "pass" };
    else if (prompt.type === "attack") {
      const id = next.turn.activePlayer === 0 ? hero : enemy;
      assert.ok(prompt.candidates.includes(id));
      if (next.turn.number === start) protectedAttacks++;
      else ordinaryAttacks++;
      action = { type: "attack", ids: [id] };
    } else if (prompt.type === "block")
      action = { type: "block", assignments: [] };
    else if (prompt.type === "assign-damage")
      action = { type: "assign-damage", splits: [] };
    else if (prompt.type === "draw-install")
      action = { type: "draw-install", choice: "install" };
    else if (prompt.type === "force-quit")
      action = { type: "force-quit", ids: [] };
    else throw new Error(`Unexpected prompt ${prompt.type}`);
    next = command(next, user, action);
    if (next.turn.number > start)
      assert.equal(next.damagePreventions.length, 0);
  }
  assert.ok(count < 40);
  assert.equal(protectedAttacks, 1);
  assert.equal(ordinaryAttacks, 1);
  assert.equal(next.players[1].bioframeHealth, state.players[1].bioframeHealth);
  assert.equal(
    next.players[0].bioframeHealth,
    state.players[0].bioframeHealth - 2,
  );
  assert.ok(next.players[0].zones.recycleBin.includes(program));
});

test("composed MIRAGE pauses DELETE for the opponent's saved choice, releases RAM on return, and resumes normal response priority", () => {
  for (const useEffect of [true, false]) {
    const { state, program, bindings, definitions } = fixture(false, "delete");
    const engine: EngineManifest = {
      version: state.engineVersion,
      handlers: new Map([[mirageSpec.handlerId, new Set([1])]]),
      implementedCards: new Set([mirageSpec.cardId]),
      verifiedCards: new Set(),
    };
    const pin = versionDefinition(
      {
        schemaVersion: 1,
        engineVersion: engine.version,
        rulesVersion: "1.00",
        cardId: mirageSpec.cardId,
        support: "implemented",
        characteristics: mirageSpec.characteristics,
        handlers: [{ id: mirageSpec.handlerId, version: 1, parameters: {} }],
      },
      engine,
    );
    definitions.set(pin.version, pin.definition.characteristics);
    state.turn.step = "deploy";
    state.priorityWindow = openPriority(0, "deploy");
    const vulture = state.players[1].zones.cyberdeck.shift()!,
      committed = state.players[1].zones.ramDeck.splice(0, 3);
    state.objects[vulture].definitionVersion = pin.version;
    state.arena.push(vulture, ...committed);
    for (const id of committed)
      state.objects[id].attachments = [{ kind: "ram", hostId: vulture }];
    state.players[0].zones.ramBank.push(
      ...state.players[0].zones.ramDeck.splice(0, 5),
    );
    const mirage = bindDustDevilVultures(pin, engine, "1.00", {
      characteristics: bindings.battlefield.characteristics,
      hasAbility: () => true,
      returnToHand: (snapshot, id) =>
        createDepartureRuntime({
          characteristics: bindings.battlefield.characteristics,
          replace: (s, departures) => ({ state: s, departures }),
        }).move(snapshot, id, "hand"),
    });
    const events = bindings.automatic.eventBehaviors;
    bindings.automatic.eventBehaviors = (snapshot) =>
      new Map([...events(snapshot), ...mirage.events]);
    bindings.triggers = mirage.triggers;
    const runtime = createEngineRuntime(bindings),
      choices = { modes: [], targets: [vulture], reversed: false, x: null };
    const quote = quoteProgramPlay(
      state,
      "a",
      { expectedRevision: state.revision, id: program, choices },
      runtime.commands,
    );
    assert.equal(quote.status, "ready");
    if (quote.status !== "ready") throw new Error("Missing DELETE quote");
    const command = (
      snapshot: typeof state,
      user: string,
      action: GameCommand["action"],
    ) =>
      runtime.decodeState(
        JSON.parse(
          JSON.stringify(
            dispatchGameCommand(
              snapshot,
              user,
              { expectedRevision: snapshot.revision, action },
              runtime.commands,
            ),
          ),
        ),
      );
    let next = command(state, "a", {
      type: "play-program",
      id: program,
      choices,
      ram: quote.ram.slice(0, quote.cost),
    });
    assert.equal(next.pendingDecision?.type, "optional-trigger");
    assert.equal(next.pendingDecision?.player, 1);
    assert.throws(
      () => command(next, "a", { type: "pass" }),
      /decision must be answered/,
    );
    next = command(next, "b", {
      type: "answer-optional-trigger",
      decisionId: next.pendingDecision!.id,
      useEffect,
    });
    assert.equal(next.priorityWindow?.priority, 1);
    assert.equal(next.players[1].zones.hand.includes(vulture), useEffect);
    if (useEffect)
      assert.ok(
        committed.every(
          (id) =>
            next.players[1].zones.ramBank.includes(id) &&
            next.objects[id].running,
        ),
      );
    next = command(next, "b", { type: "pass" });
    next = command(next, "a", { type: "pass" });
    assert.ok(next.players[0].zones.recycleBin.includes(program));
    assert.equal(
      next.players[1].zones.recycleBin.includes(vulture),
      !useEffect,
    );
    assert.equal(next.pendingDecision, null);
    assert.equal(next.pendingTriggers.length, 0);
    assert.equal(next.priorityWindow?.priority, 0);
  }
});

test("composed Overload commands restore between responses and settle lethal character or player damage", () => {
  for (const recipient of ["character", "self", "opponent"] as const) {
    const { state, hero, program, bindings } = fixture(false, "overload-mk-ii");
    state.turn.step = "deploy";
    state.priorityWindow = openPriority(0, "deploy");
    state.players[0].zones.hand = state.players[0].zones.hand.filter(
      (id) => id !== hero,
    );
    state.arena.push(hero);
    const bank = state.players[0].zones.ramDeck.splice(0, 4);
    state.players[0].zones.ramBank.push(...bank.slice(1));
    state.arena.push(bank[0]);
    state.objects[bank[0]].attachments = [{ kind: "ram", hostId: hero }];
    const enemy = state.players[1].zones.cyberdeck.shift()!,
      ram = state.players[1].zones.ramDeck.shift()!;
    state.arena.push(enemy, ram);
    state.objects[ram].attachments = [{ kind: "ram", hostId: enemy }];
    state.players[0].mainframeHealth = 3;
    state.players[1].mainframeHealth = 3;
    const runtime = createEngineRuntime(bindings),
      before = structuredClone(state);
    const choices = {
      modes: [],
      reversed: false,
      x: null,
      targets: recipient === "character" ? [enemy] : [],
      ...(recipient === "character"
        ? {}
        : { playerTarget: recipient === "self" ? (0 as const) : (1 as const) }),
    };
    const quote = quoteProgramPlay(
      state,
      "a",
      { expectedRevision: state.revision, id: program, choices },
      runtime.commands,
    );
    assert.equal(quote.status, "ready");
    if (quote.status !== "ready") throw new Error("Missing Overload quote");
    assert.equal(quote.cost, 3);
    const command = (
      snapshot: typeof state,
      user: string,
      action: GameCommand["action"],
    ) => {
      const next = dispatchGameCommand(
        snapshot,
        user,
        { expectedRevision: snapshot.revision, action },
        runtime.commands,
      );
      return runtime.decodeState(JSON.parse(JSON.stringify(next)));
    };
    let next = command(state, "a", {
      type: "play-program",
      id: program,
      ram: quote.ram,
      choices,
    });
    assert.equal(next.players[1].mainframeHealth, 3);
    assert.equal(next.objects[enemy].damage.MF, 0);
    next = command(next, "b", { type: "pass" });
    assert.equal(next.outcome, null);
    next = command(next, "a", { type: "pass" });
    assert.ok(next.players[0].zones.recycleBin.includes(program));
    if (recipient === "character") {
      assert.ok(next.players[1].zones.recycleBin.includes(enemy));
      assert.ok(next.players[1].zones.ramBank.includes(ram));
      assert.equal(next.objects[ram].running, true);
      assert.equal(next.outcome, null);
      assert.equal(next.pendingDecision, null);
      assert.equal(next.priorityWindow?.priority, 0);
    } else
      assert.deepEqual(next.outcome, {
        type: "win",
        winner: recipient === "self" ? 1 : 0,
        reason: "health",
      });
    assert.deepEqual(state, before);
  }
});

test("composed ANTIVIRUS commands restore their mode and target between passes and settle destruction or counter removal", () => {
  for (const mode of [0, 1]) {
    const { state, program, bindings, definitions } = fixture(
      false,
      "antivirus",
    );
    state.turn.step = "deploy";
    state.priorityWindow = openPriority(0, "deploy");
    const own = state.players[0].zones.mainframe[0],
      other = state.players[1].zones.mainframe[0];
    state.objects[own].counters = { BLEED: 2, CORRUPTION: 3 };
    state.objects[other].counters = { BLEED: 1 };
    const target = state.players[1].zones.cyberdeck.shift()!,
      ram = state.players[0].zones.ramDeck.shift()!;
    const card = definitions.get(state.objects[program].definitionVersion)!;
    if (card.cardType !== "program") throw new Error("Missing program");
    definitions.set("e".repeat(64), {
      ...card,
      subtype: "protocol",
      modes: undefined,
      chooseModes: undefined,
    });
    state.objects[target].definitionVersion = "e".repeat(64);
    state.objects[target].attachments = [{ kind: "protocol", hostId: own }];
    state.objects[target].faceDown = true;
    state.arena.push(target);
    state.players[0].zones.ramBank.push(ram);
    const runtime = createEngineRuntime(bindings);
    const command = (
      snapshot: typeof state,
      user: string,
      action: GameCommand["action"],
    ) =>
      runtime.decodeState(
        JSON.parse(
          JSON.stringify(
            dispatchGameCommand(
              snapshot,
              user,
              { expectedRevision: snapshot.revision, action },
              runtime.commands,
            ),
          ),
        ),
      );
    let next = command(state, "a", {
      type: "play-program",
      id: program,
      ram: [ram],
      choices: {
        modes: [mode],
        reversed: false,
        x: null,
        targets: mode === 0 ? [target] : [],
      },
    });
    next = command(next, "b", { type: "pass" });
    assert.ok(next.arena.includes(target));
    assert.deepEqual(next.objects[own].counters, state.objects[own].counters);
    next = command(next, "a", { type: "pass" });
    assert.equal(next.arena.includes(target), mode === 1);
    assert.deepEqual(
      next.objects[own].counters,
      mode === 1 ? {} : state.objects[own].counters,
    );
    assert.deepEqual(next.objects[other].counters, { BLEED: 1 });
    assert.ok(next.players[0].zones.recycleBin.includes(program));
    assert.equal(next.pendingDecision, null);
    assert.equal(next.pendingRuleEvents.length, 0);
    assert.equal(next.priorityWindow?.priority, 0);
  }
});

test("composed REDLINE commands settle zero defence and release committed RAM after resolving both temporary grants", () => {
  const { state, hero, program, bindings, definitions } = fixture(
    false,
    "redline",
  );
  const version = state.objects[hero].definitionVersion,
    card = definitions.get(version)!;
  if (card.cardType !== "character") throw new Error("Missing character");
  definitions.set(version, { ...card, defence: 1 });
  state.turn.step = "deploy";
  state.priorityWindow = openPriority(0, "deploy");
  state.players[0].zones.hand = state.players[0].zones.hand.filter(
    (id) => id !== hero,
  );
  state.arena.push(hero);
  const bank = state.players[0].zones.ramDeck.splice(0, 3);
  state.arena.push(bank[0]);
  state.objects[bank[0]].attachments = [{ kind: "ram", hostId: hero }];
  state.players[0].zones.ramBank.push(...bank.slice(1));
  const runtime = createEngineRuntime(bindings);
  const command = (
    snapshot: typeof state,
    user: string,
    action: GameCommand["action"],
  ) =>
    runtime.decodeState(
      JSON.parse(
        JSON.stringify(
          dispatchGameCommand(
            snapshot,
            user,
            { expectedRevision: snapshot.revision, action },
            runtime.commands,
          ),
        ),
      ),
    );
  let next = command(state, "a", {
    type: "play-program",
    id: program,
    ram: bank.slice(1),
    choices: { modes: [], reversed: false, x: null, targets: [hero] },
  });
  next = command(next, "b", { type: "pass" });
  assert.ok(next.arena.includes(hero));
  next = command(next, "a", { type: "pass" });
  assert.ok(next.players[0].zones.recycleBin.includes(hero));
  assert.ok(next.players[0].zones.recycleBin.includes(program));
  assert.ok(next.players[0].zones.ramBank.includes(bank[0]));
  assert.equal(next.objects[bank[0]].running, true);
  assert.equal(next.statEffects.length, 0);
  assert.equal(next.combatEffects.length, 0);
  assert.equal(next.pendingDecision, null);
  assert.equal(next.priorityWindow?.priority, 0);
});

test("composed Market Manipulation and Duststorm commands apply their effects after both response passes", () => {
  for (const kind of ["market-manipulation", "savage-duststorm"]) {
    const { state, hero, program, bindings, definitions } = fixture(
      false,
      kind,
    );
    state.turn.step = "deploy";
    state.priorityWindow = openPriority(0, "deploy");
    state.players[0].zones.hand = state.players[0].zones.hand.filter(
      (id) => id !== hero,
    );
    state.arena.push(hero);
    const bank = state.players[0].zones.ramDeck.splice(0, 5);
    state.players[0].zones.ramBank.push(...bank.slice(1));
    state.arena.push(bank[0]);
    state.objects[bank[0]].attachments = [{ kind: "ram", hostId: hero }];
    const enemy = state.players[1].zones.cyberdeck.shift()!,
      ram = state.players[1].zones.ramDeck.shift()!;
    const enemyCard = definitions.get(state.objects[enemy].definitionVersion)!;
    definitions.set("e".repeat(64), { ...enemyCard, factions: ["HACKER"] });
    state.objects[enemy].definitionVersion = "e".repeat(64);
    state.arena.push(enemy, ram);
    state.objects[ram].attachments = [{ kind: "ram", hostId: enemy }];
    const runtime = createEngineRuntime(bindings),
      before = structuredClone(state);
    const choices = { modes: [], reversed: false, x: null, targets: [] };
    const quote = quoteProgramPlay(
      state,
      "a",
      { expectedRevision: 0, id: program, choices },
      runtime.commands,
    );
    assert.equal(quote.status, "ready");
    if (quote.status !== "ready")
      throw new Error("Missing resource program quote");
    assert.equal(quote.cost, kind === "market-manipulation" ? 4 : 3);
    const command = (
      snapshot: typeof state,
      user: string,
      action: GameCommand["action"],
    ) =>
      runtime.decodeState(
        JSON.parse(
          JSON.stringify(
            dispatchGameCommand(
              snapshot,
              user,
              { expectedRevision: snapshot.revision, action },
              runtime.commands,
            ),
          ),
        ),
      );
    let next = command(state, "a", {
      type: "play-program",
      id: program,
      choices,
      ram: quote.ram.slice(0, quote.cost),
    });
    next = command(next, "b", { type: "pass" });
    assert.equal(next.players[0].zones.ramBank.length, 4);
    assert.equal(next.objects[enemy].running, false);
    next = command(next, "a", { type: "pass" });
    if (kind === "market-manipulation") {
      assert.equal(next.players[0].zones.ramBank.length, 5);
      assert.equal(
        next.objects[next.players[0].zones.ramBank.at(-1)!].running,
        true,
      );
    } else {
      assert.equal(next.objects[enemy].running, true);
      assert.equal(next.objects[hero].running, false);
    }
    assert.ok(next.players[0].zones.recycleBin.includes(program));
    assert.equal(next.pendingDecision, null);
    assert.equal(next.priorityWindow?.priority, 0);
    assert.deepEqual(state, before);
  }
});

for (const withSynthetix of [false, true])
  test(`composed runtime advances a fixture game through card plays, combat, health loss and snapshot restore${withSynthetix ? " with Synthetix and cyberware" : ""}`, () => {
    const { state, hero, program, cyberware, bindings } =
      fixture(withSynthetix);
    const runtime = createEngineRuntime(bindings);
    const original = structuredClone(state);
    let next = runtime.commands.settle(state),
      count = 0,
      playedProgram = false;
    while (!next.outcome && count < 150) {
      const seat =
        next.priorityWindow?.priority ??
        (next.combat?.stage === "blockers"
          ? ((1 - next.turn.activePlayer) as 0 | 1)
          : next.turn.activePlayer);
      const user = next.players[seat].userId;
      const view = projectGame(next, user, runtime.visibility);
      const prompt = projectTurnPrompt(next, view, runtime.commands);
      assert.ok(
        prompt,
        `Missing prompt at ${next.turn.step}/${next.combat?.stage}`,
      );
      let action: GameCommand["action"];
      if (prompt.type === "draw-install")
        action = { type: "draw-install", choice: "install" };
      else if (prompt.type === "force-quit")
        action = { type: "force-quit", ids: [] };
      else if (prompt.type === "attack")
        action = {
          type: "attack",
          ids: prompt.candidates.filter((id) => id === hero),
        };
      else if (prompt.type === "block")
        action = { type: "block", assignments: [] };
      else if (prompt.type === "assign-damage")
        action = { type: "assign-damage", splits: [] };
      else if (prompt.type === "pass") {
        action = { type: "pass" };
        const character = projectCharacterPlays(
          next,
          view,
          runtime.commands,
          bindings.battlefield,
        ).find((option) => option.id === hero && option.unavailable === null);
        if (character)
          action = {
            type: "play-character",
            id: hero,
            ram: character.ram.slice(0, character.cost),
          };
        else {
          const option = projectProgramPlays(
            next,
            view,
            runtime.commands,
            bindings.battlefield,
          ).find((option) => option.id === program);
          if (option) {
            const variant = option.variants[0],
              choices = {
                modes: variant.modes,
                reversed: variant.reversed,
                x: null,
                targets: [],
              };
            const quote = quoteProgramPlay(
              next,
              user,
              { expectedRevision: next.revision, id: program, choices },
              runtime.commands,
            );
            if (quote.status === "ready" && quote.affordable) {
              action = {
                type: "play-program",
                id: program,
                choices,
                ram: quote.ram.slice(0, quote.cost),
              };
              playedProgram = true;
            }
          }
        }
      } else throw new Error("Unexpected fixture decision");
      if (action.type === "pass" && cyberware) {
        const option = projectGearPlays(
          next,
          view,
          runtime.commands,
          bindings.battlefield,
        ).find(
          (option) => option.id === cyberware && option.unavailable === null,
        );
        const host = option?.hosts.find((host) => host.hostId === hero);
        if (option && host)
          action = {
            type: "play-gear",
            id: cyberware,
            ram: option.ram.slice(0, option.cost),
            targets: [{ hostId: hero, port: host.ports[0] }],
          };
      }
      const revision = next.revision;
      next = dispatchGameCommand(
        next,
        user,
        { expectedRevision: revision, action },
        runtime.commands,
      );
      assert.equal(next.revision, revision + 1);
      next = runtime.decodeState(JSON.parse(JSON.stringify(next)));
      count++;
    }
    assert.ok(count < 150);
    assert.ok(next.turn.number >= (withSynthetix ? 3 : 5));
    assert.equal(playedProgram, true);
    assert.deepEqual(next.outcome, {
      type: "win",
      winner: 0,
      reason: "health",
    });
    assert.ok(next.players[0].zones.recycleBin.includes(program));
    assert.equal(next.players[1].bioframeHealth, 0);
    if (cyberware) {
      assert.ok(next.arena.includes(cyberware));
      const card = bindings.battlefield.characteristics(next).get(hero)!;
      assert.equal(card.cardType === "character" && card.attack, 3);
    }
    assert.deepEqual(state, original);
  });

test("bound program quotes require actual controlled faction persistents", () => {
  const { state, hero, program, bindings } = fixture();
  state.turn.step = "deploy";
  state.priorityWindow = openPriority(0, "deploy");
  const runtime = createEngineRuntime(bindings);
  const request = {
    expectedRevision: state.revision,
    id: program,
    choices: { modes: [], targets: [], reversed: false, x: null },
  };
  const before = quoteProgramPlay(state, "a", request, runtime.commands);
  assert.equal(before.status, "unavailable");
  if (before.status === "unavailable") assert.equal(before.reason, "synergy");
  state.players[0].zones.hand = state.players[0].zones.hand.filter(
    (id) => id !== hero,
  );
  state.arena.push(hero);
  assert.equal(
    quoteProgramPlay(state, "a", request, runtime.commands).status,
    "ready",
  );
  state.objects[hero].controller = 1;
  const after = quoteProgramPlay(state, "a", request, runtime.commands);
  assert.equal(after.status, "unavailable");
  if (after.status === "unavailable") assert.equal(after.reason, "synergy");
});

test("runtime composition rejects wrong pins and unknown cached card paths atomically", () => {
  const { state, hero, bindings } = fixture(),
    runtime = createEngineRuntime(bindings);
  assert.throws(
    () => createEngineRuntime({ ...bindings, engineVersion: "" }),
    /pins/,
  );
  assert.throws(() => createEngineRuntime(bindings, 0), /limit/);
  assert.throws(
    () => runtime.decodeState({ ...state, rulesVersion: "other" }),
    /version mismatch/,
  );
  assert.throws(
    () => runtime.commands.settle({ ...state, engineVersion: "other" }),
    /version mismatch/,
  );
  const resolving = structuredClone(state);
  resolving.players[0].zones.hand = resolving.players[0].zones.hand.filter(
    (id) => id !== hero,
  );
  resolving.cache.push(hero);
  resolving.priorityWindow = {
    ...openPriority(0, "deploy"),
    mode: "drain",
    priority: null,
    resolving: {
      id: "resolve",
      sourceId: hero,
      sourceIncarnation: resolving.objects[hero].incarnation,
      controller: 0,
      kind: "card",
    },
  };
  const before = structuredClone(resolving);
  assert.throws(
    () =>
      resolveCacheAction(resolving, {
        ...bindings.cache,
        definitions: () => new Map(),
      }),
    /definition unavailable/,
  );
  resolving.objects[hero].definitionVersion = "c".repeat(64);
  assert.throws(
    () => resolveCacheAction(resolving, bindings.cache),
    /Unsupported cached card/,
  );
  resolving.objects[hero].definitionVersion =
    before.objects[hero].definitionVersion;
  assert.deepEqual(resolving, before);
  assert.throws(() => resolveCacheAction(state, bindings.cache), /not ready/);
});

test("cache routing resolves captured activated abilities after source departure without consulting its current card definition", () => {
  const { state, hero, bindings, definitions } = fixture();
  const captured = structuredClone(state.objects[hero]);
  state.players[0].zones.hand = state.players[0].zones.hand.filter(
    (id) => id !== hero,
  );
  state.players[0].zones.recycleBin.push(hero);
  state.priorityWindow = {
    ...openPriority(0, "deploy"),
    mode: "drain",
    priority: null,
    resolving: {
      id: "activation",
      kind: "activated",
      controller: 0,
      sourceId: hero,
      activatedAbility: {
        abilityId: "lucidity",
        handler: "nova/lucidity",
        choices: { targets: [], modes: [], x: null },
        source: captured,
        characteristics: definitions.get(captured.definitionVersion)!,
      },
    },
  };
  const before = structuredClone(state);
  const next = resolveCacheAction(state, {
    ...bindings.cache,
    definitions: () => {
      throw new Error("A departed ability must use its captured handler");
    },
    activated: new Map([["nova/lucidity", novaLucidity]]),
  });
  assert.equal(
    next.players[0].zones.hand.length,
    state.players[0].zones.hand.length + 1,
  );
  assert.ok(next.players[0].zones.recycleBin.includes(hero));
  assert.throws(
    () => resolveCacheAction(state, bindings.cache),
    /Missing activated ability handler/,
  );
  assert.deepEqual(state, before);
});
