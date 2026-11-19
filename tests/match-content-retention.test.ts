import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile, mkdir, writeFile, cp, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import {DatabaseSync, backup} from 'node:sqlite';
import {openApplication} from '../src/application';
import {soloFixture, syncSolo} from './fixtures/solo';
import type {AppResult, Deck} from '../src/contract';

import {finishPassiveMatch as finish} from './fixtures/passive-match';

test('catalog changes, deck edits and deletion preserve original match content and its health outcome',async()=>{
  const root=await mkdtemp(join(tmpdir(),'neuroscape-content-retention-')),profileDirectory=join(root,'changed'),controlDirectory=join(root,'control');
  const fixture=soloFixture();let incoming=structuredClone(fixture.cards),artwork=fixture.png;
  const source={async fetchPage(){return {cards:incoming,total:incoming.length,has_more:false,offset:0};},
    async fetchArtwork(){return new Response(artwork,{headers:{'content-type':'image/png'}});}};
  const options={profileDirectory,catalogSource:source,soloContent:fixture.content,matchSeed:'0'.repeat(63)+'1'};
  let app=openApplication(options);let control:ReturnType<typeof openApplication>|undefined;
  try {
    await syncSolo(app);
    const imported=await app.execute({type:'deck.importStarter',key:fixture.content.opponents[0].key});assert.ok(imported.ok);
    const selection={requestId:randomUUID(),deckId:imported.data.id,expectedRevision:1,opponentKey:fixture.content.opponents[0].key};
    const saved=await app.execute({type:'solo.createSetup',...selection});assert.ok(saved.ok);
    const before=await app.execute({type:'match.read',id:saved.data.id});assert.ok(before.ok);
    const repairable=await app.execute({type:'deck.import',input:{format:'json',text:JSON.stringify({format:'deckscape-backup',version:1,deck:imported.data})}});assert.ok(repairable.ok);
    await app.close();
    await mkdir(controlDirectory);const db=new DatabaseSync(join(profileDirectory,'profile.sqlite'),{readOnly:true});
    try {await backup(db,join(controlDirectory,'profile.sqlite'));}finally{db.close();}
    await cp(join(profileDirectory,'artwork'),join(controlDirectory,'artwork'),{recursive:true});
    app=openApplication(options);
    const removedId=imported.data.entries.find(entry=>entry.section==='cyberdeck')!.card_id;
    incoming=incoming.filter(card=>card.id!==removedId);
    const changed=incoming.find(card=>card.id!==removedId && card.card_type==='program')!;
    changed.rules_text+=' Changed current catalog rules.';
    artwork=Buffer.concat([fixture.png,Buffer.from('new artwork object')]);
    await syncSolo(app);
    const retained=await app.execute({type:'catalog.list',query:{search:fixture.cards.find(card=>card.id===removedId)!.name}});assert.ok(retained.ok);
    const card=retained.data.items.find(card=>card.id===removedId)!;assert.equal(card.source_missing,true);assert.equal(card.image_hash,fixture.hash);
    const preview=await app.execute({type:'solo.preview',deckId:repairable.data.id,opponentKey:selection.opponentKey});assert.ok(preview.ok);assert.equal(preview.data.player.ready,false);
    assert.equal((await app.execute({type:'solo.createSetup',...selection,requestId:randomUUID()})).ok,false);
    const edited=await app.execute({type:'deck.save',deck:{...imported.data,name:'Changed origin',entries:[]},expectedRevision:1});assert.ok(edited.ok);
    assert.ok((await app.execute({type:'deck.delete',id:edited.data.id,expectedRevision:edited.data.revision})).ok);
    assert.equal((await app.execute({type:'deck.read',id:edited.data.id})).ok,false);
    const unresolved=randomUUID();
    const draft=await app.execute({type:'deck.save',deck:{...repairable.data,entries:[...repairable.data.entries,{card_id:unresolved,section:'sideboard',quantity:1}]},expectedRevision:1});assert.ok(draft.ok);
    await app.close();
    // Only abandoned UUID staging directories are disposable; saved/retained artwork remains independent.
    const stage=join(profileDirectory,'staging',randomUUID());await mkdir(stage,{recursive:true});await writeFile(join(stage,'abandoned.part'),'partial');
    const nextContent=structuredClone(fixture.content);nextContent.opponents=[];
    app=openApplication({...options,soloContent:nextContent});
    assert.deepEqual(await app.execute({type:'match.read',id:saved.data.id}),before);
    assert.deepEqual(await app.execute({type:'solo.readSetup',id:saved.data.id}),saved);
    await assert.rejects(access(stage));
    assert.equal(createHash('sha256').update(await readFile(join(profileDirectory,'artwork',fixture.hash+'.png'))).digest('hex'),fixture.hash);
    const loaded=await app.execute({type:'deck.read',id:draft.data.id});assert.ok(loaded.ok);assert.ok(loaded.data.entries.some(entry=>entry.card_id===unresolved));
    const repaired:AppResult<Deck>=await app.execute({type:'deck.save',deck:{...loaded.data,entries:repairable.data.entries},expectedRevision:loaded.data.revision});assert.ok(repaired.ok);
    assert.ok(repaired.data.entries.some(entry=>entry.card_id===removedId));
    control=openApplication({...options,profileDirectory:controlDirectory});
    const expected=await finish(control,saved.data.id),actual=await finish(app,saved.data.id);
    assert.equal(actual.phase,'game');if(actual.phase==='game'){assert.ok(actual.snapshot.view.outcome?.type==='win');assert.equal(actual.snapshot.view.outcome.reason,'health');}
    assert.deepEqual(actual,expected);
  }finally{await control?.close();await app.close();await rm(root,{recursive:true,force:true});}
});
