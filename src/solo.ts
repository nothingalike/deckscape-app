import { z } from 'zod';
import { createHash, randomBytes } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { AppResult, Card, Deck, SoloDeckReadiness, SoloPreview, SoloSupport, SoloSetup } from './contract';
import { localDeckSchema } from './deckscape/lib/deck-record';
import { sourceCard } from './deckscape/lib/catalog-import';
import { sourceMechanicsHash } from './deckscape/lib/simulator/review-integrity';
import { assessDeckReadiness } from './deckscape/lib/simulator/deck-readiness';
import { validateDeck } from './deckscape/lib/validation';
import type { Entry } from './deckscape/lib/types';
import { bundledSoloContent, type SoloContent } from './solo-content';
import { versionDefinition } from './deckscape/lib/simulator/definition-version';
import { createAdmittedSetup } from './deckscape/lib/simulator/deck-admission';
import { initialRandomState } from './deckscape/lib/simulator/random';
import { botPlaybookSchema } from './deckscape/lib/simulator/bot-playbook';

export interface StoredSetup {
  summary: SoloSetup;
  decks: [Deck, { key: string; name: string; entries: Entry[] }];
  definitions: ReturnType<typeof versionDefinition>[];
  cards: Card[];
  artwork: { cardId: string; path: string; sha256: string; definitionPath: string }[];
  playbook: z.infer<typeof botPlaybookSchema>;
  state: ReturnType<typeof createAdmittedSetup>;
}

const commands = z.discriminatedUnion('type', [
  z.object({ type: z.literal('solo.opponents') }).strict(),
  z.object({ type: z.literal('solo.preview'), deckId: z.uuid(), opponentKey: z.string().min(1).max(80) }).strict(),
  z.object({ type: z.literal('solo.createSetup'), requestId: z.uuid(), deckId: z.uuid(),
    expectedRevision: z.number().int().positive(), opponentKey: z.string().min(1).max(80) }).strict(),
  z.object({ type: z.literal('solo.readSetup'), id: z.uuid() }).strict(),
  z.object({ type: z.literal('solo.listSetups') }).strict(),
]);

