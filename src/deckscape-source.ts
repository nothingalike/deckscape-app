import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { CatalogSource } from './catalog';
import { sourceCard } from './deckscape/lib/catalog-import';
import { createCatalogRequester, type CatalogFetch } from './deckscape/lib/catalog-request';

const gallery = 'https://www.deckscape.run/cards';
const backupCard = z.object({ id: z.uuid(), name: z.string().min(1), raw: sourceCard,
  image_path: z.string(), image_hash: z.string().regex(/^[a-f0-9]{64}$/) });

async function readBytes(response: Response, max: number) {
  if (!response.body || Number(response.headers.get('content-length')) > max) {
    await response.body?.cancel();
    throw new Error('The Deckscape backup response exceeds the supported size.');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      length += next.value.length;
      if (length > max) throw new Error('The Deckscape backup response exceeds the supported size.');
      chunks.push(next.value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}

function decodeStrings(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.startsWith('$$')) return value.slice(1);
    if (value.startsWith('$')) throw new Error('The Deckscape backup data format needs review.');
    return value;
  }
  if (Array.isArray(value)) return value.map(decodeStrings);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeStrings(item)]));
  return value;
}

function readCards(html: string) {
  const count = html.match(/<span\b[^>]*class="[^"]*\bbadge\b[^"]*"[^>]*>\s*(\d+)(?:<!--\s*-->)?\s*CARDS<\/span>/)?.[1];
  if (!count || Number(count) < 1 || Number(count) > 10000) throw new Error('The Deckscape backup catalog count is unavailable.');
  const chunks: string[] = [];
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    const push = script[1].trim().match(/^self\.__next_f\.push\((\[[\s\S]*\])\);?$/);
    if (!push) continue;
    const value: unknown = JSON.parse(push[1]);
    if (Array.isArray(value) && value[0] === 1 && typeof value[1] === 'string') chunks.push(value[1]);
  }
  const catalogs: unknown[][] = [];
  for (const row of chunks.join('').split('\n')) {
    const payload = row.slice(row.indexOf(':') + 1);
    if (!['[', '{'].includes(payload[0])) continue;
    let value: unknown;
    try { value = JSON.parse(payload); } catch { continue; }
    const queue: unknown[] = [value];
    while (queue.length) {
      const item = queue.pop();
      if (!item || typeof item !== 'object') continue;
      if ('cards' in item && Array.isArray(item.cards)) catalogs.push(item.cards);
      queue.push(...Object.values(item).filter(child => child && typeof child === 'object'));
    }
  }
  if (catalogs.length !== 1 || catalogs[0].length !== Number(count)) throw new Error('The Deckscape backup catalog is incomplete.');
  const ids = new Set<string>();
  const cards = catalogs[0].map(item => {
    const card = backupCard.parse(decodeStrings(item));
    if (ids.has(card.id) || card.raw.id !== card.id || card.raw.name !== card.name
      || !new RegExp(`^${card.id}/${card.image_hash}\\.(png|jpg|webp)$`).test(card.image_path)) {
      throw new Error('The Deckscape backup card failed validation.');
    }
    ids.add(card.id);
    return card;
  });
  const paths = new Set(cards.map(card => `/storage/v1/object/public/card-art/${card.image_path}`));
  const origins = new Set<string>();
  for (const image of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)) {
    let url: URL;
    try { url = new URL(image[1]); } catch { continue; }
    if (url.protocol === 'https:' && /^[a-z0-9]+\.supabase\.co$/.test(url.hostname) && !url.port
      && !url.username && !url.password && !url.search && !url.hash && paths.has(url.pathname)) origins.add(url.origin);
  }
  if (origins.size !== 1) throw new Error('The Deckscape backup artwork location is unavailable or ambiguous.');
  const [artworkOrigin] = origins;
  return cards.map(card => sourceCard.parse({ ...card.raw,
    image_url: `${artworkOrigin}/storage/v1/object/public/card-art/${card.image_path}` }));
}

export function deckscapeCatalogSource(fetcher: CatalogFetch = fetch): CatalogSource {
  const request = createCatalogRequester(fetcher);
  let snapshot: ReturnType<typeof readCards> | undefined;
  const artwork = new Map<string, string>();
  return {
    acceptsArtworkUrl: url => artwork.has(url),
    async fetchPage(offset, signal) {
      if (offset === 0) {
        snapshot = undefined;
        artwork.clear();
        const response = await request(gallery, signal);
        if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'text/html') {
          await response.body?.cancel();
          throw new Error('The Deckscape backup page failed validation.');
        }
        snapshot = readCards((await readBytes(response, 4 * 1024 * 1024)).toString('utf8'));
        for (const card of snapshot) {
          const hash = new URL(card.image_url!).pathname.match(/\/([a-f0-9]{64})\.(?:png|jpg|webp)$/)![1];
          artwork.set(card.image_url!, hash);
        }
      }
      if (!snapshot) throw new Error('Read the complete Deckscape backup before requesting another page.');
      return { cards: snapshot.slice(offset, offset + 100), total: snapshot.length, offset, has_more: offset + 100 < snapshot.length };
    },
    async fetchArtwork(url, signal) {
      const hash = artwork.get(url);
      if (!hash) throw new Error('The Deckscape backup artwork source failed validation.');
      const response = await request(url, signal);
      const bytes = await readBytes(response, 10 * 1024 * 1024);
      if (createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error('The Deckscape backup artwork hash does not match.');
      return new Response(bytes, { headers: response.headers });
    },
  };
}
