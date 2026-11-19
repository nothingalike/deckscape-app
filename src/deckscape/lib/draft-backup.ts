import type { Deck } from "./types";
export async function downloadDeck(deck: Deck) {
  const result = await window.neuroscape.saveDeckBackup(deck);
  if (!result.ok) throw new Error(result.error.message);
  return result.data.saved;
}
export const backupKey = (id: string) => "deckscape:unsaved:" + (window.neuroscape.profileGeneration ? window.neuroscape.profileGeneration + ":" : "") + id;
export const draftContent = (d: Deck) =>
  JSON.stringify({
    name: d.name,
    description: d.description,
    entries: d.entries,
  });
