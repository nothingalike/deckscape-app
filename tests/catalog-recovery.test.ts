import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { fork } from 'node:child_process';
import { openApplication } from '../src/application';
import { controlledCatalogSource } from '../src/catalog';
import { basic, character, png } from './fixtures/catalog';

async function syncAndWait(app: ReturnType<typeof openApplication>) {
  assert.equal((await app.execute({ type: 'catalog.sync' })).ok, true);
  for (let attempt = 0; attempt < 1000; attempt++) {
    const status = await app.execute({ type: 'catalog.status' });
    if (status.ok && !status.data.running) return status.data;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Catalog did not settle');
}

test('a missing-source card remains readable with its artwork after an update and restart', async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-retained-'));
  let includeRunner = true;
  const source = {
    async fetchPage() { return { cards: includeRunner ? [basic, character] : [basic], total: includeRunner ? 2 : 1, has_more: false, offset: 0 }; },
    async fetchArtwork() { return new Response(png, { headers: { 'Content-Type': 'image/png' } }); },
  };
  const app = openApplication({ profileDirectory, catalogSource: source });
  let artwork: string | null = null;
  try {
    await syncAndWait(app);
    const initial = await app.execute({ type: 'catalog.list', query: { search: 'runner' } });
    assert.ok(initial.ok); artwork = initial.data.items[0].image_path;
    includeRunner = false;
    assert.deepEqual((await syncAndWait(app)).lastResult, { added: 0, changed: 0, missing: 1 });
    const retained = await app.execute({ type: 'catalog.list', query: { search: 'runner' } });
    assert.ok(retained.ok);
    assert.equal(retained.data.total, 1);
    assert.equal(retained.data.items[0].source_missing, true);
    assert.equal(retained.data.items[0].image_path, artwork);
  } finally { await app.close(); }
  const reopened = openApplication({ profileDirectory, catalogSource: source });
  try {
    const retained = await reopened.execute({ type: 'catalog.list', query: { search: 'runner' } });
    assert.ok(retained.ok);
    assert.equal(retained.data.items[0].source_missing, true);
    assert.equal(retained.data.items[0].image_path, artwork);
  } finally { await reopened.close(); await rm(profileDirectory, { recursive: true, force: true }); }
});

test('canceling an artwork download preserves the active catalog and cancellation survives reopening', async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-cancel-'));
  let holdArtwork = false;
  let entered!: () => void;
  const downloading = new Promise<void>(resolve => { entered = resolve; });
  const source = {
    async fetchPage() { return { cards: [basic], total: 1, has_more: false, offset: 0 }; },
    async fetchArtwork(_url: string, signal: AbortSignal): Promise<Response> {
      if (!holdArtwork) return new Response(png, { headers: { 'Content-Type': 'image/png' } });
      entered();
      return new Promise((_resolve, reject) => {
        if (signal.aborted) reject(new Error('Canceled'));
        else signal.addEventListener('abort', () => reject(new Error('Canceled')), { once: true });
      });
    },
  };
  const app = openApplication({ profileDirectory, catalogSource: source });
  let snapshotId: string | null = null;
  try {
    snapshotId = (await syncAndWait(app)).snapshotId;
    holdArtwork = true;
    await app.execute({ type: 'catalog.sync' });
    await downloading;
    assert.deepEqual(await app.execute({ type: 'catalog.cancel' }), { ok: true, data: { canceled: true } });
    for (let attempt = 0; attempt < 1000; attempt++) {
      const status = await app.execute({ type: 'catalog.status' });
      if (status.ok && !status.data.running) {
        assert.equal(status.data.snapshotId, snapshotId);
        assert.equal(status.data.progress?.phase, 'canceled');
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 5));
      if (attempt === 999) throw new Error('Cancellation did not settle');
    }
  } finally { await app.close(); }
  const reopened = openApplication({ profileDirectory, catalogSource: source });
  try {
    const status = await reopened.execute({ type: 'catalog.status' });
    assert.ok(status.ok);
    assert.equal(status.data.snapshotId, snapshotId);
    assert.equal(status.data.progress?.phase, 'canceled');
    assert.equal(status.data.count, 1);
  } finally { await reopened.close(); await rm(profileDirectory, { recursive: true, force: true }); }
});

