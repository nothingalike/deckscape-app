import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openApplication} from '../../src/application';
import type {AppResult,LocalMatchView} from '../../src/contract';
import {botCandidates} from '../../src/deckscape/lib/simulator/bot-policy';
import {readBotPlaybook} from '../../src/deckscape/lib/simulator/bot-playbook';

export async function finishPassiveMatch(app: ReturnType<typeof openApplication>, id: string) {
  for (let turn = 0; turn < 2000; turn++) {
    const read: AppResult<LocalMatchView> = await app.execute({type:'match.read',id}); assert.ok(read.ok);
    if (read.data.phase === 'setup') {
      if (read.data.setup.decision.type !== 'ready' && read.data.setup.decision.seat === 0) {
        const sent = await app.execute({type:'match.setup',id,commandId:randomUUID(),expectedRevision:read.data.setup.revision,
          action:read.data.setup.decision.type === 'choose-starter' ? {type:'choose-starter',startingPlayer:0} : {type:'mulligan',bottomOrder:[]}});
        assert.ok(sent.ok);
      }
    } else {
      if (read.data.snapshot.view.outcome) return read.data;
      const candidates = botCandidates(read.data.snapshot,readBotPlaybook(null,'retention-test-player'));
      const choice = candidates.find(candidate=>candidate.action.type==='pass') ?? candidates[0];
      if (choice) {const sent=await app.execute({type:'match.command',id,commandId:randomUUID(),
        command:{expectedRevision:read.data.snapshot.view.revision,action:choice.action}});assert.ok(sent.ok);}
    }
    const bot=await app.execute({type:'match.bot',id});assert.ok(bot.ok);
  }
  assert.fail('The original matchup did not finish.');
}

