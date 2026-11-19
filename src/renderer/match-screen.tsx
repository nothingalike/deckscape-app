import { useEffect, useMemo, useRef, useState } from 'react';
import type { LocalMatchView } from '../contract';
import type { SetupCommand } from '../deckscape/lib/simulator/setup';
import { SetupControls } from '../deckscape/components/simulator/setup-controls';
import { MatchClient } from '../deckscape/components/simulator/match-client';
import { createLocalMatchTransport } from '../desktop/match-transport';

export function MatchScreen({ id }: { id: string }) {
  const [match, setMatch] = useState<LocalMatchView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<{ commandId: string; expectedRevision: number; action: SetupCommand } | null>(null);
  const transport = useMemo(() => createLocalMatchTransport(id), [id]);
  const current = useRef(match); current.current = match;
  function publish(next: LocalMatchView) {
    setMatch(previous => previous?.phase === 'game' ? previous
      : previous?.phase === 'setup' && next.phase === 'setup' && previous.setup.revision > next.setup.revision ? previous : next);
  }
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (current.current?.phase === 'game') return;
      try {
        const result = await window.neuroscape.readMatch(id);
        if (disposed) return;
        if (!result.ok) { setError(result.error.message); return; }
        publish(result.data);
        if (result.data.phase === 'game') return;
        if (result.data.setup.decision.type !== 'ready' && result.data.setup.decision.seat === 1) {
          const advanced = await window.neuroscape.advanceMatchBot(id);
          if (!advanced.ok && !disposed) setError(advanced.error.message);
        }
      } catch { if (!disposed) setError('The saved match could not be read. Retry to recover committed state.'); }
      finally { if (!disposed) timer = setTimeout(poll, 750); }
    };
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [id]);
  async function submit(action?: SetupCommand) {
    if (busy) return;
    if (!pending.current && action && match?.phase === 'setup') pending.current = {
      commandId: crypto.randomUUID(), expectedRevision: match.setup.revision, action: structuredClone(action),
    };
    const command = pending.current; if (!command) return;
    setBusy(true); setError('');
    try {
      const result = await window.neuroscape.submitSetup(id, command.commandId, command.expectedRevision, command.action);
      if (!result.ok) {
        setError(result.error.message);
        if (['MATCH_REJECTED','INVALID_REQUEST'].includes(result.error.code)) { pending.current = null; setUncertain(false); }
        else setUncertain(true);
        return;
      }
      pending.current = null; setUncertain(false);
      const read = await window.neuroscape.readMatch(id);
      if (read.ok) publish(read.data); else setError(read.error.message);
    } catch { setError('The setup choice is unconfirmed. Retry the same choice to recover its receipt.'); setUncertain(true); }
    finally { setBusy(false); }
  }
  if (match?.phase === 'game') return <MatchClient initial={match.snapshot} transport={transport} matchId={id}
    playerNames={['You', match.summary.opponent.name]} botRun={{ id, roomId: id, mode: 'single' }} />;
  if (match?.phase === 'setup') return <SetupControls view={match.setup} roomId={id} disabled={busy || uncertain}
    send={action => { void submit(action); }} error={error} uncertain={uncertain} retry={() => { void submit(); }} retryDisabled={busy}
    exit={() => { window.location.hash = '/solo'; }} exitLabel="Save and return" />;
  return <section><h1>Opening your match</h1>{error ? <p role="alert">{error}</p> : <p role="status">Reading the saved matchup…</p>}
    <a href="#/solo">Back to matchups</a></section>;
}