export function createSolo(db: DatabaseSync, profileDirectory: string, readCards: () => Card[], suppliedContent: SoloContent = bundledSoloContent(), matchSeed?: string) {
  const content = structuredClone(suppliedContent);
  for (const [id, pin] of content.release.definitions) {
    const validated = versionDefinition(pin.definition, content.release.engine);
    if (validated.version !== pin.version || validated.definition.cardId !== id || validated.definition.rulesVersion !== content.release.rulesVersion)
      throw new Error('Invalid bundled solo definition.');
  }
  const availability = new Map(content.opponents.map(opponent => {
    const issues: string[] = opponent.available === false ? [opponent.unavailableReason ?? 'Packaged opponent is unavailable.'] : [];
    const book = botPlaybookSchema.safeParse(opponent.playbook);
    if (!book.success || book.data.deck !== opponent.key) issues.push('Packaged strategy does not match this opponent.');
    if ((opponent.engineVersion && opponent.engineVersion !== content.release.engine.version)
      || (opponent.rulesVersion && opponent.rulesVersion !== content.release.rulesVersion)) issues.push('This opponent requires another engine or rules version.');
    if (content.opponents.filter(other => other.key === opponent.key).length !== 1) issues.push('This opponent has a duplicate identity.');
    issues.push(...assessDeckReadiness(opponent.entries, [], content.release).issues);
    return [opponent.key, [...new Set(issues)]];
  }));
  if (Number(db.prepare('PRAGMA user_version').get()?.user_version) < 6) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE solo_setups(id TEXT PRIMARY KEY, created_at TEXT NOT NULL, selection TEXT NOT NULL, payload TEXT NOT NULL);
    PRAGMA user_version=6; COMMIT;`);

  function support(card: Card): SoloSupport {
    const pin = content.release.definitions.get(card.id);
    const fingerprint = content.mechanics.get(card.id);
    if (!pin || !fingerprint) return { status: 'unsupported', reasons: ['Not supported by this app release.'] };
    const reasons: string[] = [];
    const source = sourceCard.safeParse(card.raw);
    if (!source.success || sourceMechanicsHash(source.data) !== fingerprint) reasons.push('Card mechanics changed; review required.');
    if (!card.image_hash || !card.image_path) reasons.push('Reviewed artwork is not downloaded. Update cards.');
    else if (card.image_hash !== pin.definition.artwork?.sha256) reasons.push('Card artwork changed; review required.');
    return { status: reasons.length ? 'review-required' : 'supported', reasons };
  }
  function readiness(entries: Entry[], cards: Card[]): SoloDeckReadiness {
    const definitions = new Map(content.release.definitions);
    const supportIssues: string[] = [];
    for (const id of new Set(entries.map(entry => entry.card_id))) {
      const card = cards.find(card => card.id === id);
      if (!card) { definitions.delete(id); supportIssues.push(`${id}: card is not downloaded or unresolved. Update cards.`); continue; }
      const current = support(card);
      if (current.status !== 'supported') {
        definitions.delete(id);
        supportIssues.push(...current.reasons.map(reason => `${card.name}: ${reason}`));
      }
      else if (!verifiedArtwork(card)) supportIssues.push(`${card.name}: downloaded artwork is missing or damaged. Update cards.`);
    }
    const legalityIssues = validateDeck(entries, cards).map(issue => issue.message);
    const checked = assessDeckReadiness(entries, cards, { ...content.release, definitions });
    const allSupportIssues = [...new Set([...supportIssues, ...checked.issues.filter(issue => !legalityIssues.includes(issue))])];
    return { legal: legalityIssues.length === 0, supported: allSupportIssues.length === 0,
      ready: checked.ready && !supportIssues.length, legalityIssues, supportIssues: allSupportIssues };
  }
  function verifiedArtwork(card: Card) {
    if (!card.image_path || !/^[a-f0-9]{64}\.(png|jpg|webp)$/.test(card.image_path)) return false;
    try {
      const path = join(profileDirectory, 'artwork', card.image_path);
      const file = lstatSync(path);
      return file.isFile() && !file.isSymbolicLink() && file.size <= 10 * 1024 * 1024
        && createHash('sha256').update(readFileSync(path)).digest('hex') === card.image_hash;
    } catch { return false; }
  }
  function stored(row: Record<string, unknown>): StoredSetup { return JSON.parse(String(row.payload)); }
  return {
    support,
    execute(input: unknown): AppResult<unknown> {
      const parsed = commands.safeParse(input);
      if (!parsed.success) return { ok: false, error: { code: 'INVALID_REQUEST', message: 'The requested solo operation is invalid.' } };
      const command = parsed.data;
      if (command.type === 'solo.opponents') return { ok: true, data: content.opponents.map(({ key, name, description, strategyLabel }) => ({ key, name, description, strategyLabel,
        available: !availability.get(key)!.length, ...(availability.get(key)!.length ? { unavailableReason: availability.get(key)!.join(' ') } : {}) })) };
      if (command.type === 'solo.listSetups') return { ok: true, data: db.prepare('SELECT payload FROM solo_setups ORDER BY created_at DESC,id').all().map(row => stored(row).summary) };
      if (command.type === 'solo.readSetup') {
        const row = db.prepare('SELECT payload FROM solo_setups WHERE id=?').get(command.id);
        return row ? { ok: true, data: stored(row).summary }
          : { ok: false, error: { code: 'NOT_FOUND', message: 'This setup is no longer available.' } };
      }
      const selection = command.type === 'solo.createSetup'
        ? JSON.stringify([command.deckId, command.expectedRevision, command.opponentKey]) : '';
      if (command.type === 'solo.createSetup') {
        const prior = db.prepare('SELECT selection,payload FROM solo_setups WHERE id=?').get(command.requestId);
        if (prior) return prior.selection === selection ? { ok: true, data: stored(prior).summary }
          : { ok: false, error: { code: 'INVALID_REQUEST', message: 'This setup request already belongs to a different selection.' } };
      }
      const row = db.prepare('SELECT payload FROM decks WHERE id=?').get(command.deckId);
      if (!row) return { ok: false, error: { code: 'NOT_FOUND', message: 'Choose an available player deck.' } };
      const deck: Deck = localDeckSchema.parse(JSON.parse(String(row.payload)));
      if (command.type === 'solo.createSetup' && deck.revision !== command.expectedRevision)
        return { ok: false, error: { code: 'REVISION_CONFLICT', message: 'This deck changed. Review the current saved deck before starting a match.' } };
      const opponent = content.opponents.find(opponent => opponent.key === command.opponentKey);
      if (!opponent) return { ok: false, error: { code: 'INVALID_REQUEST', message: 'Choose a supplied bot opponent.' } };
      const cards = readCards();
      const preview: SoloPreview = { player: readiness(deck.entries, cards), bot: readiness(opponent.entries, cards), deckRevision: deck.revision };
      const unavailable = availability.get(opponent.key)!;
      if (unavailable.length) preview.bot = { ...preview.bot, ready: false, supported: false,
        supportIssues: [...new Set([...preview.bot.supportIssues, ...unavailable])] };
      if (command.type === 'solo.preview') return { ok: true, data: preview };
      if (!preview.player.ready || !preview.bot.ready)
        return { ok: false, error: { code: 'SOLO_NOT_READY', message: ['Resolve the player and bot deck issues before creating a match setup.',
          ...preview.player.legalityIssues.map(issue => `Player: ${issue}`), ...preview.player.supportIssues.map(issue => `Player: ${issue}`),
          ...preview.bot.legalityIssues.map(issue => `Bot: ${issue}`), ...preview.bot.supportIssues.map(issue => `Bot: ${issue}`)].join('\n') } };
      const ids = new Set([...deck.entries, ...opponent.entries].map(entry => entry.card_id));
      const definitions = [...ids].map(id => content.release.definitions.get(id)!);
      const pinnedCards = cards.filter(card => ids.has(card.id));
      const artwork = pinnedCards.map(card => ({ cardId: card.id, path: card.image_path!, sha256: card.image_hash!,
        definitionPath: content.release.definitions.get(card.id)!.definition.artwork!.path }));
      const state = createAdmittedSetup(['local-player', 'local-bot'], [deck.entries, opponent.entries],
        content.release.definitions, content.release.engine, initialRandomState(matchSeed ?? randomBytes(32).toString('hex')));
      const playbook = botPlaybookSchema.parse(opponent.playbook);
      const summary: SoloSetup = { id: command.requestId, phase: 'setup', createdAt: new Date().toISOString(),
        playerDeck: { id: deck.id, name: deck.name, revision: deck.revision },
        opponent: { key: opponent.key, name: opponent.name, description: opponent.description },
        engineVersion: content.release.engine.version, rulesVersion: content.release.rulesVersion,
        definitionVersions: definitions.map(pin => pin.version).sort(), artworkHashes: [...new Set(artwork.map(art => art.sha256))].sort(),
        playbookHash: createHash('sha256').update(JSON.stringify(playbook)).digest('hex') };
      const record: StoredSetup = { summary, decks: [deck, { key: opponent.key, name: opponent.name, entries: opponent.entries }],
        definitions, cards: pinnedCards, artwork, state, playbook };
      db.prepare('INSERT INTO solo_setups(id,created_at,selection,payload,updated_at) VALUES(?,?,?,?,?)')
        .run(summary.id, summary.createdAt, selection, JSON.stringify(record), summary.createdAt);
      return { ok: true, data: summary };
    },
  };
}
