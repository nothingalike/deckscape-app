import { Button } from './ui/button';
import { useState } from 'react';
import type { StarterDeck } from '../contract';

export function StarterPicker() {
  const [starters, setStarters] = useState<StarterDeck[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function choose() {
    setOpen(true); setBusy(true); setError('');
    try {
      const result = await window.neuroscape.listStarterDecks();
      if (result.ok) setStarters(result.data); else setError(result.error.message);
    } catch { setError('The starters could not be opened. Reopen the app and try again.'); }
    finally { setBusy(false); }
  }
  async function copy(key: string) {
    setBusy(true); setError('');
    try {
      const result = await window.neuroscape.importStarterDeck(key);
      if (result.ok) window.location.hash = '/decks/' + result.data.id; else setError(result.error.message);
    } catch { setError('The starter could not be saved. Your existing decks are unchanged.'); }
    finally { setBusy(false); }
  }
  return <div className="starter-picker"><Button variant="secondary" disabled={busy} onClick={choose}>Use a starter</Button>
    {open && <section aria-label="Supplied starters"><h2>Start with a supplied deck</h2>
      <p>Each choice creates an editable local copy. Your existing decks stay unchanged.</p>
      {starters.map(starter => <article key={starter.key}><h3>{starter.name}</h3><p>{starter.description}</p>
        <Button disabled={busy} onClick={() => copy(starter.key)}>Use {starter.name}</Button></article>)}
      {error && <p role="alert">{error}</p>}<Button variant="secondary" onClick={() => setOpen(false)}>Close starters</Button>
    </section>}
  </div>;
}
