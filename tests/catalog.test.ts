import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openApplication } from '../src/application';

import { basic, character, png } from './fixtures/catalog';

async function syncAndWait(app: ReturnType<typeof openApplication>) {
  const started = await app.execute({ type: 'catalog.sync' });
  assert.equal(started.ok, true);
  for (let attempt = 0; attempt < 1000; attempt++) {
    const status = await app.execute({ type: 'catalog.status' });
    if (status.ok && !status.data.running) return status.data;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Catalog did not settle');
}

test('a complete multi-page catalog activates with local artwork and remains browsable after reopening offline', async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-catalog-'));
  try {
    const source = {
      async fetchPage(offset: number) { return { cards: offset ? [character] : [basic], total: 2, has_more: offset === 0, offset }; },
      async fetchArtwork() { return new Response(png, { headers: { 'Content-Type': 'image/png' } }); },
    };
    const app = openApplication({ profileDirectory, catalogSource: source });
    try {
      assert.deepEqual(await app.execute({ type: 'catalog.status' }), { ok: true, data: {
        count: 0, snapshotId: null, lastSyncedAt: null, running: false, progress: null, lastResult: null,
      } });
      const status = await syncAndWait(app);
      assert.equal(status.count, 2);
      assert.equal(status.progress?.phase, 'complete');
      assert.deepEqual(status.lastResult, { added: 2, changed: 0, missing: 0 });
    } finally { await app.close(); }
    const offline = { async fetchPage() { throw new Error('Offline'); }, async fetchArtwork() { throw new Error('Offline'); } };
    const reopened = openApplication({ profileDirectory, catalogSource: offline });
    try {
      const result = await reopened.execute({ type: 'catalog.list', query: { search: 'runner' } });
      assert.equal(result.ok, true);
      if (!result.ok) throw new Error('Local catalog unavailable');
      assert.equal(result.data.total, 1);
      assert.equal(result.data.items[0].name, 'Controlled runner');
      assert.ok(result.data.items[0].image_path);
      assert.match(result.data.items[0].image_path, /^[a-f0-9]{64}\.png$/);
      assert.equal(JSON.stringify(result).includes('temporary'), false);
      const ram = await reopened.execute({ type: 'catalog.list', query: { type: 'ram' } });
      assert.equal(ram.ok && ram.data.items[0].copies_limit, null);
    } finally { await reopened.close(); }
  } finally { await rm(profileDirectory, { recursive: true, force: true }); }
});

test('a malformed update preserves the active snapshot and an offline first download stays retryable', async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-catalog-failure-'));
  let mode: 'offline' | 'valid' | 'duplicate' = 'offline';
  const source = {
    async fetchPage(offset: number) {
      if (mode === 'offline') throw new Error('https://example.invalid/?signature=must-not-leak');
      return { cards: [offset && mode === 'valid' ? character : basic], total: 2, has_more: offset === 0, offset };
    },
    async fetchArtwork() { return new Response(png, { headers: { 'Content-Type': 'image/png' } }); },
  };
  const app = openApplication({ profileDirectory, catalogSource: source });
  try {
    const failed = await syncAndWait(app);
    assert.equal(failed.count, 0);
    assert.equal(failed.lastSyncedAt, null);
    assert.equal(failed.progress?.phase, 'failed');
    assert.equal(JSON.stringify(failed).includes('must-not-leak'), false);
    mode = 'valid';
    const successful = await syncAndWait(app);
    assert.equal(successful.count, 2);
    mode = 'duplicate';
    const rejected = await syncAndWait(app);
    assert.equal(rejected.progress?.phase, 'failed');
    assert.equal(rejected.snapshotId, successful.snapshotId);
    assert.equal(rejected.lastSyncedAt, successful.lastSyncedAt);
    const available = await app.execute({ type: 'catalog.list' });
    assert.equal(available.ok && available.data.total, 2);
  } finally { await app.close(); await rm(profileDirectory, { recursive: true, force: true }); }
});

test('artwork on a nonstandard HTTPS port is rejected before downloading', async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-art-origin-'));
  let downloaded = 0;
  const app = openApplication({ profileDirectory, catalogSource: {
    async fetchPage() { return { cards: [{ ...basic, image_url: basic.image_url.replace('googleapis.com/', 'googleapis.com:444/') }], total: 1, has_more: false, offset: 0 }; },
    async fetchArtwork() { downloaded++; return new Response(png, { headers: { 'Content-Type': 'image/png' } }); },
  } });
  try {
    const status = await syncAndWait(app);
    assert.equal(status.progress?.phase, 'failed');
    assert.equal(status.count, 0);
    assert.equal(downloaded, 0);
  } finally { await app.close(); await rm(profileDirectory, { recursive: true, force: true }); }
});