test('transient source failures retry within a bounded request policy', async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-retry-'));
  let requests = 0;
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/cards')) {
      requests++;
      if (requests < 3) { response.writeHead(503, { 'Retry-After': '0.001' }); response.end(); return; }
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ cards: [basic], total: 1, has_more: false, offset: 0 }));
    } else { response.setHeader('Content-Type','image/png'); response.end(png); }
  });
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const app = openApplication({ profileDirectory, catalogSource: controlledCatalogSource(`http://127.0.0.1:${address.port}/`) });
  try {
    const result = await syncAndWait(app);
    assert.equal(result.progress?.phase, 'complete');
    assert.equal(result.count, 1);
    assert.equal(requests, 3);
  } finally { await app.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(profileDirectory,{recursive:true,force:true}); }
});

test('an expired artwork link is refreshed from a complete source snapshot once', async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-expired-'));
  let snapshots = 0;
  const app = openApplication({ profileDirectory, catalogSource: {
    async fetchPage() {
      snapshots++;
      return { cards: [{ ...basic, image_url: basic.image_url.split('?')[0] + (snapshots === 1 ? '?signature=expired' : '?signature=fresh') }], total: 1, has_more: false, offset: 0 };
    },
    async fetchArtwork(url: string) { return url.includes('expired') ? new Response(null,{status:403}) : new Response(png,{headers:{'Content-Type':'image/png'}}); },
  } });
  try {
    const status = await syncAndWait(app);
    assert.equal(status.progress?.phase, 'complete');
    assert.equal(status.count, 1);
    assert.equal(snapshots, 2);
    const cards = await app.execute({ type: 'catalog.list' });
    assert.equal(JSON.stringify(cards).includes('signature='), false);
  } finally { await app.close(); await rm(profileDirectory,{recursive:true,force:true}); }
});

test('reopening discards incomplete staging while preserving referenced artwork and unrelated files', async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-staging-'));
  const source = {
    async fetchPage() { return { cards: [basic], total: 1, has_more: false, offset: 0 }; },
    async fetchArtwork() { return new Response(png, { headers: { 'Content-Type': 'image/png' } }); },
  };
  try {
    const first = openApplication({ profileDirectory, catalogSource: source });
    let artwork = '';
    try {
      await syncAndWait(first);
      const cards = await first.execute({ type: 'catalog.list' });
      assert.ok(cards.ok); artwork = cards.data.items[0].image_path!;
    } finally { await first.close(); }
    const abandoned = join(profileDirectory, 'staging', 'c596a37c-50a8-4c6f-98fa-986a2fe626ec');
    await mkdir(abandoned, { recursive: true });
    await writeFile(join(abandoned, 'partial.png'), 'interrupted');
    await writeFile(join(profileDirectory, 'staging', 'player-notes.txt'), 'keep');
    const reopened = openApplication({ profileDirectory, catalogSource: source });
    try {
      const status = await reopened.execute({ type: 'catalog.status' });
      assert.ok(status.ok); assert.equal(status.data.count, 1);
      // The storage boundary exposes the cleanup result; availability is checked through the app.
      assert.deepEqual(await readdir(join(profileDirectory, 'staging')), ['player-notes.txt']);
      assert.deepEqual(await readFile(join(profileDirectory, 'artwork', artwork)), png);
      await syncAndWait(reopened);
      assert.deepEqual(await readdir(join(profileDirectory, 'staging')), ['player-notes.txt']);
    } finally { await reopened.close(); }
  } finally { await rm(profileDirectory, { recursive: true, force: true }); }
});

