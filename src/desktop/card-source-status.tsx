export function CardSourceStatus({ card }: { card: object }) {
  return 'source_missing' in card && card.source_missing === true
    ? <span className="source-status" title="Retained from a previous download so existing decks remain readable">Not in latest official catalog</span>
    : null;
}
