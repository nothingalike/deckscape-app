import {ZipFile} from 'yazl';
import {openPromise} from 'yauzl';
import {createWriteStream} from 'node:fs';
import {readFile,writeFile} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {openApplication} from '../../src/application';
import {soloFixture,syncSolo} from './solo';

export async function archiveFiles(path:string){const zip=await openPromise(path,{lazyEntries:true,strictFileNames:true}),files=new Map<string,Buffer>();try{for await(const entry of zip.eachEntry()){const stream=await zip.openReadStreamPromise(entry),chunks:Buffer[]=[];for await(const chunk of stream)chunks.push(chunk);files.set(entry.fileName,Buffer.concat(chunks));}}finally{zip.close();}return files;}
export async function writeArchive(path:string,files:Map<string,Buffer>,mode?:{path:string;value:number},duplicate?:string){
  const zip=new ZipFile(),out=createWriteStream(path,{flags:'wx'});zip.on('error',error=>out.destroy(error));
  for(const[name,bytes]of files)zip.addBuffer(bytes,name,mode?.path===name?{mode:mode.value}:{});
  if(duplicate)zip.addBuffer(files.get(duplicate)!,duplicate);
  const written=pipeline(zip.outputStream,out);zip.end();await written;
}
export async function archiveFixture(root:string){
  const fixture=soloFixture(),profileDirectory=join(root,'source'),source=join(root,'original.zip');
  const app=openApplication({profileDirectory,soloContent:fixture.content,matchSeed:'0'.repeat(63)+'1',catalogSource:{async fetchPage(){return {cards:fixture.cards,total:fixture.cards.length,has_more:false,offset:0};},async fetchArtwork(){return new Response(fixture.png,{headers:{'content-type':'image/png'}});}}});
  try{
    await syncSolo(app);const deck=await app.execute({type:'deck.importStarter',key:fixture.content.opponents[0].key});assert.ok(deck.ok);
    const setup=await app.execute({type:'solo.createSetup',requestId:randomUUID(),deckId:deck.data.id,expectedRevision:1,opponentKey:fixture.content.opponents[0].key});assert.ok(setup.ok);const id=setup.data.id;
    assert.ok((await app.execute({type:'match.setup',id,commandId:randomUUID(),expectedRevision:0,action:{type:'choose-starter',startingPlayer:0}})).ok);
    const opening=await app.execute({type:'match.read',id});assert.ok(opening.ok&&opening.data.phase==='setup');
    assert.ok((await app.execute({type:'match.setup',id,commandId:randomUUID(),expectedRevision:opening.data.setup.revision,action:{type:'mulligan',bottomOrder:[]}})).ok);assert.ok((await app.execute({type:'match.bot',id})).ok);
    const before=await app.execute({type:'match.read',id});assert.ok(before.ok&&before.data.phase==='game');
    assert.ok((await app.execute({type:'backup.export',destination:source})).ok);
    for(let attempt=0;attempt<1000;attempt++){const status=await app.execute({type:'backup.status'});assert.ok(status.ok);if(!status.data.running){assert.equal(status.data.phase,'complete');return {source,id,before,fixture,deck:deck.data,files:await archiveFiles(source)};}await new Promise(done=>setTimeout(done,5));}
    assert.fail('Fixture backup did not settle.');
  }finally{await app.close();}
}
export function changeManifest(files:Map<string,Buffer>,change:(manifest:any)=>void){const manifest=JSON.parse(files.get('manifest.json')!.toString());change(manifest);files.set('manifest.json',Buffer.from(JSON.stringify(manifest)));}
export async function changeDatabase(root:string,files:Map<string,Buffer>,change:(db:DatabaseSync)=>void){
  const path=join(root,randomUUID()+'.sqlite');await writeFile(path,files.get('profile.sqlite')!);const db=new DatabaseSync(path);
  try{db.exec('PRAGMA journal_mode=DELETE;');change(db);}finally{db.close();}
  const data=await readFile(path);files.set('profile.sqlite',data);changeManifest(files,manifest=>{const file=manifest.files.find((file:{path:string})=>file.path==='profile.sqlite');file.size=data.length;file.sha256=createHash('sha256').update(data).digest('hex');});
}
