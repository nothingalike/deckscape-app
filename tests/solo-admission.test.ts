import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openApplication } from '../src/application';
import { soloFixture, syncSolo } from './fixtures/solo';
import { DatabaseSync } from 'node:sqlite';

test('solo admission reports both deck readiness and legality without creating a setup for an incomplete deck', async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-solo-'));
  const app = openApplication({ profileDirectory });
  try {
    const created = await app.execute({ type: 'deck.create', name: 'Incomplete draft' });
    assert.ok(created.ok);
    const opponents = await app.execute({ type: 'solo.opponents' });
    assert.ok(opponents.ok);
    assert.equal(opponents.data.length, 4);
    const preview = await app.execute({ type: 'solo.preview', deckId: created.data.id, opponentKey: opponents.data[0].key });
    assert.ok(preview.ok);
    assert.equal(preview.data.player.legal, false);
    assert.equal(preview.data.player.ready, false);
    assert.equal(preview.data.player.supported, true);
    assert.ok(preview.data.player.legalityIssues.some(issue => issue.includes('mainframe')));
    assert.equal(preview.data.bot.ready, false);
    assert.ok(preview.data.bot.supportIssues.some(issue => issue.includes('not downloaded')));
    const setup = await app.execute({ type: 'solo.createSetup', requestId: randomUUID(), deckId: created.data.id,
      expectedRevision: created.data.revision, opponentKey: opponents.data[0].key });
    assert.equal(setup.ok, false);
    if (!setup.ok) assert.equal(setup.error.code, 'SOLO_NOT_READY');
    assert.deepEqual(await app.execute({ type: 'solo.listSetups' }), { ok: true, data: [] });
  } finally { await app.close(); await rm(profileDirectory, { recursive: true, force: true }); }
});

