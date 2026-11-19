import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openApplication } from '../src/application';
import { soloFixture, syncSolo } from './fixtures/solo';
import { DatabaseSync } from 'node:sqlite';
import type { AppResult, LocalMatchView, SoloSetup } from '../src/contract';

test('an unfinished setup is listed and reopens with the same original decision and pinned content', async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-resume-'));
  const fixture = soloFixture();
  const options = { profileDirectory, soloContent: fixture.content, catalogSource: {
    async fetchPage() { return { cards: fixture.cards, total: fixture.cards.length, has_more: false, offset: 0 }; },
    async fetchArtwork() { return new Response(fixture.png, { headers: { 'content-type': 'image/png' } }); },
  } };
  let app = openApplication(options);
  try {
    await syncSolo(app);
    const imported = await app.execute({ type: 'deck.importStarter', key: fixture.content.opponents[0].key }); assert.ok(imported.ok);
    const created = await app.execute({ type: 'solo.createSetup', requestId: randomUUID(), deckId: imported.data.id,
      expectedRevision: imported.data.revision, opponentKey: fixture.content.opponents[0].key }); assert.ok(created.ok);
    const before = await app.execute({ type: 'match.read', id: created.data.id }); assert.ok(before.ok);
    await app.close(); app = openApplication(options);
    const listed = await app.execute({ type: 'match.list' }); assert.ok(listed.ok);
    assert.equal(listed.data.matches.length, 1);
    assert.equal(listed.data.matches[0].id, created.data.id);
    assert.equal(listed.data.matches[0].stage, 'setup');
    assert.equal(listed.data.matches[0].compatibility?.ok, true);
    assert.ok(listed.data.matches[0].title?.includes(imported.data.name));
    assert.equal(JSON.stringify(listed).includes('"seed"'), false);
    assert.deepEqual(await app.execute({ type: 'match.read', id: created.data.id }), before);
    assert.deepEqual(await app.execute({ type: 'solo.readSetup', id: created.data.id }), created);
  } finally { await app.close(); await rm(profileDirectory, { recursive: true, force: true }); }
});

