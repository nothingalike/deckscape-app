import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {openApplication} from '../src/application';
import {soloFixture,syncSolo} from './fixtures/solo';
import {finishPassiveMatch} from './fixtures/passive-match';
import roster from '../src/data/bot-roster.json';

for(const opponent of roster.opponents)test(`deterministic packaged ${opponent.name} executes to a real outcome`,async()=>{
  const profileDirectory=await mkdtemp(join(tmpdir(),'neuroscape-roster-game-')),fixture=soloFixture();
  const app=openApplication({profileDirectory,soloContent:fixture.content,matchSeed:'0'.repeat(63)+'1',catalogSource:{
    async fetchPage(){return {cards:fixture.cards,total:fixture.cards.length,has_more:false,offset:0};},
    async fetchArtwork(){return new Response(fixture.png,{headers:{'content-type':'image/png'}});},
  }});
  try{
    await syncSolo(app);
    const other=fixture.content.opponents.find(item=>item.key!==opponent.key)!;
    const deck=await app.execute({type:'deck.importStarter',key:other.key});assert.ok(deck.ok);
    const saved=await app.execute({type:'solo.createSetup',requestId:randomUUID(),deckId:deck.data.id,expectedRevision:1,opponentKey:opponent.key});assert.ok(saved.ok);
    assert.equal(saved.data.opponent.key,opponent.key);assert.equal(saved.data.playbookHash,opponent.playbookSha256);
    const final=await finishPassiveMatch(app,saved.data.id);assert.equal(final.phase,'game');
    if(final.phase==='game'){
      assert.ok(final.snapshot.view.outcome);assert.notEqual(final.snapshot.view.outcome.type,'abandoned');
      console.log(JSON.stringify({opponent:opponent.key,seed:'0'.repeat(63)+'1',revision:final.snapshot.view.revision,turn:final.snapshot.view.turn.number,outcome:final.snapshot.view.outcome}));
    }
  }finally{await app.close();await rm(profileDirectory,{recursive:true,force:true});}
});