test('running out of artwork disk space preserves the working catalog and permits a later retry', async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-disk-full-'));
  let diskFull = false;
  const source = {
    async fetchPage() { return { cards: diskFull ? [basic, character] : [basic], total: diskFull ? 2 : 1, has_more: false, offset: 0 }; },
    async fetchArtwork() { return new Response(png, { headers: { 'Content-Type': 'image/png' } }); },
  };
  try {
    const app = openApplication({ profileDirectory, catalogSource: source, catalogFileSystem: {
      async open(...args: Parameters<typeof open>) {
        if (diskFull) throw Object.assign(new Error('https://example.invalid/?signature=private'), { code: 'ENOSPC' });
        return open(...args);
      },
    } });
    let snapshotId: string | null;
    let artwork: string;
    try {
      snapshotId = (await syncAndWait(app)).snapshotId;
      const cards = await app.execute({ type: 'catalog.list' });
      assert.ok(cards.ok); artwork = cards.data.items[0].image_path!;
      diskFull = true;
      const failed = await syncAndWait(app);
      assert.equal(failed.progress?.phase, 'failed');
      assert.match(failed.progress?.message ?? '', /not enough space/);
      assert.equal(failed.snapshotId, snapshotId);
      assert.equal(JSON.stringify(failed).includes('signature='), false);
    } finally { await app.close(); }
    const reopened = openApplication({ profileDirectory, catalogSource: source });
    try {
      const status = await reopened.execute({ type: 'catalog.status' });
      assert.ok(status.ok); assert.equal(status.data.snapshotId, snapshotId!);
      assert.equal(status.data.count, 1); assert.equal(status.data.progress?.phase, 'failed');
      assert.deepEqual(await readFile(join(profileDirectory, 'artwork', artwork!)), png);
      const recovered = await syncAndWait(reopened);
      assert.equal(recovered.progress?.phase, 'complete'); assert.equal(recovered.count, 2);
    } finally { await reopened.close(); }
  } finally { await rm(profileDirectory, { recursive: true, force: true }); }
});

for (const boundary of ['artwork', 'before-commit', 'after-commit']) {
  test(`abrupt process termination ${boundary} reopens a complete catalog with truthful update status`, async () => {
    const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-terminated-'));
    const source = {
      async fetchPage() { return { cards: [basic], total: 1, has_more: false, offset: 0 }; },
      async fetchArtwork() { return new Response(png, { headers: { 'Content-Type': 'image/png' } }); },
    };
    try {
      const original = openApplication({ profileDirectory, catalogSource: source });
      let snapshotId: string | null;
      try { snapshotId = (await syncAndWait(original)).snapshotId; } finally { await original.close(); }
      const child = fork(join(__dirname, 'fixtures/catalog-crash-worker.ts'), [profileDirectory, boundary], {
        execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      });
      let stderr = '';
      child.stderr?.on('data', value => { stderr += value; });
      const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error(`Crash boundary was not reached: ${stderr}`)), 10000);
          child.once('message', message => {
            clearTimeout(timeout);
            assert.deepEqual(message, { boundary }); resolve();
          });
          child.once('error', error => { clearTimeout(timeout); reject(error); });
          child.once('exit', () => { clearTimeout(timeout); reject(new Error(`Worker exited before termination: ${stderr}`)); });
        });
      } finally { child.kill('SIGKILL'); await exited; }
      const reopened = openApplication({ profileDirectory, catalogSource: source });
      try {
        const result = await reopened.execute({ type: 'catalog.status' });
        assert.ok(result.ok);
        assert.equal(result.data.running, false);
        if (boundary === 'after-commit') {
          assert.equal(result.data.count, 2); assert.notEqual(result.data.snapshotId, snapshotId!);
          assert.equal(result.data.progress?.phase, 'complete');
          assert.deepEqual(result.data.lastResult, { added: 1, changed: 0, missing: 0 });
        } else {
          assert.equal(result.data.count, 1); assert.equal(result.data.snapshotId, snapshotId!);
          assert.equal(result.data.progress?.phase, 'interrupted');
        }
        const available = await reopened.execute({ type: 'catalog.list' });
        assert.ok(available.ok);
        for (const card of available.data.items) {
          assert.deepEqual(await readFile(join(profileDirectory, 'artwork', card.image_path!)), png);
        }
        assert.deepEqual(await readdir(join(profileDirectory, 'staging')), []);
      } finally { await reopened.close(); }
    } finally { await rm(profileDirectory, { recursive: true, force: true }); }
  });
}

