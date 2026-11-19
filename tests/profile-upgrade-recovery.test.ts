import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fork} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {archiveFixture} from './fixtures/profile-archive';
import {writeProfileRelease,resolveProfileLocation} from '../src/profile-location';
import {startApplication} from '../src/startup';
import {stageProfileArchive} from '../src/profile-archive';
import {openApplication} from '../src/application';

for(const boundary of ['staging','migration-failure','after-migration','before-publish','after-publish','publish-failure','reopen-failure'])test(`interrupted upgrade at ${boundary} preserves its predecessor and recoverable game`,async()=>{
  const root=await mkdtemp(join(tmpdir(),'neuroscape-upgrade-crash-'));
  try{
    const fixture=await archiveFixture(root),profileDirectory=join(root,'source'),path=join(profileDirectory,'profile.sqlite'),old=new DatabaseSync(path);old.exec('ALTER TABLE solo_setups DROP COLUMN updated_at; PRAGMA user_version=7;');old.close();writeProfileRelease(profileDirectory,'0.1.0',7);const before=await readFile(path);
    const worker=fork(join(__dirname,'fixtures/upgrade-crash-worker.ts'),[profileDirectory,boundary],{execArgv:['--import','tsx'],stdio:['ignore','ignore','pipe','ipc']}),exited=new Promise<number|null>(done=>worker.once('exit',done));let stderr='';worker.stderr?.on('data',data=>{stderr+=data;});
    try{await new Promise<void>((done,reject)=>{const timer=setTimeout(()=>reject(new Error('Upgrade boundary was not reached: '+stderr)),20000);worker.once('message',message=>{clearTimeout(timer);try{assert.deepEqual(message,{boundary});done();}catch(error){reject(error);}});worker.once('error',error=>{clearTimeout(timer);reject(error);});worker.once('exit',code=>{clearTimeout(timer);reject(new Error('Upgrade worker exited before proof: '+code+' '+stderr));});});if(['migration-failure','publish-failure'].includes(boundary))assert.equal(await exited,0);}
    finally{if(worker.exitCode===null){worker.kill('SIGKILL');await exited;}}
    assert.deepEqual(await readFile(path),before);
    const copies=await readdir(join(profileDirectory,'recovery-backups'));assert.equal(copies.length,1);
    const recovery=await stageProfileArchive(join(profileDirectory,'recovery-backups',copies[0]),join(root,'recovery-inspection'),fixture.fixture.content),recovered=openApplication({profileDirectory:recovery.directory,soloContent:fixture.fixture.content});
    try{assert.deepEqual(await recovered.execute({type:'match.read',id:fixture.id}),fixture.before);}finally{await recovered.close();}
    if(boundary==='reopen-failure'){await assert.rejects(startApplication({profileDirectory,soloContent:fixture.fixture.content}),/previous complete profile/);assert.equal(resolveProfileLocation(profileDirectory).generation,null);assert.deepEqual(await readFile(path),before);}
    const app=await startApplication({profileDirectory,soloContent:fixture.fixture.content});try{assert.deepEqual(await app.execute({type:'match.read',id:fixture.id}),fixture.before);assert.deepEqual(await app.execute({type:'deck.list'}),{ok:true,data:[fixture.deck]});}finally{await app.close();}
    assert.deepEqual(await readFile(path),before);assert.deepEqual(await readdir(join(profileDirectory,'restore-staging')),[]);
  }finally{await rm(root,{recursive:true,force:true});}
});
