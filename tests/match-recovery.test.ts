import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fork} from 'node:child_process';
import {DatabaseSync,backup} from 'node:sqlite';
import {openApplication} from '../src/application';
import {soloFixture,syncSolo} from './fixtures/solo';
import type {AppResult,LocalMatchView} from '../src/contract';

async function terminateAt(profileDirectory:string,boundary:string,request:unknown){
  const child=fork(join(__dirname,'fixtures/match-crash-worker.ts'),[profileDirectory,boundary,JSON.stringify(request)],{execArgv:['--import','tsx'],stdio:['ignore','ignore','pipe','ipc']});
  let stderr='';child.stderr?.on('data',bytes=>{stderr+=bytes;});
  const exited=new Promise<void>(done=>child.once('exit',()=>done()));
  try{
    await new Promise<void>((done,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Match crash boundary was not reached: '+stderr)),10000);
      child.once('message',message=>{clearTimeout(timeout);try{assert.deepEqual(message,{boundary});done();}catch(error){reject(error);}});
      child.once('error',error=>{clearTimeout(timeout);reject(error);});
      child.once('exit',()=>{clearTimeout(timeout);reject(new Error('Worker exited before termination: '+stderr));});
    });
  }finally{child.kill('SIGKILL');await exited;}
}

for(const kind of ['setup','player','bot'] as const)for(const boundary of ['before-transaction','before-commit','after-commit'] as const){
  test(`${kind} recovery ${boundary} preserves committed state and applies next work once`,async()=>{
    const root=await mkdtemp(join(tmpdir(),'neuroscape-match-crash-')),profileDirectory=join(root,'crashed'),controlDirectory=join(root,'control');
    const fixture=soloFixture(),options={profileDirectory,soloContent:fixture.content,matchSeed:'0'.repeat(63)+'1',catalogSource:{
      async fetchPage(){return {cards:fixture.cards,total:fixture.cards.length,has_more:false,offset:0};},
      async fetchArtwork(){return new Response(fixture.png,{headers:{'content-type':'image/png'}});},
    }};
    let app=openApplication(options),control:ReturnType<typeof openApplication>|undefined;
    try{
      await syncSolo(app);
      const deck=await app.execute({type:'deck.importStarter',key:fixture.content.opponents[0].key});assert.ok(deck.ok);
      const saved=await app.execute({type:'solo.createSetup',requestId:randomUUID(),deckId:deck.data.id,expectedRevision:1,opponentKey:fixture.content.opponents[0].key});assert.ok(saved.ok);const id=saved.data.id;
      if(kind!=='setup'){
        const chose=await app.execute({type:'match.setup',id,commandId:randomUUID(),expectedRevision:0,action:{type:'choose-starter',startingPlayer:kind==='bot'?1:0}});assert.ok(chose.ok);
        if(kind==='bot')assert.ok((await app.execute({type:'match.bot',id})).ok);
        const opening=await app.execute({type:'match.read',id});assert.ok(opening.ok && opening.data.phase==='setup');
        assert.ok((await app.execute({type:'match.setup',id,commandId:randomUUID(),expectedRevision:opening.data.setup.revision,action:{type:'mulligan',bottomOrder:[]}})).ok);
        if(kind==='player')assert.ok((await app.execute({type:'match.bot',id})).ok);
      }
      const before:AppResult<LocalMatchView>=await app.execute({type:'match.read',id});assert.ok(before.ok);
      const request=kind==='setup'?{type:'match.setup' as const,id,commandId:randomUUID(),expectedRevision:0,action:{type:'choose-starter' as const,startingPlayer:0 as const}}
        :kind==='player' && before.data.phase==='game'?{type:'match.command' as const,id,commandId:randomUUID(),command:{expectedRevision:before.data.snapshot.view.revision,action:{type:'draw-install' as const,choice:'install' as const}}}
        :{type:'match.bot' as const,id};
      await app.close();
      await mkdir(controlDirectory);const db=new DatabaseSync(join(profileDirectory,'profile.sqlite'),{readOnly:true});try{await backup(db,join(controlDirectory,'profile.sqlite'));}finally{db.close();}
      await cp(join(profileDirectory,'artwork'),join(controlDirectory,'artwork'),{recursive:true});
      control=openApplication({...options,profileDirectory:controlDirectory});
      const expectedReceipt=await control.execute(request);assert.ok(expectedReceipt.ok);
      const expected=await control.execute({type:'match.read',id});assert.ok(expected.ok);
      if(request.type==='match.bot'){const stopped=await control.execute({type:'match.bot',id});assert.ok(stopped.ok);assert.equal(stopped.data.applied,0);}
      await terminateAt(profileDirectory,boundary,request);
      app=openApplication(options);
      const recovered=await app.execute({type:'match.read',id});assert.ok(recovered.ok);
      if(boundary!=='after-commit')assert.deepEqual(recovered,before);
      else if(request.type!=='match.bot')assert.deepEqual(recovered,expected);
      else {assert.ok(recovered.data.phase==='game' && before.data.phase==='game');assert.equal(recovered.data.snapshot.view.revision,before.data.snapshot.view.revision+1);}
      const retry=await app.execute(request);assert.ok(retry.ok);
      if(request.type!=='match.bot')assert.deepEqual(retry,expectedReceipt);
      assert.deepEqual(await app.execute({type:'match.read',id}),expected);
      const repeated=await app.execute(request);assert.ok(repeated.ok);
      if(request.type==='match.bot'){const again=await app.execute({type:'match.bot',id});assert.ok(again.ok);assert.equal(again.data.applied,0);}
      else{
        assert.deepEqual(repeated,expectedReceipt);
        const stale=await app.execute({...request,commandId:randomUUID()});assert.equal(stale.ok,false);
        const conflict=request.type==='match.setup'?{...request,action:{type:'choose-starter',startingPlayer:1}}:{...request,command:{...request.command,action:{type:'concede'}}};
        const rejected=await app.execute(conflict);assert.equal(rejected.ok,false);
      }
      assert.deepEqual(await app.execute({type:'match.read',id}),expected);
      const check=new DatabaseSync(join(profileDirectory,'profile.sqlite'),{readOnly:true});try{assert.equal(check.prepare('PRAGMA quick_check').get()?.quick_check,'ok');}finally{check.close();}
    }finally{await control?.close();await app.close();await rm(root,{recursive:true,force:true});}
  });
}
