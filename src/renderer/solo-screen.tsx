import { Button } from './ui/button';
import { useEffect, useRef, useState } from 'react';
import type { Deck, SoloDeckReadiness, SoloOpponent, SoloPreview, SoloSetup } from '../contract';
import { UnfinishedGames } from '../deckscape/components/simulator/unfinished-games';
import type { MatchDirectoryCursor, UnfinishedMatchPage } from '../deckscape/lib/simulator/match-directory';

function Readiness({ label, value }: { label: string; value: SoloDeckReadiness }) {
  return <section aria-label={label + ' deck checks'} className="solo-checks">
    <h2>{label}</h2><p>Deck legality: <strong>{value.legal ? 'legal' : 'needs attention'}</strong></p>
    {!!value.legalityIssues.length && <ul>{value.legalityIssues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
    <p>Solo support: <strong>{value.supported ? 'supported' : 'needs attention'}</strong></p>
    {!!value.supportIssues.length && <ul>{value.supportIssues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
  </section>;
}

export function SoloScreen({ initialDeckId, cursor }: { initialDeckId?: string; cursor?: MatchDirectoryCursor }) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [opponents, setOpponents] = useState<SoloOpponent[]>([]);
  const [unfinished, setUnfinished] = useState<UnfinishedMatchPage | null>(null);
  const [deckId, setDeckId] = useState('');
  const [opponentKey, setOpponentKey] = useState('');
  const [preview, setPreview] = useState<SoloPreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const request = useRef({ selection: '', id: '' });
  useEffect(() => {
    let disposed = false;
    Promise.all([window.neuroscape.listDecks(), window.neuroscape.soloOpponents(), window.neuroscape.listUnfinishedMatches(cursor)])
      .then(([decks, opponents, matches]) => {
        if (disposed) return;
        if (!decks.ok) throw new Error(decks.error.message);
        if (!opponents.ok) throw new Error(opponents.error.message);
        if (!matches.ok) throw new Error(matches.error.message);
        setDecks(decks.data); setOpponents(opponents.data); setUnfinished(matches.data);
        setDeckId(decks.data.find(deck => deck.id === initialDeckId)?.id ?? decks.data[0]?.id ?? '');
        setOpponentKey(opponents.data.find(opponent => opponent.available !== false)?.key ?? '');
      }).catch(error => { if (!disposed) setError(String(error.message)); });
    return () => { disposed = true; };
  }, [initialDeckId, cursor?.id, cursor?.updatedAt]);
  useEffect(() => {
    let disposed = false; setPreview(null); setError('');
    if (deckId && opponentKey) window.neuroscape.previewSolo(deckId, opponentKey).then(result => {
      if (disposed) return;
      if (!result.ok) setError(result.error.message); else setPreview(result.data);
    }).catch(() => { if (!disposed) setError('The matchup could not be checked. Refresh checks to try again.'); });
    return () => { disposed = true; };
  }, [deckId, opponentKey, refresh]);
  async function create() {
    if (!preview) return;
    const selection = JSON.stringify([deckId, preview.deckRevision, opponentKey]);
    if (request.current.selection !== selection) request.current = { selection, id: crypto.randomUUID() };
    setBusy(true); setError('');
    try {
      const result = await window.neuroscape.createSoloSetup({ requestId: request.current.id, deckId,
        expectedRevision: preview.deckRevision, opponentKey });
      if (!result.ok) { setError(result.error.message); return; }
      window.location.hash = '/solo/setup/' + result.data.id;
    } catch { setError('The setup could not be saved. Retry to recover the same setup.'); }
    finally { setBusy(false); }
  }
  return <section className="solo-screen"><h1>Fight a bot</h1>
    <p className="intro">Choose a saved deck and a supplied opponent. Check deck legality and solo support before saving the matchup.</p>
    {error && <p role="alert" className="error-message">{error}</p>}
    {unfinished && <UnfinishedGames page={unfinished} />}
    <div className="solo-selection"><div><label htmlFor="solo-player-deck">Your deck</label><select id="solo-player-deck" value={deckId} disabled={busy} onChange={event => setDeckId(event.target.value)}>
      {!decks.length && <option value="">Create a deck first</option>}
      {decks.map(deck => <option key={deck.id} value={deck.id}>{deck.name}</option>)}
    </select></div><div><label htmlFor="solo-opponent">Bot opponent</label><select id="solo-opponent" value={opponentKey} disabled={busy} onChange={event => setOpponentKey(event.target.value)}>
      {!opponents.some(opponent => opponent.available !== false) && <option value="">No compatible opponents</option>}
      {opponents.map(opponent => <option key={opponent.key} value={opponent.key} disabled={opponent.available === false}>{opponent.name}{opponent.available === false ? ' — unavailable' : ''}</option>)}
    </select></div></div>
    <p className="muted">{opponents.find(opponent => opponent.key === opponentKey)?.strategyLabel ?? 'General strategy'}, saved with your matchup.</p>
    {opponents.some(opponent => opponent.available === false) && <section aria-label="Unavailable opponents"><h2>Unavailable opponents</h2><ul>
      {opponents.filter(opponent => opponent.available === false).map(opponent => <li key={opponent.key}>{opponent.name}: {opponent.unavailableReason}</li>)}
    </ul></section>}
    {preview ? <div className="solo-check-grid"><Readiness label="Player" value={preview.player} /><Readiness label="Bot" value={preview.bot} /></div>
      : deckId && opponentKey ? <p role="status">Checking the matchup…</p> : <p><a href="#/decks">Build or import a deck</a> to choose a matchup.</p>}
    <div className="deck-import-actions"><Button onClick={create} disabled={busy || !preview?.player.ready || !preview.bot.ready}>
      {busy ? 'Saving setup…' : 'Create match setup'}</Button>
      <Button variant="secondary" disabled={busy || !deckId || !opponentKey} onClick={() => setRefresh(value => value + 1)}>Refresh checks</Button></div>
  </section>;
}

export function SoloSetupScreen({ id }: { id: string }) {
  const [setup, setSetup] = useState<SoloSetup | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    window.neuroscape.readSoloSetup(id).then(result => { if (!disposed) { if (result.ok) setSetup(result.data); else setError(result.error.message); } })
      .catch(() => { if (!disposed) setError('This match setup could not be opened.'); });
    return () => { disposed = true; };
  }, [id]);
  return <section className="solo-screen"><a href="#/solo">Back to matchups</a><h1>Saved match setup</h1>
    {error && <p role="alert">{error}</p>}
    {setup ? <><p className="intro">{setup.playerDeck.name} vs {setup.opponent.name}</p>
      <p>Your decks, reviewed cards, artwork and rules are pinned for this matchup.</p>
      <dl><dt>Player deck</dt><dd>{setup.playerDeck.name} · revision {setup.playerDeck.revision}</dd>
        <dt>Rules</dt><dd>{setup.rulesVersion}</dd><dt>Engine</dt><dd>{setup.engineVersion}</dd>
        <dt>Saved</dt><dd>{new Date(setup.createdAt).toLocaleString()}</dd></dl>
      <p className="muted">Open this matchup to continue setup or play.</p>
      <a className="button" href={'#/matches/' + setup.id}>Enter match</a></>
      : !error && <p role="status">Opening your match setup…</p>}
  </section>;
}
