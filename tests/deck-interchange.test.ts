import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openApplication } from '../src/application';
import { randomUUID } from 'node:crypto';
import starterManifest from '../src/deckscape/data/starter-decks.json';
import { basic } from './fixtures/catalog';
import { DatabaseSync } from 'node:sqlite';

test('a hosted JSON backup previews unresolved IDs and imports a new copy without replacing an existing deck', async () => {
  const profileDirectory=await mkdtemp(join(tmpdir(),'neuroscape-import-'));
  const app=openApplication({profileDirectory});
  try {
    const existing=await app.execute({type:'deck.create',name:'Keep my deck'});assert.ok(existing.ok);
    const text=JSON.stringify({format:'deckscape-backup',version:1,deck:{...existing.data,
      name:'Imported content',description:'Keep these entries for repair',published_at:'2026-01-01',
      entries:[{card_id:'e45525aa-735a-4c2d-a442-4b64786c3809',section:'cyberdeck',quantity:3}],
    }});
    const input={format:'json' as const,text};
    const preview=await app.execute({type:'deck.previewImport',input});assert.ok(preview.ok);
    assert.equal(preview.data.content.name,'Imported content');
    assert.deepEqual(preview.data.unresolvedCardIds,['e45525aa-735a-4c2d-a442-4b64786c3809']);
    assert.ok(preview.data.issues.some(issue=>issue.code==='unknown'));
    const imported=await app.execute({type:'deck.import',input});assert.ok(imported.ok);
    assert.notEqual(imported.data.id,existing.data.id);assert.equal(imported.data.revision,1);
    assert.equal('published_at' in imported.data,false);
    assert.deepEqual(imported.data.entries,[{card_id:'e45525aa-735a-4c2d-a442-4b64786c3809',section:'cyberdeck',quantity:3}]);
    const untouched=await app.execute({type:'deck.read',id:existing.data.id});assert.deepEqual(untouched,existing);
    const listed=await app.execute({type:'deck.list'});assert.ok(listed.ok);assert.equal(listed.data.length,2);
  } finally {await app.close();await rm(profileDirectory,{recursive:true,force:true});}
});

test('the supplied hosted starters resolve against local cards and create independent editable copies', async () => {
  const profileDirectory=await mkdtemp(join(tmpdir(),'neuroscape-starter-import-'));
  const names=new Map<string,string>();
  for(const deck of starterManifest.decks){names.set(deck.mainframe,'mainframe');for(const card of deck.cyberdeck)names.set(card.name,'character');}
  const cards=[{...basic,image_url:null},...[...names].map(([name,card_type])=>({id:randomUUID(),name,card_type,set_code:'GENESIS',card_copies_limit:4}))];
  const app=openApplication({profileDirectory,catalogSource:{
    async fetchPage(){return {cards,total:cards.length,has_more:false,offset:0};},
    async fetchArtwork(){return new Response(null,{status:404});},
  }});
  try {
    // This fixture focuses on the local records; artwork is already covered by sync and UI checks.
    await app.execute({type:'catalog.sync'});
    for(let n=0;n<1000;n++){const result=await app.execute({type:'catalog.status'});assert.ok(result.ok);if(!result.data.running){assert.equal(result.data.progress?.phase,'complete');break;}await new Promise(resolve=>setTimeout(resolve,5));if(n===999)assert.fail('Sync did not settle');}
    const starters=await app.execute({type:'deck.starters'});assert.ok(starters.ok);assert.equal(starters.data.length,4);
    const first=await app.execute({type:'deck.importStarter',key:starters.data[0].key});assert.ok(first.ok);
    const second=await app.execute({type:'deck.importStarter',key:starters.data[0].key});assert.ok(second.ok);
    assert.notEqual(first.data.id,second.data.id);assert.deepEqual(first.data.entries,second.data.entries);
    assert.equal(first.data.entries.reduce((sum,entry)=>sum+entry.quantity,0),76);
    const edited=await app.execute({type:'deck.save',deck:{...first.data,name:'My adapted starter'},expectedRevision:1});assert.ok(edited.ok);
    const untouched=await app.execute({type:'deck.read',id:second.data.id});assert.ok(untouched.ok);
    assert.equal(untouched.data.name,starterManifest.decks[0].name);assert.equal(untouched.data.revision,1);
  }finally{await app.close();await rm(profileDirectory,{recursive:true,force:true});}
});

test('a failed import write leaves the deck list intact and retry creates one complete copy', async () => {
  const profileDirectory=await mkdtemp(join(tmpdir(),'neuroscape-import-write-failure-'));
  const app=openApplication({profileDirectory});
  try{
    const existing=await app.execute({type:'deck.create',name:'Preserve this deck'});assert.ok(existing.ok);
    const before=await app.execute({type:'deck.list'});
    const input={format:'json' as const,text:JSON.stringify({format:'deckscape-backup',version:1,deck:{name:'Retry import',description:'',entries:[]}})};
    const fault=new DatabaseSync(join(profileDirectory,'profile.sqlite'));
    try{
      fault.exec("CREATE TRIGGER reject_import BEFORE INSERT ON decks BEGIN SELECT RAISE(FAIL, 'controlled storage fault'); END;");
      const failed=await app.execute({type:'deck.import',input});assert.equal(failed.ok,false);
      if(!failed.ok)assert.equal(failed.error.code,'STORAGE_ERROR');
      assert.deepEqual(await app.execute({type:'deck.list'}),before);
      fault.exec('DROP TRIGGER reject_import;');
      const retried=await app.execute({type:'deck.import',input});assert.ok(retried.ok);
      assert.equal(retried.data.name,'Retry import');assert.equal(retried.data.revision,1);
      const after=await app.execute({type:'deck.list'});assert.ok(after.ok);assert.equal(after.data.length,2);
      assert.deepEqual(await app.execute({type:'deck.read',id:existing.data.id}),existing);
    }finally{fault.close();}
  }finally{await app.close();await rm(profileDirectory,{recursive:true,force:true});}
});
