import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { Card, CatalogStatus, CatalogQuery, CatalogView } from './contract';
import { fetchCatalog, normalizeCard, importDiff } from './deckscape/lib/catalog-import';
import corrections from './deckscape/data/corrections.json';
import { createCatalogRequester, SourceHttpError, type CatalogFetch } from './deckscape/lib/catalog-request';
import { setTimeout as sleep } from 'node:timers/promises';
import { catalogStaging } from './catalog-staging';
import { deckscapeCatalogSource } from './deckscape-source';

const basicRamId = corrections.basic_ram.id;
export const catalogQuery = z.object({ search: z.string().max(200).optional(), type: z.string().max(80).optional(),
  set: z.string().max(80).optional(), offset: z.number().int().min(0).max(10000).optional() }).strict();

export interface CatalogSource {
  fetchPage(offset: number, signal: AbortSignal): Promise<unknown>;
  fetchArtwork(url: string, signal: AbortSignal): Promise<Response>;
  acceptsArtworkUrl?(url: string): boolean;
  fallback?: CatalogSource;
}
export type CatalogFileSystem = Pick<typeof import('node:fs/promises'), 'open'>;

class CatalogSyncError extends Error {}
const emptyCatalogPage = z.object({ cards: z.tuple([]), total: z.literal(0), has_more: z.literal(false), offset: z.literal(0) });
function validateArtworkUrl(value: string, source: CatalogSource) {
  const url = new URL(value);
  const official = url.origin === 'https://storage.googleapis.com' && url.pathname.startsWith('/spicerack_media/cards/neuroscape/');
  const backup = source.acceptsArtworkUrl?.(value) === true;
  if ((!official && !backup) || url.username || url.password) throw new CatalogSyncError('The artwork source needs review.');
}

export function officialCatalogSource(fetcher: CatalogFetch = fetch): CatalogSource {
  const request = createCatalogRequester(fetcher);
  return {
    fallback: deckscapeCatalogSource(fetcher),
    async fetchPage(offset, signal) {
      await sleep(250, undefined, { signal });
      return (await request('https://api.v2.cloudflare.prod.carde.io/hydraproxy/api/v2/deckbuilder/cards/search-with-filters/', signal, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_id: 134, filters: {}, limit: 100, offset }),
      })).json();
    },
    async fetchArtwork(url, signal) { await sleep(60, undefined, { signal }); return request(url, signal); },
  };
}

export function controlledCatalogSource(origin: string, fetcher: CatalogFetch = fetch): CatalogSource {
  const base = new URL(origin);
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || !base.port || base.username || base.password || base.pathname !== '/') {
    throw new Error('Controlled source must be an explicit loopback origin.');
  }
  const request = createCatalogRequester(fetcher);
  return {
    async fetchPage(offset, signal) {
      const response = await request(new URL(`cards?offset=${offset}`, base).href, signal);
      return response.json();
    },
    fetchArtwork: (_url, signal) => request(new URL('artwork', base).href, signal),
  };
}

async function imageBytes(response: Response) {
  const max = 10 * 1024 * 1024;
  if (!response.ok || Number(response.headers.get('content-length')) > max || !response.body) throw new CatalogSyncError('The artwork response failed validation.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      length += next.value.length;
      if (length > max) throw new CatalogSyncError('Artwork exceeds the supported download size.');
      chunks.push(next.value);
    }
  } finally { await reader.cancel(); }
  if (!length) throw new CatalogSyncError('The source returned empty artwork.');
  const bytes = Buffer.concat(chunks);
  const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  const extension = mime === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png'
    : mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'jpg'
    : mime === 'image/webp' && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' ? 'webp' : null;
  if (!extension) throw new CatalogSyncError('The artwork file type failed validation.');
  return { bytes, extension };
}

