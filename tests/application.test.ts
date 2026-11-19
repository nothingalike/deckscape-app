import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openApplication } from '../src/application';

test('a committed deck name survives closing and reopening the local profile', async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-profile-'));
  try {
    const app = openApplication({ profileDirectory });
    try {
      assert.deepEqual(await app.execute({ type: 'profile.read' }), {
        ok: true, data: { draftName: 'Untitled deck', revision: 0 },
      });
      assert.deepEqual(await app.execute({ type: 'profile.rename', name: 'Corpo experiments', expectedRevision: 0 }), {
        ok: true, data: { draftName: 'Corpo experiments', revision: 1 },
      });
    } finally { await app.close(); }
    const reopened = openApplication({ profileDirectory });
    try {
      assert.deepEqual(await reopened.execute({ type: 'profile.read' }), {
        ok: true, data: { draftName: 'Corpo experiments', revision: 1 },
      });
    } finally { await reopened.close(); }
  } finally {
    await rm(profileDirectory, { recursive: true, force: true });
  }
});

test('a version-one profile retains its deck through the schema upgrade', async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-migration-'));
  try {
    const predecessor = new DatabaseSync(join(profileDirectory, 'profile.sqlite'));
    predecessor.exec("CREATE TABLE profile(id INTEGER PRIMARY KEY, name TEXT NOT NULL, revision INTEGER NOT NULL); INSERT INTO profile VALUES(1,'Legacy starter',7); PRAGMA user_version=1;");
    predecessor.close();
    const app = openApplication({ profileDirectory });
    try {
      assert.deepEqual(await app.execute({ type: 'profile.read' }), {
        ok: true, data: { draftName: 'Legacy starter', revision: 7 },
      });
    } finally { await app.close(); }
  } finally { await rm(profileDirectory, { recursive: true, force: true }); }
});