for (const startingPlayer of [0, 1] as const) test(`a saved ${startingPlayer === 0 ? 'player decision' : 'bot turn'} resumes its original state and next work`, async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-resume-turn-'));
  const fixture = soloFixture();
  const options = { profileDirectory, soloContent: fixture.content, matchSeed: '0'.repeat(63) + '1', catalogSource: {
    async fetchPage() { return { cards: fixture.cards, total: fixture.cards.length, has_more: false, offset: 0 }; },
    async fetchArtwork() { return new Response(fixture.png, { headers: { 'content-type': 'image/png' } }); },
  } };
  let app = openApplication(options);
  try {
    await syncSolo(app);
    const deck = await app.execute({ type: 'deck.importStarter', key: fixture.content.opponents[0].key }); assert.ok(deck.ok);
    const created = await app.execute({ type: 'solo.createSetup', requestId: randomUUID(), deckId: deck.data.id, expectedRevision: 1,
      opponentKey: fixture.content.opponents[0].key }); assert.ok(created.ok);
    const initial = await app.execute({ type: 'match.read', id: created.data.id }); assert.ok(initial.ok); assert.equal(initial.data.phase, 'setup');
    if (initial.data.phase !== 'setup') assert.fail('Expected the original setup.');
    assert.equal(initial.data.setup.decision.type, 'choose-starter');
    assert.equal(initial.data.setup.decision.seat, 0);
    const chose = await app.execute({ type: 'match.setup', id: created.data.id, commandId: randomUUID(), expectedRevision: 0,
      action: { type: 'choose-starter', startingPlayer } }); assert.ok(chose.ok);
    // The bot keeps first, then waits for the player's final mulligan before a game exists.
    if (startingPlayer === 1) {
      const botKept = await app.execute({ type: 'match.bot', id: created.data.id }); assert.ok(botKept.ok);
      assert.equal(botKept.data.waiting, true); assert.equal(botKept.data.applied, 1);
    }
    const opening = await app.execute({ type: 'match.read', id: created.data.id }); assert.ok(opening.ok); assert.equal(opening.data.phase, 'setup');
    if (opening.data.phase !== 'setup') assert.fail('Expected the remaining mulligan.');
    const kept = await app.execute({ type: 'match.setup', id: created.data.id, commandId: randomUUID(), expectedRevision: opening.data.setup.revision,
      action: { type: 'mulligan', bottomOrder: [] } }); assert.ok(kept.ok);
    if (startingPlayer === 0) { const tick = await app.execute({ type: 'match.bot', id: created.data.id }); assert.ok(tick.ok); }
    const before: AppResult<LocalMatchView> = await app.execute({ type: 'match.read', id: created.data.id }); assert.ok(before.ok); assert.equal(before.data.phase, 'game');
    if (before.data.phase !== 'game') assert.fail('Expected a committed game.');
    assert.equal(before.data.snapshot.view.turn.activePlayer, startingPlayer);
    if (startingPlayer === 0) assert.equal(before.data.snapshot.turnPrompt?.type, 'draw-install');
    const savedSummary = await app.execute({ type: 'solo.readSetup', id: created.data.id });
    await app.close(); app = openApplication(options);
    assert.deepEqual(await app.execute({ type: 'match.read', id: created.data.id }), before);
    assert.deepEqual(await app.execute({ type: 'solo.readSetup', id: created.data.id }), savedSummary);
    const listed = await app.execute({ type: 'match.list' }); assert.ok(listed.ok); assert.equal(listed.data.matches[0].stage, 'game');
    const advanced = startingPlayer === 0
      ? await app.execute({ type: 'match.command', id: created.data.id, commandId: randomUUID(),
          command: { expectedRevision: before.data.snapshot.view.revision, action: { type: 'draw-install', choice: 'install' } } })
      : await app.execute({ type: 'match.bot', id: created.data.id });
    assert.ok(advanced.ok);
    const after = await app.execute({ type: 'match.read', id: created.data.id }); assert.ok(after.ok); assert.equal(after.data.phase, 'game');
    if (after.data.phase === 'game') assert.ok(after.data.snapshot.view.revision > before.data.snapshot.view.revision);
  } finally { await app.close(); await rm(profileDirectory, { recursive: true, force: true }); }
});

