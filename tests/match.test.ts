import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openApplication } from '../src/application';
import { soloFixture, syncSolo } from './fixtures/solo';
import type { AppResult, LocalMatchView, BotAdvance } from '../src/contract';
import type { SetupCommand } from '../src/deckscape/lib/simulator/setup';
import type { CommandDelivery } from '../src/deckscape/lib/simulator/match-client-session';
import { botCandidates } from '../src/deckscape/lib/simulator/bot-policy';
import { readBotPlaybook } from '../src/deckscape/lib/simulator/bot-playbook';
import { DatabaseSync } from 'node:sqlite';
import type { GameCommand } from '../src/deckscape/lib/simulator/commands';

test('the admitted matchup completes original setup and returns only the participant battlefield', async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-match-'));
  const fixture = soloFixture();
  const app = openApplication({ profileDirectory, soloContent: fixture.content, catalogSource: {
    async fetchPage() { return { cards: fixture.cards, total: fixture.cards.length, has_more: false, offset: 0 }; },
    async fetchArtwork() { return new Response(fixture.png, { headers: { 'content-type': 'image/png' } }); },
  } });
  try {
    await syncSolo(app);
    const deck = await app.execute({ type: 'deck.importStarter', key: fixture.content.opponents[0].key }); assert.ok(deck.ok);
    const setup = await app.execute({ type: 'solo.createSetup', requestId: randomUUID(), deckId: deck.data.id,
      expectedRevision: 1, opponentKey: fixture.content.opponents[0].key }); assert.ok(setup.ok);
    let gameSeen = false;
    for (let count = 0; count < 8; count++) {
      const read: AppResult<LocalMatchView> = await app.execute({ type: 'match.read', id: setup.data.id }); assert.ok(read.ok);
      assert.equal(JSON.stringify(read).includes('"seed"'), false);
      if (read.data.phase === 'game') {
        assert.equal(read.data.snapshot.view.seat, 0);
        assert.equal(read.data.snapshot.view.players[1].hand, undefined);
        assert.ok(Object.keys(read.data.snapshot.presentations).length > 0);
        gameSeen = true; break;
      }
      assert.equal(read.data.setup.players[1].hand, undefined);
      if (read.data.setup.decision.type !== 'ready' && read.data.setup.decision.seat === 1) {
        const tick: AppResult<BotAdvance> = await app.execute({ type: 'match.bot', id: setup.data.id }); assert.ok(tick.ok);
      } else {
        const action: SetupCommand = read.data.setup.decision.type === 'choose-starter'
          ? { type: 'choose-starter' as const, startingPlayer: 0 as const } : { type: 'mulligan' as const, bottomOrder: [] };
        const command: { type: 'match.setup'; id: string; commandId: string; expectedRevision: number; action: SetupCommand } = { type: 'match.setup', id: setup.data.id, commandId: randomUUID(), expectedRevision: read.data.setup.revision, action };
        const sent: AppResult<CommandDelivery> = await app.execute(command); assert.ok(sent.ok);
        assert.deepEqual(await app.execute(command), sent);
      }
    }
    assert.equal(gameSeen, true);
  } finally { await app.close(); await rm(profileDirectory, { recursive: true, force: true }); }
});