export function createCatalog(db: DatabaseSync, profileDirectory: string, source: CatalogSource, fileSystem: CatalogFileSystem = { open }) {
  if (Number(db.prepare('PRAGMA user_version').get()?.user_version) < 4) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS catalog_snapshots(id TEXT PRIMARY KEY, synced_at TEXT NOT NULL, result_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS catalog_cards(snapshot_id TEXT NOT NULL REFERENCES catalog_snapshots(id), id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(snapshot_id,id));
    CREATE TABLE IF NOT EXISTS catalog_active(id INTEGER PRIMARY KEY CHECK(id=1), snapshot_id TEXT NOT NULL REFERENCES catalog_snapshots(id));
    CREATE TABLE IF NOT EXISTS catalog_runs(id TEXT PRIMARY KEY, state TEXT NOT NULL, progress_json TEXT NOT NULL, started_at TEXT NOT NULL);
    PRAGMA user_version=4; COMMIT;`);
  let task: Promise<void> | null = null;
  let controller: AbortController | null = null;
  let currentRun: string | null = null;
  let progress: CatalogStatus['progress'] = null;
  const staging = catalogStaging(profileDirectory);
  try { staging.recover(); } catch { /* Browsing remains available; retry cleanup before the next download. */ }
  const latest = db.prepare('SELECT id,progress_json FROM catalog_runs ORDER BY started_at DESC,rowid DESC LIMIT 1').get();
  if (latest) progress = JSON.parse(String(latest.progress_json));
  const interrupted = db.prepare("SELECT id,progress_json FROM catalog_runs WHERE state='running'").all();
  for (const row of interrupted) {
    const prior = JSON.parse(String(row.progress_json));
    const recovered: NonNullable<CatalogStatus['progress']> = { phase: 'interrupted', done: prior.done ?? 0, total: prior.total ?? 0,
      message: 'The previous update was interrupted. Your last successful catalog is still available. You can retry the download.' };
    if (row.id === latest?.id) progress = recovered;
    try { db.prepare("UPDATE catalog_runs SET state='interrupted',progress_json=? WHERE id=?").run(JSON.stringify(recovered), row.id); }
    catch { /* Read the working catalog even if there is no space to persist diagnostics. */ }
  }
  function recordProgress(value: NonNullable<CatalogStatus['progress']>, state = 'running') {
    progress = value;
    db.prepare('UPDATE catalog_runs SET state=?,progress_json=? WHERE id=?').run(state, JSON.stringify(value), currentRun!);
  }

  function active() {
    return db.prepare('SELECT s.id,s.synced_at,s.result_json FROM catalog_snapshots s JOIN catalog_active a ON a.snapshot_id=s.id WHERE a.id=1').get();
  }
  function cards(): Card[] {
    const snapshot = active();
    if (!snapshot) return [];
    return db.prepare('SELECT payload FROM catalog_cards WHERE snapshot_id=? ORDER BY id').all(snapshot.id)
      .map(row => JSON.parse(String(row.payload)));
  }
  function status(): CatalogStatus {
    const snapshot = active();
    return { count: snapshot ? Number(db.prepare('SELECT count(*) AS n FROM catalog_cards WHERE snapshot_id=?').get(snapshot.id)?.n) : 0,
      snapshotId: snapshot ? String(snapshot.id) : null, lastSyncedAt: snapshot ? String(snapshot.synced_at) : null,
      running: task !== null, progress, lastResult: snapshot ? JSON.parse(String(snapshot.result_json)) : null };
  }
  async function synchronize(runId: string, signal: AbortSignal) {
    try {
      staging.recover();
      let usingBackup = false;
      const updateProgress = (value: NonNullable<CatalogStatus['progress']>, state = 'running') => recordProgress({
        ...value, ...(usingBackup ? { message: 'Using the Deckscape backup catalog because the official source is unavailable.' } : {}),
      }, state);
      updateProgress({ phase: 'catalog', done: 0, total: 0 });
      const prepare = async (activeSource: CatalogSource) => {
        const readSource = () => fetchCatalog(async offset => {
          signal.throwIfAborted();
          updateProgress({ phase: 'catalog', done: offset, total: 0 });
          const page = await activeSource.fetchPage(offset, signal);
          if (offset === 0 && emptyCatalogPage.safeParse(page).success) {
            throw new CatalogSyncError('The card source returned an empty catalog. Try again later.');
          }
          return page;
        });
        const records = await readSource();
        let refreshedLinks = false;
        const basic = records.find(card => card.id === basicRamId);
        if (!basic || basic.name.toLowerCase() !== 'basic ram') throw new CatalogSyncError('The required Basic RAM source correction needs review.');
        const stage = staging.path(runId); const art = join(profileDirectory, 'artwork');
        await mkdir(stage, { recursive: true }); await mkdir(art, { recursive: true });
        const incoming: Card[] = [];
        for (const raw of records) {
          signal.throwIfAborted();
          const card = normalizeCard(raw, basicRamId);
          if (!['ram','mainframe','character','program','gear'].includes(card.card_type)) throw new CatalogSyncError('The catalog contains a card type that needs an app update.');
          if (raw.image_url) {
          updateProgress({ phase: 'artwork', done: incoming.length, total: records.length });
          async function download(url: string) {
            validateArtworkUrl(url, activeSource);
            const response = await activeSource.fetchArtwork(url, signal);
            if (response.status === 401 || response.status === 403) { await response.body?.cancel(); throw new SourceHttpError(response.status); }
            return response;
          }
          let response: Response;
          try { response = await download(raw.image_url); }
          catch (error) {
            if (!(error instanceof SourceHttpError) || ![401,403].includes(error.status) || refreshedLinks) throw error;
            refreshedLinks = true;
            const fresh = await readSource();
            const stable = importDiff(fresh.map(item => normalizeCard(item,basicRamId)), records.map(item => normalizeCard(item,basicRamId)));
            if (stable.added || stable.changed || stable.missing.length) throw new CatalogSyncError('The catalog changed while refreshing artwork links. Retry the complete update.');
            const links = new Map(fresh.map(item => [item.id,item.image_url]));
            for (const item of records) item.image_url = links.get(item.id);
            if (!raw.image_url) throw new CatalogSyncError('A refreshed artwork link is unavailable.');
            response = await download(raw.image_url);
          }
          const { bytes, extension } = await imageBytes(response);
          const hash = createHash('sha256').update(bytes).digest('hex'); const imagePath = `${hash}.${extension}`;
          const staged = join(stage, imagePath); const file = await fileSystem.open(staged, 'w');
          try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
          await rename(staged, join(art, imagePath));
          card.image_path = imagePath;
          card.image_hash = hash;
          }
          incoming.push(card);
          updateProgress({ phase: 'artwork', done: incoming.length, total: records.length });
        }
        return incoming;
      };
      let incoming: Card[];
      try { incoming = await prepare(source); }
      catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : null;
        if (!source.fallback || signal.aborted || code && !['ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENOTFOUND','EAI_AGAIN','ERR_NETWORK'].includes(code)) throw error;
        usingBackup = true;
        incoming = await prepare(source.fallback);
      }
      signal.throwIfAborted();
      const previous = cards();
      const incomingIds = new Set(incoming.map(card => card.id));
      const retained = previous.filter(card => !incomingIds.has(card.id)).map(card => ({ ...card, source_missing: true }));
      const diff = importDiff(incoming, previous);
      const result = { added: diff.added, changed: diff.changed, missing: diff.missing.length };
      updateProgress({ phase: 'activating', done: incoming.length, total: incoming.length });
      db.exec('BEGIN IMMEDIATE;');
      try {
        db.prepare('INSERT INTO catalog_snapshots VALUES(?,?,?)').run(runId, new Date().toISOString(), JSON.stringify(result));
        const insert = db.prepare('INSERT INTO catalog_cards VALUES(?,?,?)');
        for (const card of [...incoming, ...retained]) insert.run(runId, card.id, JSON.stringify(card));
        db.prepare('INSERT INTO catalog_active VALUES(1,?) ON CONFLICT(id) DO UPDATE SET snapshot_id=excluded.snapshot_id').run(runId);
        updateProgress({ phase: 'complete', done: incoming.length, total: incoming.length }, 'complete');
        db.exec('COMMIT;');
      } catch (error) { db.exec('ROLLBACK;'); throw error; }
    } catch (error) {
      const phase = signal.aborted ? (signal.reason === 'cancelled' ? 'canceled' : 'interrupted') : 'failed';
      const reason = error instanceof CatalogSyncError ? error.message
        : error instanceof SourceHttpError ? `The source returned HTTP ${error.status} after the permitted attempts.`
        : error && typeof error === 'object' && 'code' in error && ['ENOSPC','EDQUOT'].includes(String(error.code)) ? 'There is not enough space to finish the download.'
        : 'Check your connection, source availability, and available disk space, then retry.';
      progress = { phase, done: progress?.done ?? 0, total: progress?.total ?? 0,
        message: phase === 'canceled' ? 'Catalog update canceled. The last successful catalog is unchanged.'
          : phase === 'interrupted' ? 'Catalog update interrupted. Your last successful catalog is still available. You can retry the download.'
          : `Catalog sync failed. ${reason} The last successful catalog is unchanged.` };
      try { recordProgress(progress, phase); } catch { /* Preserve the failure in memory when storage cannot record it. */ }
    } finally {
      try { staging.discard(runId); } catch { /* The next launch retries cleanup; referenced artwork is retained. */ }
    }
  }
  return {
    status,
    allCards: cards,
    list(query: CatalogQuery): CatalogView {
      const all = cards(); const search = (query.search ?? '').normalize('NFKC').trim().toLowerCase();
      const matching = all.filter(card => (!search || `${card.normalized_name} ${card.rules_text.toLowerCase()}`.includes(search))
        && (!query.type || card.card_type === query.type) && (!query.set || card.set_code === query.set));
      const offset = query.offset ?? 0;
      return { items: matching.slice(offset, offset + 100), total: matching.length,
        sets: [...new Set(all.map(card => card.set_code))].sort(), types: [...new Set(all.map(card => card.card_type))].sort() };
    },
    start() {
      if (task) return { runId: currentRun! };
      currentRun = randomUUID(); controller = new AbortController();
      db.prepare('INSERT INTO catalog_runs VALUES(?,?,?,?)').run(currentRun, 'running', JSON.stringify({ phase: 'catalog', done: 0, total: 0 }), new Date().toISOString());
      task = synchronize(currentRun, controller.signal).finally(() => { task = null; controller = null; });
      return { runId: currentRun };
    },
    cancel() { if (!controller) return { canceled: false }; controller.abort('cancelled'); return { canceled: true }; },
    async close() { controller?.abort('closing'); await task; },
  };
}