test('retry exhaustion and cancellation during a server backoff preserve available cards', async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-backoff-'));
  let mode: 'valid' | 'exhausted' | 'backoff' = 'valid';
  let requests = 0;
  let backoffStarted!: () => void;
  const waiting = new Promise<void>(resolve => { backoffStarted = resolve; });
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/cards')) {
      requests++;
      if (mode !== 'valid') {
        response.writeHead(mode === 'exhausted' ? 503 : 429, { 'Retry-After': mode === 'exhausted' ? '0.001' : '30' });
        response.end();
        if (mode === 'backoff') backoffStarted();
        return;
      }
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ cards: [basic], total: 1, has_more: false, offset: 0 }));
    } else { response.setHeader('Content-Type', 'image/png'); response.end(png); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const app = openApplication({ profileDirectory, catalogSource: controlledCatalogSource(`http://127.0.0.1:${address.port}/`) });
  try {
    const initial = await syncAndWait(app);
    mode = 'exhausted'; requests = 0;
    const failed = await syncAndWait(app);
    assert.equal(requests, 4); assert.equal(failed.progress?.phase, 'failed');
    assert.match(failed.progress?.message ?? '', /HTTP 503/);
    assert.equal(failed.snapshotId, initial.snapshotId);
    mode = 'backoff'; requests = 0;
    await app.execute({ type: 'catalog.sync' });
    await waiting;
    assert.deepEqual(await app.execute({ type: 'catalog.cancel' }), { ok: true, data: { canceled: true } });
    for (let attempt = 0; attempt < 200; attempt++) {
      const result = await app.execute({ type: 'catalog.status' });
      assert.ok(result.ok);
      if (!result.data.running) {
        assert.equal(result.data.progress?.phase, 'canceled');
        assert.equal(result.data.snapshotId, initial.snapshotId); assert.equal(requests, 1);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.fail('Cancel should interrupt the 30 second backoff immediately');
  } finally {
    await app.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(profileDirectory, { recursive: true, force: true });
  }
});

test('corrected artwork bytes activate even when the source timestamp and URL do not change', async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-art-correction-'));
  const replacement = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVSkAAAAASUVORK5CYII=', 'base64');
  let bytes = png;
  const app = openApplication({ profileDirectory, catalogSource: {
    async fetchPage() { return { cards: [{ ...basic, updated_at: '2026-01-01T00:00:00Z' }], total: 1, has_more: false, offset: 0 }; },
    async fetchArtwork() { return new Response(bytes, { headers: { 'Content-Type': 'image/png' } }); },
  } });
  try {
    await syncAndWait(app);
    const before = await app.execute({ type: 'catalog.list' }); assert.ok(before.ok);
    const oldPath = before.data.items[0].image_path!;
    bytes = replacement;
    const result = await syncAndWait(app);
    assert.equal(result.progress?.phase, 'complete');
    assert.deepEqual(result.lastResult, { added: 0, changed: 1, missing: 0 });
    const after = await app.execute({ type: 'catalog.list' }); assert.ok(after.ok);
    const newPath = after.data.items[0].image_path!;
    assert.notEqual(newPath, oldPath);
    assert.deepEqual(await readFile(join(profileDirectory, 'artwork', newPath)), replacement);
    assert.deepEqual(await readFile(join(profileDirectory, 'artwork', oldPath)), png);
  } finally { await app.close(); await rm(profileDirectory, { recursive: true, force: true }); }
});

