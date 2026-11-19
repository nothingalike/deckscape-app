import { useEffect, useState } from 'react';
import type { Card, CatalogStatus } from '../contract';
import { Catalog } from '../deckscape/components/catalog';
import { CardPreview } from '../deckscape/components/card-preview';
import { Button } from './ui/button';
import { Card as Panel, CardContent } from './ui/card';
import { Download, X } from 'lucide-react';

export function CatalogScreen({ cardId }: { cardId?: string }) {
  const [status, setStatus] = useState<CatalogStatus | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [error, setError] = useState('');
  async function refreshStatus() {
    try {
      const result = await window.neuroscape.catalogStatus();
      if (result.ok) setStatus(result.data); else setError(result.error.message);
    } catch { setError('The local catalog is unavailable. Reopen the app to recover your downloaded cards.'); }
  }
  useEffect(() => { void refreshStatus(); }, []);
  useEffect(() => {
    if (!status?.running) return;
    const interval = setInterval(() => { void refreshStatus(); }, 500);
    return () => clearInterval(interval);
  }, [status?.running]);
  useEffect(() => {
    let disposed = false;
    async function load() {
      const all: Card[] = [];
      while (!disposed) {
        const result = await window.neuroscape.listCards({ offset: all.length });
        if (!result.ok) throw new Error(result.error.message);
        all.push(...result.data.items);
        if (all.length >= result.data.total) { if (!disposed) setCards(all); return; }
        if (!result.data.items.length) throw new Error('The local catalog could not be read completely.');
      }
    }
    load().catch(error => { if (!disposed) setError(error.message); });
    return () => { disposed = true; };
  }, [status?.snapshotId]);
  async function sync() {
    setError('');
    try {
      const result = await window.neuroscape.syncCatalog();
      if (!result.ok) setError(result.error.message);
      await refreshStatus();
    } catch { setError('The download could not start. Check your connection and retry.'); }
  }
  async function cancel() {
    try {
      const result = await window.neuroscape.cancelCatalog();
      if (!result.ok) setError(result.error.message);
      await refreshStatus();
    } catch { setError('The update could not be canceled. Reopen the app to recover your downloaded cards.'); }
  }
  const detail = cards.find(card => card.id === cardId);
  return <section className="catalog-screen">
    <div className="catalog-heading"><div><h1>Build from the source.</h1><p className="intro">Your official card library, ready when you are.</p></div>
      <div className="sync-actions"><Button onClick={sync} disabled={!status || status.running}><Download aria-hidden="true" />{status?.running ? 'Updating cards…' : 'Update cards'}</Button>{status?.running && <Button variant="secondary" onClick={cancel}><X aria-hidden="true" />Cancel update</Button>}</div></div>
    <Panel className="catalog-summary py-4"><CardContent role="status">
      {!status ? 'Opening your local catalog…' : status.running ? `${status.progress?.phase === 'artwork' ? 'Downloading artwork' : status.progress?.phase === 'activating' ? 'Activating catalog' : 'Reading catalog'} · ${status.progress?.done ?? 0} of ${status.progress?.total || '…'}`
        : status.count ? `${status.count} cards on this computer · Last updated ${new Date(status.lastSyncedAt!).toLocaleString()}` : 'Download the card catalog to get started. An internet connection is required for this first download.'}
      {status?.lastResult && !status.running && <span className="sync-result">Added {status.lastResult.added} · Changed {status.lastResult.changed} · Missing {status.lastResult.missing}</span>}
    </CardContent></Panel>
    {(error || ['failed','canceled','interrupted'].includes(status?.progress?.phase ?? '')) && <p className="error-message" role="alert">{error || status?.progress?.message}</p>}
    {Boolean(status?.count) && <div className="hosted-catalog"><Catalog cards={cards} /></div>}
    {detail && <CardPreview card={detail} onClose={() => { window.location.hash = '/cards'; }} />}
  </section>;
}
