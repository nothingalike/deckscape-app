import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openApplication } from '../src/application';
import { DatabaseSync } from 'node:sqlite';
import { basic, character } from './fixtures/catalog';

test('players can create, autosave and reopen an incomplete local deck without losing its official IDs', async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-decks-'));
  try {
    const app = openApplication({ profileDirectory });
    let id = '';
    try {
      const created = await app.execute({ type: 'deck.create', name: 'My local deck' });
      assert.ok(created.ok);
      id = created.data.id;
      assert.equal(created.data.revision, 1);
      const saved = await app.execute({ type: 'deck.save', expectedRevision: 1, deck: {
        ...created.data, description: 'Keep building this draft', entries: [
          { card_id: basic.id, section: 'ram', quantity: 25 },
          { card_id: character.id, section: 'cyberdeck', quantity: 2 },
        ],
      } });
      assert.ok(saved.ok); assert.equal(saved.data.revision, 2);
    } finally { await app.close(); }
    const reopened = openApplication({ profileDirectory });
    try {
      const decks = await reopened.execute({ type: 'deck.list' }); assert.ok(decks.ok);
      assert.equal(decks.data.length, 1); assert.equal(decks.data[0].id, id);
      const read = await reopened.execute({ type: 'deck.read', id }); assert.ok(read.ok);
      assert.equal(read.data.name, 'My local deck');
      assert.equal(read.data.description, 'Keep building this draft');
      assert.equal(read.data.revision, 2);
      assert.deepEqual(read.data.entries, [
        { card_id: basic.id, section: 'ram', quantity: 25 },
        { card_id: character.id, section: 'cyberdeck', quantity: 2 },
      ]);
    } finally { await reopened.close(); }
  } finally { await rm(profileDirectory, { recursive: true, force: true }); }
});

test('stale deck edits cannot overwrite newer content and a storage failure can be retried', async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-deck-conflict-'));
  const app = openApplication({ profileDirectory });
  try {
    const created = await app.execute({ type: 'deck.create', name: 'Before' }); assert.ok(created.ok);
    const newer = await app.execute({ type: 'deck.save', deck: { ...created.data, name: 'Newer committed edit' }, expectedRevision: 1 });
    assert.ok(newer.ok);
    const stale = await app.execute({ type: 'deck.save', deck: { ...created.data, name: 'Stale edit' }, expectedRevision: 1 });
    assert.equal(stale.ok, false); if (!stale.ok) assert.equal(stale.error.code, 'REVISION_CONFLICT');
    const injection = new DatabaseSync(join(profileDirectory, 'profile.sqlite'));
    try {
      // A real SQLite write fault at the storage boundary; assertions stay at the app contract.
      injection.exec("CREATE TRIGGER reject_deck_write BEFORE UPDATE ON decks BEGIN SELECT RAISE(FAIL, 'controlled storage fault'); END;");
      const unsaved = { ...newer.data, name: 'Retry my edits', entries: [{ card_id: character.id, section: 'cyberdeck' as const, quantity: 3 }] };
      const failed = await app.execute({ type: 'deck.save', deck: unsaved, expectedRevision: 2 });
      assert.equal(failed.ok, false); if (!failed.ok) assert.equal(failed.error.code, 'STORAGE_ERROR');
      const committed = await app.execute({ type: 'deck.read', id: created.data.id }); assert.ok(committed.ok);
      assert.equal(committed.data.name, 'Newer committed edit'); assert.equal(committed.data.revision, 2);
      injection.exec('DROP TRIGGER reject_deck_write;');
      const retried = await app.execute({ type: 'deck.save', deck: unsaved, expectedRevision: 2 }); assert.ok(retried.ok);
      assert.equal(retried.data.name, 'Retry my edits'); assert.equal(retried.data.revision, 3);
      assert.deepEqual(retried.data.entries, unsaved.entries);
    } finally { injection.close(); }
  } finally { await app.close(); await rm(profileDirectory, { recursive: true, force: true }); }
});