test('real local commands, receipts and the hosted bot reach a health-based match outcome', async () => {
  const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-match-complete-'));
  const fixture = soloFixture();
  const app = openApplication({ profileDirectory, soloContent: fixture.content, catalogSource: {
    async fetchPage() { return { cards: fixture.cards, total: fixture.cards.length, has_more: false, offset: 0 }; },
    async fetchArtwork() { return new Response(fixture.png, { headers: { 'content-type': 'image/png' } }); },
  } });
  const fault = new DatabaseSync(join(profileDirectory, 'profile.sqlite'));
  const notices: { id: string; revision: number }[] = [];
  const unsubscribe = app.onMatchRevision(notice => notices.push(notice));
  try {
    await syncSolo(app);
    const deck = await app.execute({ type: 'deck.importStarter', key: fixture.content.opponents[0].key }); assert.ok(deck.ok);
    const setup = await app.execute({ type: 'solo.createSetup', requestId: randomUUID(), deckId: deck.data.id,
      expectedRevision: 1, opponentKey: fixture.content.opponents[0].key }); assert.ok(setup.ok);
    let completed = false, failureChecked = false, commands = 0;
    for (let count = 0; count < 2000; count++) {
      const result: AppResult<LocalMatchView> = await app.execute({ type: 'match.read', id: setup.data.id }); assert.ok(result.ok, JSON.stringify(result.ok ? {} : result.error));
      if (result.data.phase === 'setup') {
        if (result.data.setup.decision.type !== 'ready' && result.data.setup.decision.seat === 0) {
          const action: SetupCommand = result.data.setup.decision.type === 'choose-starter'
            ? { type: 'choose-starter', startingPlayer: 0 } : { type: 'mulligan', bottomOrder: [] };
          const sent: AppResult<CommandDelivery> = await app.execute({ type: 'match.setup', id: setup.data.id, commandId: randomUUID(), expectedRevision: result.data.setup.revision, action }); assert.ok(sent.ok);
        }
      } else {
        const snapshot = result.data.snapshot;
        if (snapshot.view.outcome) {
          completed = true;
          assert.equal(snapshot.view.outcome.type, 'win');
          assert.ok(snapshot.view.players.some(player => player.bioframeHealth <= 0 || player.mainframeHealth <= 0));
          assert.ok(commands > 5); break;
        }
        const candidates = botCandidates(snapshot, readBotPlaybook(null, 'passive-test-player'));
        // Use the existing policy for forced decisions; decline optional card plays.
        const choice = candidates.find(candidate => candidate.action.type === 'pass') ?? candidates[0];
        if (choice) {
          const request: { type: 'match.command'; id: string; commandId: string; command: GameCommand } = { type: 'match.command', id: setup.data.id, commandId: randomUUID(),
            command: { expectedRevision: snapshot.view.revision, action: choice.action } };
          if (!failureChecked) {
            const noticesBefore = notices.length;
            fault.exec("CREATE TRIGGER reject_receipt BEFORE INSERT ON match_receipts BEGIN SELECT RAISE(FAIL, 'controlled receipt fault'); END;");
            const failed: AppResult<CommandDelivery> = await app.execute(request); assert.equal(failed.ok, false);
            if (!failed.ok) assert.equal(failed.error.code, 'STORAGE_ERROR');
            assert.deepEqual(await app.execute({ type: 'match.read', id: setup.data.id }), result);
            assert.equal(notices.length, noticesBefore);
            fault.exec('DROP TRIGGER reject_receipt;');
            const [first, retry] = await Promise.all([app.execute(request), app.execute(request)]);
            assert.ok(first.ok); assert.deepEqual(retry, first);
            assert.equal(notices.length, noticesBefore + 1);
            const stale = await app.execute({ ...request, commandId: randomUUID() }); assert.equal(stale.ok, false);
            if (!stale.ok) assert.equal(stale.error.code, 'MATCH_REJECTED');
            const reused = await app.execute({ ...request, command: { ...request.command, action: { type: 'concede' } } }); assert.equal(reused.ok, false);
            failureChecked = true;
          } else {
            const sent = await app.execute(request); assert.ok(sent.ok, JSON.stringify(sent.ok ? {} : sent.error));
          }
          commands++;
        }
      }
      const tick: AppResult<BotAdvance> = await app.execute({ type: 'match.bot', id: setup.data.id }); assert.ok(tick.ok, JSON.stringify(tick.ok ? {} : tick.error));
      assert.ok(tick.data.applied <= 27);
    }
    assert.equal(completed, true); assert.equal(failureChecked, true);
    const unfinished = await app.execute({ type: 'match.list' }); assert.ok(unfinished.ok);
    assert.deepEqual(unfinished.data.matches, []);
  } finally { unsubscribe(); fault.close(); await app.close(); await rm(profileDirectory, { recursive: true, force: true }); }
});
