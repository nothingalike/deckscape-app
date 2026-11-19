import { setTimeout as sleep } from 'node:timers/promises';

export class SourceHttpError extends Error {
  constructor(readonly status: number) { super(`Source returned ${status}`); }
}

export type CatalogFetch = (url: string, init?: RequestInit) => Promise<Response>;

// Extracted from the hosted card importer's request policy. The local adapter
// injects its Electron transport and makes waits interruptible by cancellation.
export function createCatalogRequester(fetcher: CatalogFetch) {
  return async function request(url: string, signal: AbortSignal, init?: RequestInit) {
    for (let attempt = 0; attempt < 4; attempt++) {
      signal.throwIfAborted();
      try {
        const response = await fetcher(url, { ...init,
          signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
          redirect: 'error', cache: 'no-store', credentials: 'omit' });
        if (response.ok) return response;
        const status = response.status;
        const wait = Number(response.headers.get('retry-after'));
        await response.body?.cancel();
        if (status !== 429 && status < 500) throw new SourceHttpError(status);
        if (attempt === 3) throw new SourceHttpError(status);
        await sleep(Number.isFinite(wait) && wait > 0 ? Math.min(wait * 1000, 30000) : 1000 * 2 ** attempt, undefined, { signal });
      } catch (error) {
        if (signal.aborted || attempt === 3 || error instanceof SourceHttpError && error.status < 500 && error.status !== 429) throw error;
        await sleep(1000 * 2 ** attempt, undefined, { signal });
      }
    }
    throw new Error('Request failed.');
  };
}
