import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openApplication } from '../src/application';
import { deckscapeCatalogSource } from '../src/deckscape-source';
import { fetchCatalog } from '../src/deckscape/lib/catalog-import';
import { basic, character, png } from './fixtures/catalog';

const hash = createHash('sha256').update(png).digest('hex');
const artworkOrigin = 'https://example.supabase.co';
const backupCard = (id = basic.id) => ({ id, name: basic.name, raw: { ...basic, id }, image_hash: hash, image_path: `${id}/${hash}.png` });
function page(cards = [backupCard()], count = cards.length) {
  const row = '0:' + JSON.stringify(['$', '$L1', null, { cards }]) + '\n';
  return `<span class="badge">${count}<!-- --> CARDS</span><img src="${artworkOrigin}/storage/v1/object/public/card-art/${cards[0]?.image_path}"><script>self.__next_f.push(${JSON.stringify([1, row])})</script>`;
}
async function sync(app: ReturnType<typeof openApplication>) {
  assert.equal((await app.execute({ type: 'catalog.sync' })).ok, true);
  for (let n = 0; n < 1000; n++) {
    const status = await app.execute({ type: 'catalog.status' });
    assert.ok(status.ok);
    if (!status.data.running) return status.data;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Sync did not finish');
}
const artwork = () => Promise.resolve(new Response(png, { headers: { 'content-type': 'image/png' } }));
const healthy = () => ({ async fetchPage() { return { cards: [basic], total: 1, has_more: false, offset: 0 }; }, fetchArtwork: artwork });

test('the backup reads one complete public page, paginates it and verifies cached artwork hashes', async () => {
  const cards = [backupCard(), ...Array.from({ length: 100 }, () => backupCard(randomUUID()))];
  const requests: string[] = [];
  const source = deckscapeCatalogSource(async (url, init) => {
    requests.push(url); assert.equal(init?.redirect, 'error'); assert.equal(init?.credentials, 'omit');
    return url === 'https://www.deckscape.run/cards'
      ? new Response(page(cards), { headers: { 'content-type': 'text/html; charset=utf-8' } }) : artwork();
  });
  const records = await fetchCatalog(offset => source.fetchPage(offset, new AbortController().signal));
  assert.equal(records.length, 101); assert.equal(requests.length, 1);
  assert.equal(records[0].id, basic.id);
  const response = await source.fetchArtwork(records[0].image_url!, new AbortController().signal);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  assert.ok(requests[1].startsWith(`${artworkOrigin}/storage/v1/object/public/card-art/`));
});

for (const failure of ['truncated', 'count', 'duplicate', 'identity', 'path', 'reference', 'content-type'] as const) {
  test(`the backup rejects ${failure} instead of accepting a partial or changed page`, async () => {
    const card = backupCard();
    if (failure === 'identity') card.raw.id = randomUUID();
    if (failure === 'path') card.image_path = '../private.png';
    if (failure === 'reference') card.raw.name = '$a1';
    let html = page(failure === 'duplicate' ? [card, card] : [card], failure === 'count' ? 2 : undefined);
    if (failure === 'truncated') html = html.slice(0, -30);
    const source = deckscapeCatalogSource(async () => new Response(html, { headers: { 'content-type': failure === 'content-type' ? 'application/json' : 'text/html' } }));
    await assert.rejects(source.fetchPage(0, new AbortController().signal));
  });
}

test('backup artwork cannot redirect downloads to another origin or substitute different bytes', async () => {
  let calls = 0;
  const source = deckscapeCatalogSource(async url => {
    calls++;
    return url === 'https://www.deckscape.run/cards'
      ? new Response(page(), { headers: { 'content-type': 'text/html' } })
      : new Response('wrong', { headers: { 'content-type': 'image/png' } });
  });
  const signal = new AbortController().signal;
  await assert.rejects(source.fetchArtwork('https://other.example/art.png', signal)); assert.equal(calls, 0);
  await source.fetchPage(0, signal);
  await assert.rejects(source.fetchArtwork(`${artworkOrigin}/storage/v1/object/public/card-art/${basic.id}/${hash}.png`, signal), /hash/);
});

test('the backup follows a public artwork host migration and authorizes only cataloged images', async () => {
  const migratedOrigin = 'https://migrated.supabase.co';
  const requests: string[] = [];
  const source = deckscapeCatalogSource(async url => {
    requests.push(url);
    return url === 'https://www.deckscape.run/cards'
      ? new Response(page().replaceAll(artworkOrigin, migratedOrigin), { headers: { 'content-type': 'text/html' } }) : artwork();
  });
  const signal = new AbortController().signal;
  const records = await fetchCatalog(offset => source.fetchPage(offset, signal));
  assert.ok(records[0].image_url?.startsWith(migratedOrigin));
  assert.equal(source.acceptsArtworkUrl?.(records[0].image_url!), true);
  await source.fetchArtwork(records[0].image_url!, signal);
  const calls = requests.length;
  await assert.rejects(source.fetchArtwork(`${migratedOrigin}/storage/v1/object/public/card-art/${randomUUID()}/${hash}.png`, signal));
  assert.equal(requests.length, calls);
});

for (const origin of ['https://other.example', 'https://example.supabase.co.other.example', 'http://example.supabase.co']) {
  test(`an untrusted artwork location ${origin} is rejected`, async () => {
    const source = deckscapeCatalogSource(async () => new Response(page().replaceAll(artworkOrigin, origin), { headers: { 'content-type': 'text/html' } }));
    await assert.rejects(source.fetchPage(0, new AbortController().signal), /artwork location/);
  });
}

test('an oversized backup response is rejected before parsing', async () => {
  const source = deckscapeCatalogSource(async () => new Response(page(), { headers: { 'content-type': 'text/html', 'content-length': String(5 * 1024 * 1024) } }));
  await assert.rejects(source.fetchPage(0, new AbortController().signal), /size/);
});

for (const failure of ['empty', 'network', 'partial', 'artwork'] as const) {
  test(`a ${failure} primary source restarts from one complete backup snapshot`, async () => {
    const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-fallback-'));
    let backupCalls = 0;
    let primaryArtworkCalls = 0;
    const primary = {
      async fetchPage(offset: number) {
        if (failure === 'network') throw new TypeError('fetch failed');
        if (failure === 'empty') return { cards: [], total: 0, offset: 0, has_more: false };
        if (failure === 'partial') return { cards: offset ? [] : [basic], total: 2, offset, has_more: !offset };
        return { cards: [basic, character], total: 2, offset: 0, has_more: false };
      },
      async fetchArtwork() { if (primaryArtworkCalls++ === 0) return artwork(); throw new TypeError('artwork unavailable'); },
      fallback: { ...healthy(), async fetchPage() { backupCalls++; return { cards: [{ ...basic, rules_text: 'Backup snapshot' }], total: 1, has_more: false, offset: 0 }; } },
    };
    const app = openApplication({ profileDirectory, catalogSource: primary });
    try {
      const result = await sync(app); assert.equal(result.progress?.phase, 'complete'); assert.match(result.progress?.message ?? '', /Deckscape backup/);
      assert.equal(result.count, 1); assert.equal(backupCalls, 1);
      const cards = await app.execute({ type: 'catalog.list' }); assert.ok(cards.ok); assert.equal(cards.data.items[0].rules_text, 'Backup snapshot');
    } finally { await app.close(); }
    const reopened = openApplication({ profileDirectory, catalogSource: primary });
    try { const result = await reopened.execute({ type: 'catalog.status' }); assert.ok(result.ok); assert.match(result.data.progress?.message ?? '', /Deckscape backup/); }
    finally { await reopened.close(); await rm(profileDirectory, { recursive: true, force: true }); }
  });
}

test('a healthy primary and a local disk failure both leave the backup unused', async () => {
  for (const diskFailure of [false, true]) {
    const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-fallback-disk-'));
    let backupCalls = 0;
    const primary = { ...healthy(), fallback: { ...healthy(), async fetchPage() { backupCalls++; throw new Error('Backup should not be needed'); } } };
    const app = openApplication({ profileDirectory, catalogSource: primary, catalogFileSystem: { open: diskFailure
      ? async () => { throw Object.assign(new Error('Disk full'), { code: 'ENOSPC' }); } : open } });
    try { const result = await sync(app); assert.equal(result.progress?.phase, diskFailure ? 'failed' : 'complete'); assert.equal(backupCalls, 0); }
    finally { await app.close(); await rm(profileDirectory, { recursive: true, force: true }); }
  }
});

test('a recovered primary is retried on the next sync and both-source failure preserves the last snapshot', async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-fallback-retry-'));
  let primaryWorks = false, backupWorks = true, backupCalls = 0;
  const source = {
    ...healthy(),
    async fetchPage() { if (!primaryWorks) throw new TypeError('primary unavailable'); return healthy().fetchPage(); },
    fallback: { ...healthy(), async fetchPage() { backupCalls++; if (!backupWorks) throw new TypeError('backup unavailable'); return healthy().fetchPage(); } },
  };
  const app = openApplication({ profileDirectory, catalogSource: source });
  try {
    const initial = await sync(app); assert.match(initial.progress?.message ?? '', /Deckscape backup/);
    backupWorks = false;
    const failed = await sync(app); assert.equal(failed.progress?.phase, 'failed'); assert.equal(failed.snapshotId, initial.snapshotId); assert.equal(failed.count, 1);
    primaryWorks = true;
    const recovered = await sync(app); assert.equal(recovered.progress?.phase, 'complete'); assert.equal(recovered.progress.message, undefined); assert.equal(backupCalls, 2);
  } finally { await app.close(); await rm(profileDirectory, { recursive: true, force: true }); }
});

test('canceling the primary never starts the backup', async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-fallback-cancel-'));
  let backupCalls = 0;
  const source = {
    ...healthy(),
    async fetchPage(_offset: number, signal: AbortSignal): Promise<unknown> {
      return new Promise((_resolve, reject) => {
        if (signal.aborted) reject(signal.reason);
        else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    },
    fallback: { ...healthy(), async fetchPage() { backupCalls++; return healthy().fetchPage(); } },
  };
  const app = openApplication({ profileDirectory, catalogSource: source });
  try {
    assert.equal((await app.execute({ type: 'catalog.sync' })).ok, true);
    await app.execute({ type: 'catalog.cancel' });
    await app.close();
    const reopened = openApplication({ profileDirectory, catalogSource: source });
    try {
      const result = await reopened.execute({ type: 'catalog.status' }); assert.ok(result.ok);
      assert.equal(result.data.progress?.phase, 'canceled'); assert.equal(result.data.count, 0); assert.equal(backupCalls, 0);
    } finally { await reopened.close(); }
  } finally { await app.close(); await rm(profileDirectory, { recursive: true, force: true }); }
});
