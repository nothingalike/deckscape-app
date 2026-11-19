import type { Deck } from './types';

// Extracted unchanged from the hosted draft download's JSON payload.
export function deckBackupText(deck: Deck) {
  return JSON.stringify({ format: 'deckscape-backup', version: 1, deck }, null, 2);
}
