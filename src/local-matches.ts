import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { AppResult, LocalMatchView, MatchRevision } from './contract';
import type { StoredSetup } from './solo';
import { bundledSoloContent, type SoloContent } from './solo-content';
import { createExpandedRuntimeV6 } from './deckscape/lib/simulator/expanded-runtime-v6';
import { setupStateSchema } from './deckscape/lib/simulator/setup-state-schema';
import { projectSetup } from './deckscape/lib/simulator/setup-view';
import { setupViewSchema } from './deckscape/lib/simulator/setup-response';
import { projectCardInspection } from './deckscape/lib/simulator/card-inspection';
import { applySetupCommand, type SetupCommand } from './deckscape/lib/simulator/setup';
import { gameFromSetup } from './deckscape/lib/simulator/game-state';
import { gameCommandSchema } from './deckscape/lib/simulator/commands';
import { advanceBot } from './deckscape/lib/simulator/bot-executor';
import { readMatchBattlefield, readProgramPlayQuote, readActivationQuote, submitMatchCommand, MatchCommandRejected,
  type MatchStore, type CommandReceipt } from './deckscape/lib/simulator/match-service';
import { battlefieldSnapshotSchema } from './deckscape/lib/simulator/battlefield-response';
import { programQuoteRequestSchema } from './deckscape/lib/simulator/program-quote-contract';
import { activationQuoteRequestSchema } from './deckscape/lib/simulator/activation-quote-contract';
import { listUnfinishedMatches, matchDirectoryCursorSchema, type MatchDirectoryCursor } from './deckscape/lib/simulator/match-directory';

const revision = z.number().int().nonnegative();
const setupAction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('choose-starter'), startingPlayer: z.union([z.literal(0), z.literal(1)]) }).strict(),
  z.object({ type: z.literal('mulligan'), bottomOrder: z.array(z.string().min(1).max(100)).max(5) }).strict(),
]);
export const localMatchCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('match.list'), cursor: matchDirectoryCursorSchema.nullable().optional() }).strict(),
  z.object({ type: z.literal('match.read'), id: z.uuid() }).strict(),
  z.object({ type: z.literal('match.setup'), id: z.uuid(), commandId: z.uuid(), expectedRevision: revision, action: setupAction }).strict(),
  z.object({ type: z.literal('match.command'), id: z.uuid(), commandId: z.uuid(), command: gameCommandSchema }).strict(),
  z.object({ type: z.literal('match.bot'), id: z.uuid() }).strict(),
  z.object({ type: z.literal('match.programQuote'), id: z.uuid(), input: programQuoteRequestSchema }).strict(),
  z.object({ type: z.literal('match.activationQuote'), id: z.uuid(), input: activationQuoteRequestSchema }).strict(),
]);
const player = 'local-player', bot = 'local-bot';
class IncompatibleMatch extends Error {}

/** Keep fractional precision while normalizing offsets; the terminator sorts before decimal digits. */
function timestampKey(value: string) {
  const zone = '(?:Z|[+-]\\d{2}:?\\d{2})$';
  const fraction = value.match(new RegExp('\\.(\\d+)' + zone))?.[1].replace(/0+$/, '') ?? '';
  const seconds = value.replace(new RegExp('\\.\\d+(?=' + zone + ')'), '');
  return new Date(seconds).toISOString().slice(0, 19) + '.' + fraction + '!';
}