test('catalog changes keep cards draftable while mechanics, artwork, unknown IDs and damaged artwork block new setups', async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-solo-review-'));
  const fixture = soloFixture(); let incoming = structuredClone(fixture.cards); let artwork = fixture.png;
  const app = openApplication({ profileDirectory, soloContent: fixture.content, catalogSource: {
    async fetchPage() { return { cards: incoming, total: incoming.length, has_more: false, offset: 0 }; },
    async fetchArtwork() { return new Response(artwork, { headers: { 'content-type': 'image/png' } }); },
  } });
  try {
    await syncSolo(app);
    const imported = await app.execute({ type: 'deck.importStarter', key: fixture.content.opponents[0].key }); assert.ok(imported.ok);
    const selection = { requestId: randomUUID(), deckId: imported.data.id, expectedRevision: 1, opponentKey: fixture.content.opponents[0].key };
    const pinned = await app.execute({ type: 'solo.createSetup', ...selection }); assert.ok(pinned.ok);
    const changedId = imported.data.entries.find(entry => entry.section === 'cyberdeck')!.card_id;
    const changed = incoming.find(card => card.id === changedId)!;
    changed.rules_text += ' Changed source mechanics.';
    await syncSolo(app);
    let preview = await app.execute({ type: 'solo.preview', deckId: selection.deckId, opponentKey: selection.opponentKey }); assert.ok(preview.ok);
    assert.equal(preview.data.player.legal, true); assert.equal(preview.data.player.ready, false); assert.equal(preview.data.bot.ready, false);
    assert.ok(preview.data.bot.supportIssues.some(issue => issue.includes(changed.name) && issue.includes('mechanics changed')));
    const changedCards = await app.execute({ type: 'catalog.list', query: { search: changed.name } }); assert.ok(changedCards.ok);
    assert.equal(changedCards.data.items.find(card => card.id === changedId)?.solo_support?.status, 'review-required');
    incoming = structuredClone(fixture.cards);
    const newCard = { ...incoming.find(card => card.id === changedId)!, id: randomUUID(), name: 'NEW UNSUPPORTED CARD' };
    incoming.push(newCard); await syncSolo(app);
    const available = await app.execute({ type: 'catalog.list', query: { search: newCard.name } }); assert.ok(available.ok);
    assert.equal(available.data.items[0].solo_support?.status, 'unsupported');
    const drafted = await app.execute({ type: 'deck.save', deck: { ...imported.data, entries: [...imported.data.entries,
      { card_id: newCard.id, section: 'sideboard', quantity: 1 }] }, expectedRevision: 1 }); assert.ok(drafted.ok);
    preview = await app.execute({ type: 'solo.preview', deckId: selection.deckId, opponentKey: selection.opponentKey }); assert.ok(preview.ok);
    assert.equal(preview.data.player.legal, true); assert.equal(preview.data.bot.ready, true);
    assert.ok(preview.data.player.supportIssues.some(issue => issue.includes(newCard.name)));
    const unresolved = await app.execute({ type: 'deck.save', deck: { ...drafted.data,
      entries: [...imported.data.entries, { card_id: randomUUID(), section: 'sideboard', quantity: 1 }] }, expectedRevision: 2 }); assert.ok(unresolved.ok);
    preview = await app.execute({ type: 'solo.preview', deckId: selection.deckId, opponentKey: selection.opponentKey }); assert.ok(preview.ok);
    assert.ok(preview.data.player.supportIssues.some(issue => issue.includes('unresolved')));
    const repaired = await app.execute({ type: 'deck.save', deck: { ...unresolved.data, entries: imported.data.entries }, expectedRevision: 3 }); assert.ok(repaired.ok);
    artwork = Buffer.concat([fixture.png, Buffer.from('changed artwork bytes')]); await syncSolo(app);
    preview = await app.execute({ type: 'solo.preview', deckId: selection.deckId, opponentKey: selection.opponentKey }); assert.ok(preview.ok);
    assert.equal(preview.data.player.legal, true); assert.equal(preview.data.bot.ready, false);
    assert.ok(preview.data.player.supportIssues.some(issue => issue.includes('artwork changed')));
    const denied = await app.execute({ type: 'solo.createSetup', ...selection, expectedRevision: 4, requestId: randomUUID() });
    assert.equal(denied.ok, false);
    artwork = fixture.png; await syncSolo(app);
    await writeFile(join(profileDirectory, 'artwork', fixture.hash + '.png'), 'corrupted after sync');
    preview = await app.execute({ type: 'solo.preview', deckId: selection.deckId, opponentKey: selection.opponentKey }); assert.ok(preview.ok);
    assert.equal(preview.data.player.ready, false); assert.ok(preview.data.player.supportIssues.some(issue => issue.includes('damaged')));
    assert.deepEqual(await app.execute({ type: 'solo.readSetup', id: pinned.data.id }), pinned);
    assert.deepEqual(await app.execute({ type: 'solo.listSetups' }), { ok: true, data: [pinned.data] });
  } finally { await app.close(); await rm(profileDirectory, { recursive: true, force: true }); }
});