test('an unavailable saved runtime is explained and retained while compatible saves remain resumable', async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-resume-unavailable-'));
  const fixture = soloFixture();
  const options = { profileDirectory, soloContent: fixture.content, catalogSource: {
    async fetchPage() { return { cards: fixture.cards, total: fixture.cards.length, has_more: false, offset: 0 }; },
    async fetchArtwork() { return new Response(fixture.png, { headers: { 'content-type': 'image/png' } }); },
  } };
  let app = openApplication(options);
  try {
    await syncSolo(app);
    const deck = await app.execute({ type: 'deck.importStarter', key: fixture.content.opponents[0].key }); assert.ok(deck.ok);
    const selection = { deckId: deck.data.id, expectedRevision: 1, opponentKey: fixture.content.opponents[0].key };
    const older = await app.execute({ type: 'solo.createSetup', ...selection, requestId: randomUUID() }); assert.ok(older.ok);
    const current = await app.execute({ type: 'solo.createSetup', ...selection, requestId: randomUUID() }); assert.ok(current.ok);
    const before = await app.execute({ type: 'match.read', id: older.data.id }); assert.ok(before.ok);
    await app.close();
    // Maintainer fixture models a save from a future executable release. Assertions use the public boundary.
    const fixtureDb = new DatabaseSync(join(profileDirectory, 'profile.sqlite'));
    fixtureDb.prepare("UPDATE solo_setups SET payload=json_set(payload,'$.summary.engineVersion','unavailable-engine-v99') WHERE id=?").run(older.data.id);
    fixtureDb.close();
    app = openApplication(options);
    const listed = await app.execute({ type: 'match.list' }); assert.ok(listed.ok);
    assert.equal(listed.data.matches.length, 2);
    assert.equal(listed.data.matches.find(match => match.id === current.data.id)?.compatibility?.ok, true);
    const unavailable = listed.data.matches.find(match => match.id === older.data.id)!;
    assert.equal(unavailable.compatibility?.ok, false);
    assert.match(unavailable.compatibility?.message ?? '', /another app version/);
    const read = await app.execute({ type: 'match.read', id: older.data.id }); assert.equal(read.ok, false);
    if (!read.ok) assert.equal(read.error.code, 'MATCH_INCOMPATIBLE');
    const tick = await app.execute({ type: 'match.bot', id: older.data.id }); assert.equal(tick.ok, false);
    if (!tick.ok) assert.equal(tick.error.code, 'MATCH_INCOMPATIBLE');
    const retained = await app.execute({ type: 'solo.readSetup', id: older.data.id }); assert.ok(retained.ok);
    assert.deepEqual(retained.data, { ...older.data, engineVersion: 'unavailable-engine-v99' });
    await app.close();
    const restored = new DatabaseSync(join(profileDirectory, 'profile.sqlite'));
    restored.prepare("UPDATE solo_setups SET payload=json_set(payload,'$.summary.engineVersion',?) WHERE id=?").run(older.data.engineVersion, older.data.id);
    restored.close();
    app = openApplication(options);
    assert.deepEqual(await app.execute({ type: 'match.read', id: older.data.id }), before);
  } finally { await app.close(); await rm(profileDirectory, { recursive: true, force: true }); }
});

test('unfinished pagination preserves tied save timestamps and equivalent time-zone cursors', async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-resume-pages-'));
  const fixture = soloFixture();
  const options = { profileDirectory, soloContent: fixture.content, catalogSource: {
    async fetchPage() { return { cards: fixture.cards, total: fixture.cards.length, has_more: false, offset: 0 }; },
    async fetchArtwork() { return new Response(fixture.png, { headers: { 'content-type': 'image/png' } }); },
  } };
  let app = openApplication(options);
  try {
    await syncSolo(app);
    const deck = await app.execute({ type: 'deck.importStarter', key: fixture.content.opponents[0].key }); assert.ok(deck.ok);
    const ids: string[] = [];
    for (let n = 0; n < 21; n++) {
      const created: AppResult<SoloSetup> = await app.execute({ type: 'solo.createSetup', requestId: 'AAAAAAAA-0000-4000-8000-' + (n + 1).toString(16).padStart(12, '0'), deckId: deck.data.id,
        expectedRevision: 1, opponentKey: fixture.content.opponents[0].key }); assert.ok(created.ok); ids.push(created.data.id);
    }
    await app.close();
    const db = new DatabaseSync(join(profileDirectory, 'profile.sqlite'));
    db.prepare('UPDATE solo_setups SET updated_at=?').run('2026-11-15T20:00:00.123456Z'); db.close();
    app = openApplication(options);
    const first = await app.execute({ type: 'match.list' }); assert.ok(first.ok);
    assert.equal(first.data.matches.length, 20); assert.ok(first.data.nextCursor);
    const second = await app.execute({ type: 'match.list', cursor: first.data.nextCursor }); assert.ok(second.ok);
    assert.equal(second.data.matches.length, 1); assert.equal(second.data.nextCursor, null);
    assert.deepEqual([...first.data.matches, ...second.data.matches].map(match => match.id).sort(), ids.sort());
    const offsetCursor = { ...first.data.nextCursor, updatedAt: first.data.nextCursor.updatedAt.replace(/Z$/, '+00:00') };
    assert.deepEqual(await app.execute({ type: 'match.list', cursor: offsetCursor }), second);
  } finally { await app.close(); await rm(profileDirectory, { recursive: true, force: true }); }
});
