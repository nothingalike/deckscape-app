import { useEffect, useRef, useState } from 'react';

/** Committed local revisions replace the hosted participant broadcast channel. */
export type RevisionNotice = { version: 1; resource: 'match' | 'room' | 'watch' | 'access'; id: string; revision: number };
export function useParticipantRevisions(onChange: (notice: RevisionNotice | null, healthy: boolean) => void) {
  const latest = useRef(onChange); latest.current = onChange;
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const unsubscribe = window.neuroscape.onMatchRevision(notice => {
      setConnected(notice !== null);
      latest.current(notice ? { version: 1, resource: 'match', ...notice } : null, notice !== null);
    });
    setConnected(true);
    return unsubscribe;
  }, []);
  return connected;
}
export function revisionFallbackDelay(connected: boolean, fast: number) {
  return connected ? 30000 * (0.9 + Math.random() * 0.2) : fast;
}