/** Shared by normal profile opening and validated predecessor staging. */
export function migrateLocalMatchSchema(db:DatabaseSync){
  if (Number(db.prepare('PRAGMA user_version').get()?.user_version) < 7) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE matches(id TEXT PRIMARY KEY REFERENCES solo_setups(id), revision INTEGER NOT NULL, engine_version TEXT NOT NULL,
      rules_version TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE match_receipts(match_id TEXT NOT NULL REFERENCES matches(id), command_id TEXT NOT NULL, actor_id TEXT NOT NULL,
      expected_revision INTEGER NOT NULL, accepted_revision INTEGER NOT NULL, command_json TEXT NOT NULL, PRIMARY KEY(match_id,command_id));
    CREATE TABLE setup_receipts(setup_id TEXT NOT NULL REFERENCES solo_setups(id), command_id TEXT NOT NULL, actor_id TEXT NOT NULL,
      expected_revision INTEGER NOT NULL, accepted_revision INTEGER NOT NULL, command_json TEXT NOT NULL, PRIMARY KEY(setup_id,command_id));
    PRAGMA user_version=7; COMMIT;`);
  if (Number(db.prepare('PRAGMA user_version').get()?.user_version) < 8) db.exec(`BEGIN IMMEDIATE;
    ALTER TABLE solo_setups ADD COLUMN updated_at TEXT;
    UPDATE solo_setups SET updated_at=created_at;
    PRAGMA user_version=8; COMMIT;`);
}

/** Local persistence/transport adapter. The copied runtime owns every game rule. */
export function createLocalMatches(db: DatabaseSync, suppliedContent: SoloContent = bundledSoloContent(), onRevision: (notice: MatchRevision) => void = () => {}) {
  migrateLocalMatchSchema(db);
  db.function('match_timestamp_key', { deterministic: true }, value => timestampKey(String(value)));
  const content = structuredClone(suppliedContent);
  const release = createExpandedRuntimeV6('neuroscape://art', content.release);
  const resolve = (engine: string, rules: string) => {
    if (engine !== 'expanded-v6' || engine !== content.release.engine.version || rules !== content.release.rulesVersion)
      throw new IncompatibleMatch(`This saved match requires another app version (engine ${engine}, rules ${rules}). Your save is kept unchanged.`);
    return release.runtime;
  };
  const queues = new Map<string, Promise<unknown>>();
  let closed = false;
  function serialized<T>(id: string, action: () => Promise<T>): Promise<T> {
    const previous = queues.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(action);
    queues.set(id, next);
    void next.finally(() => { if (queues.get(id) === next) queues.delete(id); }).catch(() => {});
    return next;
  }
  function setup(id: string): StoredSetup {
    const row = db.prepare('SELECT payload FROM solo_setups WHERE id=?').get(id);
    if (!row) throw new MatchCommandRejected('This match setup is no longer available.');
    const saved: StoredSetup = JSON.parse(String(row.payload));
    resolve(saved.summary.engineVersion, saved.summary.rulesVersion);
    for (const pin of saved.definitions) {
      if (content.release.definitions.get(pin.definition.cardId)?.version !== pin.version)
        throw new IncompatibleMatch('This saved match requires reviewed card definitions that are unavailable in this app version. Your save is kept unchanged.');
    }
    saved.state = setupStateSchema.parse(saved.state);
    return saved;
  }
  function receipt(table: 'setup_receipts' | 'match_receipts', id: string, commandId: string): CommandReceipt | null {
    const key = table === 'setup_receipts' ? 'setup_id' : 'match_id';
    const row = db.prepare(`SELECT * FROM ${table} WHERE ${key}=? AND command_id=?`).get(id, commandId);
    return row ? { actorId: String(row.actor_id), expectedRevision: Number(row.expected_revision), revision: Number(row.accepted_revision),
      command: JSON.parse(String(row.command_json)) } : null;
  }
  function checkReceipt(prior: CommandReceipt, actor: string, expectedRevision: number, command: unknown) {
    if (prior.actorId !== actor || prior.expectedRevision !== expectedRevision || !isDeepStrictEqual(prior.command, command))
      throw new MatchCommandRejected('Command id was reused with different input');
  }
  const store: MatchStore = {
    async load(id) {
      const row = db.prepare('SELECT * FROM matches WHERE id=?').get(id);
      return row ? { id, player0: player, player1: bot, engineVersion: String(row.engine_version), rulesVersion: String(row.rules_version),
        revision: Number(row.revision), state: JSON.parse(String(row.payload)) } : null;
    },
    async receipt(id, commandId) { return receipt('match_receipts', id, commandId); },
    async commit(id, commandId, actor, command, next) {
      db.exec('BEGIN IMMEDIATE;');
      try {
        const prior = receipt('match_receipts', id, commandId);
        if (prior) { checkReceipt(prior, actor, command.expectedRevision, command); db.exec('COMMIT;'); return { applied: false, acceptedRevision: prior.revision }; }
        const saved = db.prepare('UPDATE matches SET revision=?,payload=? WHERE id=? AND revision=?')
          .run(next.revision, JSON.stringify(next), id, command.expectedRevision);
        if (!saved.changes) throw new MatchCommandRejected('Stale match revision');
        db.prepare('INSERT INTO match_receipts VALUES(?,?,?,?,?,?)').run(id, commandId, actor, command.expectedRevision, next.revision, JSON.stringify(command));
        db.prepare('UPDATE solo_setups SET updated_at=? WHERE id=?').run(new Date().toISOString(), id);
        db.exec('COMMIT;'); onRevision({ id, revision: next.revision }); return { applied: true, acceptedRevision: next.revision };
      } catch (error) { db.exec('ROLLBACK;'); throw error; }
    },
  };
  function submitSetup(id: string, commandId: string, actor: string, expectedRevision: number, action: SetupCommand) {
    const prior = receipt('setup_receipts', id, commandId);
    if (prior) { checkReceipt(prior, actor, expectedRevision, action); return { status: 'accepted' as const, acceptedRevision: prior.revision }; }
    const saved = setup(id);
    const result = applySetupCommand(saved.state, actor, expectedRevision, action);
    if (!result.accepted) throw new MatchCommandRejected('This setup choice is unavailable: ' + result.reason);
    const runtime = resolve(saved.summary.engineVersion, saved.summary.rulesVersion);
    const game = result.state.decision.type === 'ready' ? runtime.decodeState(runtime.commands.settle(runtime.decodeState(
      gameFromSetup(result.state, saved.summary.engineVersion, saved.summary.rulesVersion)))) : null;
    saved.state = result.state;
    db.exec('BEGIN IMMEDIATE;');
    try {
      const updated = db.prepare("UPDATE solo_setups SET payload=?,updated_at=? WHERE id=? AND json_extract(payload,'$.state.revision')=?")
        .run(JSON.stringify(saved), new Date().toISOString(), id, expectedRevision);
      if (!updated.changes) throw new MatchCommandRejected('Stale setup revision');
      if (game) db.prepare('INSERT INTO matches VALUES(?,?,?,?,?)').run(id, game.revision, game.engineVersion, game.rulesVersion, JSON.stringify(game));
      db.prepare('INSERT INTO setup_receipts VALUES(?,?,?,?,?,?)').run(id, commandId, actor, expectedRevision, result.state.revision, JSON.stringify(action));
      db.exec('COMMIT;');
      onRevision({ id, revision: result.state.revision });
      return { status: 'accepted' as const, acceptedRevision: result.state.revision };
    } catch (error) { db.exec('ROLLBACK;'); throw error; }
  }
  async function read(id: string): Promise<LocalMatchView> {
    const saved = setup(id);
    if (await store.load(id)) return { phase: 'game', summary: saved.summary,
      snapshot: battlefieldSnapshotSchema.parse(await readMatchBattlefield(store, resolve, id, player)) };
    const visible = projectSetup(saved.state, player);
    const inspect = (card: { definitionVersion: string }) => {
      const pin = saved.definitions.find(pin => pin.version === card.definitionVersion);
      if (!pin) throw new Error('Pinned card presentation is unavailable.');
      return projectCardInspection(pin.definition.characteristics, pin.definition.artwork ? 'neuroscape://art/' + pin.definition.artwork.path : undefined);
    };
    const view = { ...visible, players: visible.players.map(seat => ({ ...seat, mainframe: { ...seat.mainframe, ...inspect(seat.mainframe) },
      ...(seat.hand ? { hand: seat.hand.map(card => ({ ...card, ...inspect(card) })) } : {}) })) };
    return { phase: 'setup', summary: saved.summary, setup: setupViewSchema.parse(view) };
  }
  async function tick(id: string) {
    let saved = setup(id), applied = 0;
    // The hosted bot chooses itself to start and keeps its opening hand.
    for (let n = 0; n < 3 && saved.state.decision.type !== 'ready' && saved.state.decision.seat === 1; n++) {
      const action: SetupCommand = saved.state.decision.type === 'choose-starter'
        ? { type: 'choose-starter', startingPlayer: 1 } : { type: 'mulligan', bottomOrder: [] };
      const hash = createHash('sha256').update(JSON.stringify([id, saved.state.revision, action])).digest('hex');
      const commandId = `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
      submitSetup(id, commandId, bot, saved.state.revision, action); applied++; saved = setup(id);
    }
    if (!await store.load(id)) return { applied, waiting: true, finished: false };
    const advanced = await advanceBot(store, resolve, id, bot, saved.playbook, 24);
    const latest = (await store.load(id))!;
    return { applied: applied + advanced.applied, waiting: advanced.waiting,
      finished: resolve(latest.engineVersion, latest.rulesVersion).decodeState(latest.state).outcome !== null };
  }
  async function directory(cursor: MatchDirectoryCursor | null) {
    const metadata = new Map<string, { saved: StoredSetup; stage: 'setup' | 'game' }>();
    const page = await listUnfinishedMatches({
      async rpc(_name, input) {
        // PostgreSQL's timestamp/UUID RPC normalizes these values; preserve that behavior in SQLite text keys.
        const before = input.p_before_updated_at === null ? null : timestampKey(input.p_before_updated_at);
        const beforeId = input.p_before_id?.toLowerCase() ?? null;
        const rows = db.prepare(`SELECT s.id,s.payload,s.updated_at,m.payload AS game,m.revision AS game_revision FROM solo_setups s
          LEFT JOIN matches m ON m.id=s.id
          WHERE (m.id IS NULL OR json_extract(m.payload,'$.outcome') IS NULL)
            AND (? IS NULL OR match_timestamp_key(s.updated_at)<? OR (match_timestamp_key(s.updated_at)=? AND lower(s.id)<?))
          ORDER BY match_timestamp_key(s.updated_at) DESC,lower(s.id) DESC LIMIT ?`).all(before, before, before, beforeId, input.p_limit);
        const data = rows.map(row => {
          const saved: StoredSetup = JSON.parse(String(row.payload));
          const stage = row.game === null ? 'setup' : 'game';
          metadata.set(String(row.id), { saved, stage });
          return { id: row.id, seat: 0, engine_version: saved.summary.engineVersion, rules_version: saved.summary.rulesVersion,
            revision: row.game_revision ?? saved.state.revision, updated_at: row.updated_at };
        });
        return { data, error: null };
      },
    }, cursor);
    return { ...page, matches: page.matches.map(match => {
      const { saved, stage } = metadata.get(match.id)!;
      let compatibility: { ok: boolean; message?: string } = { ok: true };
      try { setup(match.id); }
      catch (error) {
        compatibility = { ok: false, message: error instanceof IncompatibleMatch ? error.message : 'This saved match could not be opened. Its data is kept unchanged.' };
      }
      return { ...match, title: saved.summary.playerDeck.name + ' vs ' + saved.summary.opponent.name, stage, compatibility };
    }) };
  }
  return {
    async execute(input: unknown): Promise<AppResult<unknown>> {
      if (closed) return { ok: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'The local match service is closing.' } };
      const parsed = localMatchCommandSchema.safeParse(input);
      if (!parsed.success) return { ok: false, error: { code: 'INVALID_REQUEST', message: 'The requested match operation is invalid.' } };
      const command = parsed.data;
      try {
        if (command.type === 'match.list') return { ok: true, data: await directory(command.cursor ?? null) };
        if (command.type === 'match.read') return { ok: true, data: await read(command.id) };
        if (command.type === 'match.programQuote') return { ok: true, data: await readProgramPlayQuote(store, resolve, command.id, player, command.input) };
        if (command.type === 'match.activationQuote') return { ok: true, data: await readActivationQuote(store, resolve, command.id, player, command.input) };
        const data = await serialized(command.id, async () => {
          if (command.type === 'match.setup') return submitSetup(command.id, command.commandId, player, command.expectedRevision, command.action);
          if (command.type === 'match.bot') return tick(command.id);
          setup(command.id);
          const accepted = await submitMatchCommand(store, resolve, command.id, player, command.commandId, command.command);
          return { status: 'accepted' as const, acceptedRevision: accepted.acceptedRevision };
        });
        return { ok: true, data };
      } catch (error) {
        if (error instanceof MatchCommandRejected) return { ok: false, error: { code: 'MATCH_REJECTED', message: error.message } };
        if (error instanceof IncompatibleMatch) return { ok: false, error: { code: 'MATCH_INCOMPATIBLE', message: error.message } };
        throw error;
      }
    },
    async close() { closed = true; await Promise.allSettled([...queues.values()]); },
  };
}
