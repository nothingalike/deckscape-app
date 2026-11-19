import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {openPromise} from 'yauzl';
import {openApplication} from '../src/application';
import {soloFixture,syncSolo} from './fixtures/solo';
import {basic,png} from './fixtures/catalog';

async function wait(app:ReturnType<typeof openApplication>){for(let attempt=0;attempt<2000;attempt++){const result=await app.execute({type:'backup.status'});assert.ok(result.ok);if(!result.data.running)return result.data;await new Promise(done=>setTimeout(done,5));}assert.fail('Backup did not settle.');}
async function entries(path:string){const archive=await openPromise(path,{lazyEntries:true,strictFileNames:true});const files=new Map<string,Buffer>();try{for await(const entry of archive.eachEntry()){const stream=await archive.openReadStreamPromise(entry);const chunks:Buffer[]=[];for await(const chunk of stream)chunks.push(chunk);files.set(entry.fileName,Buffer.concat(chunks));}}finally{archive.close();}return files;}

test('a complete profile backup captures a consistent real match and every referenced artwork object',async()=>{
  const root=await mkdtemp(join(tmpdir(),'neuroscape-backup-')),profileDirectory=join(root,'profile'),fixture=soloFixture();
  const app=openApplication({profileDirectory,soloContent:fixture.content,matchSeed:'0'.repeat(63)+'1',catalogSource:{async fetchPage(){return {cards:fixture.cards,total:fixture.cards.length,has_more:false,offset:0};},async fetchArtwork(){return new Response(fixture.png,{headers:{'content-type':'image/png'}});}}});
  try{
    await syncSolo(app);const deck=await app.execute({type:'deck.importStarter',key:fixture.content.opponents[0].key});assert.ok(deck.ok);
    const setup=await app.execute({type:'solo.createSetup',requestId:randomUUID(),deckId:deck.data.id,expectedRevision:1,opponentKey:fixture.content.opponents[0].key});assert.ok(setup.ok);const id=setup.data.id;
    assert.ok((await app.execute({type:'match.setup',id,commandId:randomUUID(),expectedRevision:0,action:{type:'choose-starter',startingPlayer:0}})).ok);
    const opening=await app.execute({type:'match.read',id});assert.ok(opening.ok&&opening.data.phase==='setup');
    assert.ok((await app.execute({type:'match.setup',id,commandId:randomUUID(),expectedRevision:opening.data.setup.revision,action:{type:'mulligan',bottomOrder:[]}})).ok);assert.ok((await app.execute({type:'match.bot',id})).ok);
    const before=await app.execute({type:'match.read',id});assert.ok(before.ok&&before.data.phase==='game');
    const destination=join(root,'complete.neuroscape.zip'),commandId=randomUUID();
    const started=await app.execute({type:'backup.export',destination});assert.ok(started.ok);
    const sent=await app.execute({type:'match.command',id,commandId,command:{expectedRevision:before.data.snapshot.view.revision,action:{type:'draw-install',choice:'install'}}});assert.ok(sent.ok);
    assert.equal((await wait(app)).phase,'complete');
    const files=await entries(destination);assert.ok(files.has('manifest.json')&&files.has('profile.sqlite'));
    const manifest=JSON.parse(files.get('manifest.json')!.toString());assert.equal(manifest.format,'neuroscape-profile');assert.equal(manifest.version,1);assert.equal(manifest.schemaVersion,8);
    assert.ok(manifest.matches.some((match:{id:string})=>match.id===id));
    for(const file of manifest.files){const data=files.get(file.path);assert.ok(data,file.path);assert.equal(data.length,file.size);assert.equal(createHash('sha256').update(data).digest('hex'),file.sha256);}
    assert.equal(files.size,manifest.files.length+1);assert.deepEqual(files.get('artwork/'+fixture.hash+'.png'),fixture.png);
    assert.ok([...files.keys()].every(path=>path==='manifest.json'||path==='profile.sqlite'||/^artwork\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(path)));
    const restored=join(root,'inspected');await mkdir(restored);for(const[path,data]of files){if(path==='manifest.json')continue;await mkdir(join(restored,path,'..'),{recursive:true});await writeFile(join(restored,path),data);}
    const db=new DatabaseSync(join(restored,'profile.sqlite'),{readOnly:true});try{
      assert.equal(db.prepare('PRAGMA quick_check').get()?.quick_check,'ok');
      const game=db.prepare('SELECT revision FROM matches WHERE id=?').get(id)!;
      const receipt=db.prepare('SELECT accepted_revision FROM match_receipts WHERE match_id=? AND command_id=?').get(id,commandId);
      assert.equal(Boolean(receipt),Number(game.revision)>before.data.snapshot.view.revision);
    }finally{db.close();}
    const reader=openApplication({profileDirectory:restored,soloContent:fixture.content});try{const view=await reader.execute({type:'match.read',id});assert.ok(view.ok&&view.data.phase==='game');assert.ok(view.data.snapshot.view.revision>=before.data.snapshot.view.revision);}finally{await reader.close();}
  }finally{await app.close();await rm(root,{recursive:true,force:true});}
});

test('failed backup creation preserves an existing destination and the active profile',async()=>{
  const root=await mkdtemp(join(tmpdir(),'neuroscape-backup-fail-')),profileDirectory=join(root,'profile'),destination=join(root,'existing.zip');
  const app=openApplication({profileDirectory});
  try{
    const deck=await app.execute({type:'deck.create',name:'Keep this draft'});assert.ok(deck.ok);await mkdir(destination);
    assert.ok((await app.execute({type:'backup.export',destination})).ok);const failed=await wait(app);assert.equal(failed.phase,'failed');assert.match(failed.message??'',/space|folder|saved/i);
    assert.deepEqual(await app.execute({type:'deck.read',id:deck.data.id}),deck);assert.deepEqual(await readdir(root),['existing.zip','profile']);
    assert.equal((await app.execute({type:'backup.export',destination:join(profileDirectory,'profile.sqlite')})).ok,false);
    assert.ok((await app.execute({type:'backup.export',destination:join(root,'retry.zip')})).ok);assert.equal((await wait(app)).phase,'complete');assert.ok((await readFile(join(root,'retry.zip'))).length>0);
  }finally{await app.close();await rm(root,{recursive:true,force:true});}
});

test('damaged referenced artwork cannot replace a previous backup and the original bytes permit retry',async()=>{
  const root=await mkdtemp(join(tmpdir(),'neuroscape-backup-art-')),profileDirectory=join(root,'profile'),destination=join(root,'previous.zip');
  const app=openApplication({profileDirectory,catalogSource:{async fetchPage(){return {cards:[basic],total:1,has_more:false,offset:0};},async fetchArtwork(){return new Response(png,{headers:{'content-type':'image/png'}});}}});
  try{
    await syncSolo(app);const cards=await app.execute({type:'catalog.list'});assert.ok(cards.ok);const image=cards.data.items[0].image_path!;
    await writeFile(destination,'previous complete backup');await writeFile(join(profileDirectory,'artwork',image),'damaged');
    assert.ok((await app.execute({type:'backup.export',destination})).ok);assert.equal((await wait(app)).phase,'failed');
    assert.equal(await readFile(destination,'utf8'),'previous complete backup');assert.deepEqual(await readdir(root),['previous.zip','profile']);
    await writeFile(join(profileDirectory,'artwork',image),png);assert.ok((await app.execute({type:'backup.export',destination})).ok);assert.equal((await wait(app)).phase,'complete');
    assert.ok((await entries(destination)).has('artwork/'+image));
  }finally{await app.close();await rm(root,{recursive:true,force:true});}
});
