import type { Card, SoloSupport } from '../contract';
import type { Entry } from '../deckscape/lib/types';

export function CardSoloSupport({ card }: { card: object }) {
  const current = 'solo_support' in card ? card.solo_support as SoloSupport | undefined : undefined;
  if (!current) return null;
  return <span className={'solo-support is-' + current.status} title={current.reasons.join(' ')}>
    Solo: {current.status === 'supported' ? 'supported' : current.status === 'unsupported' ? 'unsupported' : 'review required'}
  </span>;
}

/** Display catalog support independently of the editor's existing legality rules. */
export function SoloDeckStatus({ entries, cards }: { entries: Entry[]; cards: Card[] }) {
  const issues = [...new Set(entries.map(entry => entry.card_id))].flatMap(id => {
    const card = cards.find(card => card.id === id);
    if (!card) return [`${id}: unresolved card. Update cards or repair the deck.`];
    return card.solo_support?.status === 'supported' ? []
      : (card.solo_support?.reasons ?? ['Solo support is unavailable.']).map(reason => `${card.name}: ${reason}`);
  });
  if (!entries.length) return <p className="muted">Solo card support: add cards to check</p>;
  return issues.length ? <details className="solo-deck-status"><summary>Solo card support: needs attention</summary>
    <ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></details>
    : <p className="muted">Solo card support: supported</p>;
}
