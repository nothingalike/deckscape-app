import { Button } from './ui/button';
import { useEffect, useState } from 'react';
import type { Card, Deck } from '../contract';
import { Editor } from '../deckscape/components/editor';
import { WorkspaceDeckList } from '../deckscape/components/workspace-deck-list';
import { createLocalDeck, listLocalDecks, readLocalDeck } from '../deckscape/lib/local-decks';
import { ImportDeck } from '../deckscape/components/import-deck';
import { StarterPicker } from './starter-picker';

export function DecksScreen({ id }: { id?: string }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    let disposed = false;
    async function load() {
      setLoading(true); setError(''); setDeck(null);
      const all: Card[] = [];
      while (!disposed) {
        const result = await window.neuroscape.listCards({ offset: all.length });
        if (!result.ok) throw new Error(result.error.message);
        all.push(...result.data.items);
        if (all.length >= result.data.total) break;
        if (!result.data.items.length) throw new Error('The local card library could not be read completely.');
      }
      const opened = id ? await readLocalDeck(id) : null;
      const listed = id ? [] : await listLocalDecks();
      if (!disposed) { setCards(all); setDeck(opened); setDecks(listed); }
    }
    load().catch(error => { if (!disposed) setError(error.message); }).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [id]);
  async function create() {
    setCreating(true); setError('');
    try { const deck = await createLocalDeck('Untitled deck'); window.location.hash = '/decks/' + deck.id; }
    catch (error) { setError(error instanceof Error ? error.message : 'The deck could not be created. Try again.'); }
    finally { setCreating(false); }
  }
  if (loading) return <p role="status">Opening your decks…</p>;
  if (id) return deck ? <Editor key={deck.id} initial={deck} cards={cards} local signedIn={false} />
    : <section><h1>Deck unavailable</h1><p role="alert">{error}</p><a href="#/decks">Back to My decks</a></section>;
  return <section className="decks-screen">
    <div className="catalog-heading"><div><h1>My decks</h1><p className="intro">Build, revise, and keep your decks on this computer.</p></div>
      <Button onClick={create} disabled={creating}>{creating ? 'Creating…' : 'New deck'}</Button></div>
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="deck-import-actions"><ImportDeck cards={cards} /><StarterPicker /></div>
    {!cards.length && <p className="notice">Your card library is empty. <a href="#/cards">Download cards</a> to start adding them to a deck.</p>}
    <WorkspaceDeckList decks={decks} cards={cards} local />
    {!decks.length && <p className="muted">Create your first deck to get started. Incomplete decks are saved as editable drafts.</p>}
  </section>;
}
