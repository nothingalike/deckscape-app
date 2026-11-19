import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { AppResult, Card, Deck, DeckImportPreview, StarterDeck } from './contract';
import { localDeckSchema } from './deckscape/lib/deck-record';
import { parseDeckBackup, MAX_BACKUP_BYTES } from './deckscape/lib/import-backup';
import { validateDeck } from './deckscape/lib/validation';
import { resolveStarters } from './deckscape/lib/starter-decks';
import starterManifest from './deckscape/data/starter-decks.json';

const importInput = z.object({ format: z.literal('json'), text: z.string().max(MAX_BACKUP_BYTES) }).strict();
const commands = z.discriminatedUnion('type', [
  z.object({ type: z.literal('deck.create'), name: z.string().max(120) }).strict(),
  z.object({ type: z.literal('deck.list') }).strict(),
  z.object({ type: z.literal('deck.read'), id: z.uuid() }).strict(),
  z.object({ type: z.literal('deck.save'), deck: localDeckSchema, expectedRevision: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal('deck.delete'), id: z.uuid(), expectedRevision: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal('deck.previewImport'), input: importInput }).strict(),
  z.object({ type: z.literal('deck.import'), input: importInput }).strict(),
  z.object({ type: z.literal('deck.starters') }).strict(),
  z.object({ type: z.literal('deck.importStarter'), key: z.string().max(80) }).strict(),
]);

export function createDecks(db: DatabaseSync, readCards: () => Card[]) {
  if (Number(db.prepare('PRAGMA user_version').get()?.user_version) < 5) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE decks(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, updated_at TEXT NOT NULL, payload TEXT NOT NULL);
    PRAGMA user_version=5; COMMIT;`);
  function insert(content: Pick<Deck, 'name' | 'description' | 'entries'>) {
    const deck: Deck = { ...content, id: randomUUID(), revision: 1, updated_at: new Date().toISOString() };
    db.prepare('INSERT INTO decks VALUES(?,?,?,?)').run(deck.id, deck.revision, deck.updated_at, JSON.stringify(deck));
    return deck;
  }
  return {
    execute(input: unknown): AppResult<Deck | Deck[] | DeckImportPreview | StarterDeck[] | { deleted: boolean }> {
      const parsed = commands.safeParse(input);
      if (!parsed.success) return { ok: false, error: { code: 'INVALID_REQUEST', message: 'The requested deck operation is invalid.' } };
      const command = parsed.data;
      if (command.type === 'deck.create') {
        return { ok: true, data: insert({ name: command.name, description: '', entries: [] }) };
      }
      if (command.type === 'deck.starters' || command.type === 'deck.importStarter') {
        const cards = readCards();
        let starters;
        try { starters = resolveStarters(starterManifest, cards); }
        catch (error) { return { ok: false, error: { code: 'STARTER_UNAVAILABLE', message: error instanceof Error ? error.message : 'Update the card library before importing a starter.' } }; }
        if (command.type === 'deck.starters') return { ok: true, data: starters };
        const starter = starters.find(starter => starter.key === command.key);
        return starter ? { ok: true, data: insert({ name: starter.name, description: starter.description, entries: starter.entries }) }
          : { ok: false, error: { code: 'INVALID_REQUEST', message: 'Choose one of the supplied starters.' } };
      }
      if (command.type === 'deck.previewImport' || command.type === 'deck.import') {
        let content;
        try { content = parseDeckBackup(command.input.text); }
        catch (error) { return { ok: false, error: { code: 'INVALID_IMPORT', message: error instanceof Error ? error.message : 'This deck backup could not be read.' } }; }
        const cards = readCards();
        const known = new Set(cards.map(card => card.id));
        const preview: DeckImportPreview = { content, issues: validateDeck(content.entries, cards),
          unresolvedCardIds: [...new Set(content.entries.filter(entry => !known.has(entry.card_id)).map(entry => entry.card_id))], addedBasicRam: false };
        return { ok: true, data: command.type === 'deck.import' ? insert(content) : preview };
      }
      if (command.type === 'deck.list') {
        return { ok: true, data: db.prepare('SELECT payload FROM decks ORDER BY updated_at DESC,id').all().map(row => localDeckSchema.parse(JSON.parse(String(row.payload)))) };
      }
      if (command.type === 'deck.read') {
        const row = db.prepare('SELECT payload FROM decks WHERE id=?').get(command.id);
        return row ? { ok: true, data: localDeckSchema.parse(JSON.parse(String(row.payload))) }
          : { ok: false, error: { code: 'NOT_FOUND', message: 'This deck is no longer available. Your other decks are still on this computer.' } };
      }
      if (command.type === 'deck.delete') {
        const removed = db.prepare('DELETE FROM decks WHERE id=? AND revision=?').run(command.id, command.expectedRevision);
        return removed.changes ? { ok: true, data: { deleted: true } }
          : { ok: false, error: { code: 'REVISION_CONFLICT', message: 'CONFLICT: This deck changed. Reload before deleting it.' } };
      }
      const deck: Deck = { ...command.deck, revision: command.expectedRevision + 1, updated_at: new Date().toISOString() };
      const saved = db.prepare('UPDATE decks SET revision=?,updated_at=?,payload=? WHERE id=? AND revision=?')
        .run(deck.revision, deck.updated_at, JSON.stringify(deck), deck.id, command.expectedRevision);
      return saved.changes ? { ok: true, data: deck }
        : { ok: false, error: { code: 'REVISION_CONFLICT', message: 'CONFLICT: This deck changed. Reload before saving again. Your unsaved edits are still available.' } };
    },
  };
}