test('invalid pages and artwork cannot replace an active catalog', async t => {
  const invalid: Record<string, (offset: number) => unknown> = {
    partial: () => ({ cards: [basic], total: 2, has_more: false, offset: 0 }),
    duplicate: offset => ({ cards: [basic], total: 2, has_more: !offset, offset }),
    drifting: offset => ({ cards: [offset ? character : basic], total: offset ? 3 : 2, has_more: !offset, offset }),
    malformed: () => ({ cards: [{ ...basic, id: 'invalid' }], total: 1, has_more: false, offset: 0 }),
    interrupted: offset => { if (offset) throw new Error('Connection dropped'); return { cards: [basic], total: 2, has_more: true, offset }; },
    incompatible: () => ({ cards: [basic, { ...character, card_type: 'new-unknown-type' }], total: 2, has_more: false, offset: 0 }),
    'invalid-image': () => ({ cards: [basic], total: 1, has_more: false, offset: 0 }),
  };
  for (const [name, fetchPage] of Object.entries(invalid)) await t.test(name, async () => {
    const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-invalid-update-'));
    let failing = false;
    const source = {
      async fetchPage(offset: number) { return failing ? fetchPage(offset) : { cards: [basic], total: 1, has_more: false, offset: 0 }; },
      async fetchArtwork() { return new Response(failing && name === 'invalid-image' ? Buffer.from('not an image') : png, { headers: { 'Content-Type': 'image/png' } }); },
    };
    try {
      const app = openApplication({ profileDirectory, catalogSource: source });
      let initial;
      try {
        initial = await syncAndWait(app); failing = true;
        const result = await syncAndWait(app);
        assert.equal(result.progress?.phase, 'failed'); assert.equal(result.snapshotId, initial.snapshotId);
      } finally { await app.close(); }
      const reopened = openApplication({ profileDirectory, catalogSource: source });
      try {
        const result = await reopened.execute({ type: 'catalog.status' }); assert.ok(result.ok);
        assert.equal(result.data.snapshotId, initial.snapshotId); assert.equal(result.data.progress?.phase, 'failed');
        const available = await reopened.execute({ type: 'catalog.list' }); assert.ok(available.ok);
        assert.equal(available.data.total, 1);
        assert.deepEqual(await readFile(join(profileDirectory, 'artwork', available.data.items[0].image_path!)), png);
      } finally { await reopened.close(); }
    } finally { await rm(profileDirectory, { recursive: true, force: true }); }
  });
});

test('expired-link refresh refuses source drift and never loops on a second expired link', async t => {
  for (const drift of [true, false]) await t.test(drift ? 'changed mechanics' : 'still expired', async () => {
    const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-expired-failure-'));
    let failing = false; let snapshots = 0; let artworkRequests = 0;
    const app = openApplication({ profileDirectory, catalogSource: {
      async fetchPage() {
        snapshots++;
        return { cards: [{ ...basic, rules_text: failing && drift && snapshots > 1 ? 'Changed mechanics' : '' }], total: 1, has_more: false, offset: 0 };
      },
      async fetchArtwork() {
        artworkRequests++;
        return failing ? new Response(null, { status: 403 }) : new Response(png, { headers: { 'Content-Type': 'image/png' } });
      },
    } });
    try {
      const initial = await syncAndWait(app);
      failing = true; snapshots = 0; artworkRequests = 0;
      const result = await syncAndWait(app);
      assert.equal(result.progress?.phase, 'failed'); assert.equal(result.snapshotId, initial.snapshotId);
      assert.equal(snapshots, 2); assert.equal(artworkRequests, drift ? 1 : 2);
      assert.equal(result.count, 1);
    } finally { await app.close(); await rm(profileDirectory, { recursive: true, force: true }); }
  });
});
