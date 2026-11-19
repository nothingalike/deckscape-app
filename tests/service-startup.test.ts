import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {archiveFixture} from './fixtures/profile-archive';
import {writeProfileRelease} from '../src/profile-location';
import {waitForProfileService} from '../src/service-startup';
import {startApplication} from '../src/startup';

test('desktop startup waits for acknowledged upgrade work through a real service-thread block longer than fifteen seconds',async()=>{
  const root=await mkdtemp(join(tmpdir(),'neuroscape-upgrade-long-'));
  try{
    const fixture=await archiveFixture(root),profileDirectory=join(root,'source'),path=join(profileDirectory,'profile.sqlite'),db=new DatabaseSync(path);db.exec('ALTER TABLE solo_setups DROP COLUMN updated_at; PRAGMA user_version=7;');db.close();writeProfileRelease(profileDirectory,'0.1.0',7);const before=await readFile(path);
    const worker=fork(join(__dirname,'fixtures/upgrade-crash-worker.ts'),[profileDirectory,'long-validation'],{execArgv:['--import','tsx'],stdio:['ignore','ignore','pipe','ipc']}),exited=new Promise<number|null>(done=>worker.once('exit',done));let stderr='';worker.stderr?.on('data',data=>{stderr+=data;});const began=performance.now();
    try{await waitForProfileService(worker);assert.equal(await exited,0,stderr);assert.ok(performance.now()-began>=16250);}
    finally{if(worker.exitCode===null){worker.kill('SIGKILL');await exited;}}
    assert.deepEqual(await readFile(path),before);const reopened=await startApplication({profileDirectory,soloContent:fixture.fixture.content});try{assert.deepEqual(await reopened.execute({type:'match.read',id:fixture.id}),fixture.before);}finally{await reopened.close();}
  }finally{await rm(root,{recursive:true,force:true});}
});
