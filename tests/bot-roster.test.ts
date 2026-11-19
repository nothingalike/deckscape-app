import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import type {AppResult,SoloSetup} from '../src/contract';
import roster from '../src/data/bot-roster.json';
import {loadBotRoster,assembleBotRoster} from '../src/bot-roster';
import {bundledSoloContent} from '../src/solo-content';
import {normalizeCard} from '../src/deckscape/lib/catalog-import';
import baseline from '../src/deckscape/data/simulator/catalog-baseline.json';
import corrections from '../src/deckscape/data/corrections.json';
import {soloFixture,syncSolo} from './fixtures/solo';
import {openApplication} from '../src/application';

test('the shipped roster is reproducible from original source inputs and all pins resolve locally',async()=>{
  const content=bundledSoloContent();
  const cards=baseline.cards.map(card=>normalizeCard({id:card.id,name:card.name,card_type:card.type,subtype:card.subtype,rules_text:card.rulesText,factions:card.factions,ram_cost:card.ramCost,attack:card.attack,defence:card.defence,attack_type:card.attackType,iconic:card.iconic,card_copies_limit:card.copiesLimit,set_code:card.setCode},corrections.basic_ram.id));
  assert.deepEqual(assembleBotRoster(content.release,cards,roster.provenance),roster);
  for(const file of roster.provenance.files)assert.equal(createHash('sha256').update(await readFile('src/deckscape/'+file.path)).digest('hex'),file.sha256);
  const loaded=loadBotRoster(roster,content.release);assert.equal(loaded.length,4);assert.ok(loaded.every(opponent=>opponent.available));
  assert.ok(loaded.every(opponent=>opponent.strategyLabel==='Hosted general tactics'));
});

test('invalid strategy, artwork requirements and release pins disable entries without substituting another strategy',()=>{
  const content=bundledSoloContent(),invalid=structuredClone(roster);
  invalid.opponents[0].playbook.deck='another-deck';
  invalid.opponents[1].artwork[0].sha256='f'.repeat(64);
  const loaded=loadBotRoster(invalid,content.release);
  assert.equal(loaded[0].available,false);assert.match(loaded[0].unavailableReason??'',/strategy/);
  assert.equal(loaded[1].available,false);assert.match(loaded[1].unavailableReason??'',/artwork/);
  assert.equal(loaded[2].available,true);
  invalid.engineVersion='unavailable-engine';assert.ok(loadBotRoster(invalid,content.release).every(opponent=>!opponent.available));
  const malformed=loadBotRoster({version:99},content.release);assert.equal(malformed[0].available,false);assert.match(malformed[0].unavailableReason??'',/roster failed validation/);
});

test('invalid local bot content remains explainable and cannot admit a match while healthy opponents work',async()=>{
  const profileDirectory=await mkdtemp(join(tmpdir(),'neuroscape-roster-invalid-')),fixture=soloFixture();
  fixture.content.opponents[0].playbook=null;fixture.content.opponents[1].engineVersion='unavailable-engine';
  const app=openApplication({profileDirectory,soloContent:fixture.content,catalogSource:{async fetchPage(){return {cards:fixture.cards,total:fixture.cards.length,has_more:false,offset:0};},async fetchArtwork(){return new Response(fixture.png,{headers:{'content-type':'image/png'}});}}});
  try{
    await syncSolo(app);const listed=await app.execute({type:'solo.opponents'});assert.ok(listed.ok);assert.equal(listed.data[0].available,false);assert.match(listed.data[0].unavailableReason??'',/strategy/);
    assert.equal(listed.data[1].available,false);assert.match(listed.data[1].unavailableReason??'',/another engine/);assert.equal(listed.data[2].available,true);
    const deck=await app.execute({type:'deck.importStarter',key:fixture.content.opponents[2].key});assert.ok(deck.ok);
    for(const key of listed.data.slice(0,2).map(opponent=>opponent.key)){
      const result:AppResult<SoloSetup>=await app.execute({type:'solo.createSetup',requestId:randomUUID(),deckId:deck.data.id,expectedRevision:1,opponentKey:key});assert.equal(result.ok,false);
    }
    const healthy=await app.execute({type:'solo.createSetup',requestId:randomUUID(),deckId:deck.data.id,expectedRevision:1,opponentKey:listed.data[2].key});assert.ok(healthy.ok);
    assert.equal(JSON.stringify(listed).includes('priorities'),false);
  }finally{await app.close();await rm(profileDirectory,{recursive:true,force:true});}
});

test('the local opponent picker exposes all four starter choices through the public service',async()=>{
  const profileDirectory=await mkdtemp(join(tmpdir(),'neuroscape-roster-')),fixture=soloFixture();
  const app=openApplication({profileDirectory,soloContent:fixture.content,catalogSource:{async fetchPage(){return {cards:fixture.cards,total:fixture.cards.length,has_more:false,offset:0};},async fetchArtwork(){return new Response(fixture.png,{headers:{'content-type':'image/png'}});}}});
  try{await syncSolo(app);const listed=await app.execute({type:'solo.opponents'});assert.ok(listed.ok);assert.equal(listed.data.length,4);assert.ok(listed.data.every(opponent=>opponent.available));}
  finally{await app.close();await rm(profileDirectory,{recursive:true,force:true});}
});
