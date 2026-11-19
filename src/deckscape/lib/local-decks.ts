import type { Deck } from './types';
import type { AppResult } from '../../contract';

// Desktop persistence keeps the hosted editor interface asynchronous while the
// service owns revisions, timestamps, validation and durable SQLite writes.
function unwrap<T>(result: AppResult<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}
export async function readLocalDeck(id: string): Promise<Deck> {
  return unwrap(await window.neuroscape.readDeck(id));
}
export async function saveLocalDeck(deck: Deck, expectedRevision: number): Promise<Deck> {
  return unwrap(await window.neuroscape.saveDeck(deck, expectedRevision));
}
export async function createLocalDeck(name: string): Promise<Deck> {
  return unwrap(await window.neuroscape.createDeck(name));
}
export async function listLocalDecks(): Promise<Deck[]> {
  return unwrap(await window.neuroscape.listDecks());
}
export async function deleteLocalDeck(id: string, expectedRevision: number) {
  return unwrap(await window.neuroscape.deleteDeck(id, expectedRevision));
}
