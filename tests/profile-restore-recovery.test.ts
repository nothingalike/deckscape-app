import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readdir,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fork} from 'node:child_process';
import {openApplication} from '../src/application';
import {archiveFixture} from './fixtures/profile-archive';

for(const boundary of ['staging','before-publish','after-publish','publish-failure','reopen-failure'])test(`restore recovery at ${boundary} selects one complete profile`,async()=>{
  const root=await mkdtemp(join(tmpdir(),'neuroscape-restore-crash-'));await mkdir(join(root,'incoming'));await mkdir(join(root,'current'));
  try{
    const incoming=await archiveFixture(join(root,'incoming')),current=await archiveFixture(join(root,'current')),profileDirectory=join(root,'current','source');
    const worker=fork(join(__dirname,'fixtures/restore-crash-worker.ts'),[profileDirectory,incoming.source,boundary],{execArgv:['--import','tsx'],stdio:['ignore','ignore','pipe','ipc']});
    const exited=new Promise<number|null>(done=>worker.once('exit',code=>done(code)));let stderr='';worker.stderr?.on('data',value=>{stderr+=value;});
    try{await new Promise<void>((done,reject)=>{const timeout=setTimeout(()=>reject(new Error('Restore boundary was not reached: '+stderr)),20000);worker.once('message',message=>{clearTimeout(timeout);try{assert.deepEqual(message,{boundary});done();}catch(error){reject(error);}});worker.once('error',error=>{clearTimeout(timeout);reject(error);});worker.once('exit',code=>{clearTimeout(timeout);reject(new Error('Restore worker exited before proof: '+code+' '+stderr));});});if(boundary==='publish-failure')assert.equal(await exited,0);}
    finally{if(worker.exitCode===null){worker.kill('SIGKILL');await exited;}}
    const restored=boundary==='after-publish',expected=restored?incoming:current,other=restored?current:incoming;
    const reopened=openApplication({profileDirectory,soloContent:incoming.fixture.content});
    try{
      assert.deepEqual(await reopened.execute({type:'match.read',id:expected.id}),expected.before);assert.equal((await reopened.execute({type:'match.read',id:other.id})).ok,false);
      assert.deepEqual(await reopened.execute({type:'deck.list'}),{ok:true,data:[expected.deck]});
      const status=await reopened.execute({type:'restore.status'});assert.ok(status.ok);assert.equal(status.data.phase,restored?'complete':'failed');assert.equal(status.data.restartRequired,false);
      if(status.data.recoveryBackupPath)await access(status.data.recoveryBackupPath);
      assert.deepEqual(await readdir(join(profileDirectory,'restore-staging')),[]);
      assert.ok(!(await readdir(profileDirectory)).some(name=>/^\.(current-profile|restore-activation|restore-result).*\.tmp$/.test(name)));
    }finally{await reopened.close();}
  }finally{await rm(root,{recursive:true,force:true});}
});