test('invalid bot decks and a failed storage write cannot create a partial setup', async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-solo-storage-'));
  const fixture = soloFixture();
  const source = { async fetchPage() { return { cards: fixture.cards, total: fixture.cards.length, has_more: false, offset: 0 }; },
    async fetchArtwork() { return new Response(fixture.png, { headers: { 'content-type': 'image/png' } }); } };
  const invalidContent = structuredClone(fixture.content);
  invalidContent.opponents[0].entries.find(entry => entry.section === 'ram')!.quantity = 24;
  let app = openApplication({ profileDirectory, soloContent: invalidContent, catalogSource: source });
  try {
    await syncSolo(app);
    const imported = await app.execute({ type: 'deck.importStarter', key: fixture.content.opponents[0].key }); assert.ok(imported.ok);
    const selection = { requestId: randomUUID(), deckId: imported.data.id, expectedRevision: 1, opponentKey: fixture.content.opponents[0].key };
    const preview = await app.execute({ type: 'solo.preview', deckId: selection.deckId, opponentKey: selection.opponentKey }); assert.ok(preview.ok);
    assert.equal(preview.data.player.ready, true); assert.equal(preview.data.bot.legal, false);
    assert.ok(preview.data.bot.legalityIssues.some(issue => issue.includes('exactly 25')));
    assert.equal((await app.execute({ type: 'solo.createSetup', ...selection })).ok, false);
    await app.close(); app = openApplication({ profileDirectory, soloContent: fixture.content, catalogSource: source });
    const fault = new DatabaseSync(join(profileDirectory, 'profile.sqlite'));
    try {
      fault.exec("CREATE TRIGGER reject_setup BEFORE INSERT ON solo_setups BEGIN SELECT RAISE(FAIL, 'controlled storage fault'); END;");
      const denied = await app.execute({ type: 'solo.createSetup', ...selection }); assert.equal(denied.ok, false);
      if (!denied.ok) assert.equal(denied.error.code, 'STORAGE_ERROR');
      assert.deepEqual(await app.execute({ type: 'solo.listSetups' }), { ok: true, data: [] });
      fault.exec('DROP TRIGGER reject_setup;');
      const created = await app.execute({ type: 'solo.createSetup', ...selection }); assert.ok(created.ok);
      assert.deepEqual(await app.execute({ type: 'solo.createSetup', ...selection }), created);
      const reused = await app.execute({ type: 'solo.createSetup', ...selection, expectedRevision: 2 }); assert.equal(reused.ok, false);
      if (!reused.ok) assert.equal(reused.error.code, 'INVALID_REQUEST');
      assert.deepEqual(await app.execute({ type: 'solo.listSetups' }), { ok: true, data: [created.data] });
    } finally { fault.close(); }
  } finally { await app.close(); await rm(profileDirectory, { recursive: true, force: true }); }
});

test('a supported selection persists original content once, survives edits and restart, and rejects stale deck revisions', async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-solo-pinned-'));
  const fixture = soloFixture();
  const options = { profileDirectory, soloContent: fixture.content, catalogSource: {
    async fetchPage() { return { cards: fixture.cards, total: fixture.cards.length, has_more: false, offset: 0 }; },
    async fetchArtwork() { return new Response(fixture.png, { headers: { 'content-type': 'image/png' } }); },
  } };
  let app = openApplication(options);
  try {
    await syncSolo(app);
    const imported = await app.execute({ type: 'deck.importStarter', key: fixture.content.opponents[0].key }); assert.ok(imported.ok);
    const selection = { requestId: randomUUID(), deckId: imported.data.id, expectedRevision: imported.data.revision,
      opponentKey: fixture.content.opponents[0].key };
    const preview = await app.execute({ type: 'solo.preview', deckId: selection.deckId, opponentKey: selection.opponentKey }); assert.ok(preview.ok);
    assert.equal(preview.data.player.ready, true); assert.equal(preview.data.bot.ready, true);
    const created = await app.execute({ type: 'solo.createSetup', ...selection }); assert.ok(created.ok);
    assert.equal(created.data.phase, 'setup'); assert.equal(created.data.engineVersion, 'expanded-v6'); assert.equal(created.data.rulesVersion, '1.1');
    assert.deepEqual(created.data.playerDeck, { id: imported.data.id, name: imported.data.name, revision: 1 });
    assert.deepEqual(created.data.artworkHashes, [fixture.hash]); assert.ok(created.data.definitionVersions.length > 10);
    assert.equal(JSON.stringify(created).includes('seed'), false);
    assert.deepEqual(await app.execute({ type: 'solo.createSetup', ...selection }), created);
    const edited = await app.execute({ type: 'deck.save', deck: { ...imported.data, name: 'Changed after setup', entries: [] }, expectedRevision: 1 }); assert.ok(edited.ok);
    const stale = await app.execute({ type: 'solo.createSetup', ...selection, requestId: randomUUID() }); assert.equal(stale.ok, false);
    if (!stale.ok) assert.equal(stale.error.code, 'REVISION_CONFLICT');
    await app.close(); app = openApplication(options);
    assert.deepEqual(await app.execute({ type: 'solo.readSetup', id: created.data.id }), created);
    assert.deepEqual(await app.execute({ type: 'solo.listSetups' }), { ok: true, data: [created.data] });
    assert.deepEqual(await app.execute({ type: 'solo.createSetup', ...selection }), created);
  } finally { await app.close(); await rm(profileDirectory, { recursive: true, force: true }); }
});
