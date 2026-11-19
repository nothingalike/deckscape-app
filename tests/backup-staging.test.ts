import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,access,rm,readdir,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openApplication} from '../src/application';
import {fork} from 'node:child_process';

test('startup reclaims owned interrupted backup files while preserving completed and unrelated files',async()=>{
  const root=await mkdtemp(join(tmpdir(),'neuroscape-backup-staging-')),profileDirectory=join(root,'profile'),runId=randomUUID(),run=join(profileDirectory,'backup-staging',runId),destination=join(root,'complete.zip'),temporary=join(root,`.complete.zip.${runId}.tmp`);
  try{
    await mkdir(run,{recursive:true});await writeFile(destination,'existing complete backup');await writeFile(temporary,'partial archive');await writeFile(join(run,'profile.sqlite'),'partial snapshot');
    await writeFile(join(run,'job.json'),JSON.stringify({destination,temporary}));
    const unrelated=join(profileDirectory,'backup-staging','user-files');await mkdir(unrelated);await writeFile(join(unrelated,'keep.txt'),'keep');
    const invalidRun=join(profileDirectory,'backup-staging',randomUUID());await mkdir(invalidRun);await writeFile(join(invalidRun,'job.json'),JSON.stringify({destination,temporary:destination}));
    const app=openApplication({profileDirectory});try{await assert.rejects(access(run));await assert.rejects(access(temporary));await assert.rejects(access(invalidRun));assert.equal(await readFile(destination,'utf8'),'existing complete backup');assert.equal(await readFile(join(unrelated,'keep.txt'),'utf8'),'keep');const status=await app.execute({type:'backup.status'});assert.ok(status.ok);assert.match(status.data.message??'',/Recovered temporary/);}finally{await app.close();}
  }finally{await rm(root,{recursive:true,force:true});}
});

test('a terminated backup before publish is reclaimed on reopen without replacing the old destination',async()=>{
  const root=await mkdtemp(join(tmpdir(),'neuroscape-backup-crash-')),profileDirectory=join(root,'profile'),destination=join(root,'original.zip');
  const original=openApplication({profileDirectory});await original.close();await writeFile(destination,'previous complete archive');
  try{
    const worker=fork(join(__dirname,'fixtures/backup-crash-worker.ts'),[profileDirectory,destination],{execArgv:['--import','tsx'],stdio:['ignore','ignore','pipe','ipc']});
    const exited=new Promise<void>(done=>worker.once('exit',()=>done()));let stderr='';worker.stderr?.on('data',value=>{stderr+=value;});
    try{await new Promise<void>((done,reject)=>{const timeout=setTimeout(()=>reject(new Error('Backup crash boundary not reached: '+stderr)),10000);worker.once('message',message=>{clearTimeout(timeout);try{assert.deepEqual(message,{boundary:'before-publish'});done();}catch(error){reject(error);}});worker.once('error',error=>{clearTimeout(timeout);reject(error);});worker.once('exit',()=>{clearTimeout(timeout);reject(new Error('Backup worker exited early: '+stderr));});});}
    finally{worker.kill('SIGKILL');await exited;}
    const reopened=openApplication({profileDirectory});try{assert.equal(await readFile(destination,'utf8'),'previous complete archive');assert.deepEqual(await readdir(root),['original.zip','profile']);const status=await reopened.execute({type:'backup.status'});assert.ok(status.ok);assert.match(status.data.message??'',/Recovered temporary/);}finally{await reopened.close();}
  }finally{await rm(root,{recursive:true,force:true});}
});

test('application shutdown drains a backup whose final write takes longer than the old two-second deadline',async()=>{
  const root=await mkdtemp(join(tmpdir(),'neuroscape-backup-close-')),profileDirectory=join(root,'profile'),destination=join(root,'drained.zip');
  try{
    const worker=fork(join(__dirname,'fixtures/backup-close-worker.ts'),[profileDirectory,destination],{execArgv:['--import','tsx'],stdio:['ignore','ignore','pipe','ipc']});
    const exited=new Promise<number|null>(done=>worker.once('exit',code=>done(code)));let stderr='';worker.stderr?.on('data',value=>{stderr+=value;});
    try{await new Promise<void>((done,reject)=>{const timeout=setTimeout(()=>reject(new Error('Backup shutdown did not drain: '+stderr)),10000);worker.once('message',message=>{clearTimeout(timeout);try{assert.ok(message&&typeof message==='object'&&'drained'in message&&message.drained===true&&'elapsedMs'in message&&Number(message.elapsedMs)>=2500);done();}catch(error){reject(error);}});worker.once('error',error=>{clearTimeout(timeout);reject(error);});worker.once('exit',code=>{clearTimeout(timeout);reject(new Error('Backup shutdown worker exited before proof delivery: '+code+' '+stderr));});});assert.equal(await exited,0);await access(destination);}
    finally{if(worker.exitCode===null){worker.kill('SIGKILL');await exited;}}
  }finally{await rm(root,{recursive:true,force:true});}
});

test('a temporarily unavailable backup destination retains its ownership journal until cleanup can retry',async()=>{
  const root=await mkdtemp(join(tmpdir(),'neuroscape-backup-drive-')),profileDirectory=join(root,'profile'),drive=join(root,'drive'),offline=join(root,'offline'),id=randomUUID(),run=join(profileDirectory,'backup-staging',id),destination=join(drive,'complete.zip'),temporary=join(drive,`.complete.zip.${id}.tmp`);
  try{
    await mkdir(run,{recursive:true});await mkdir(drive);await writeFile(destination,'complete');await writeFile(temporary,'partial');await writeFile(join(run,'job.json'),JSON.stringify({destination,temporary}));await rename(drive,offline);
    const unavailable=openApplication({profileDirectory});try{await access(join(run,'job.json'));const status=await unavailable.execute({type:'backup.status'});assert.ok(status.ok);assert.equal(status.data.phase,'failed');}finally{await unavailable.close();}
    await rename(offline,drive);const available=openApplication({profileDirectory});try{await assert.rejects(access(run));await assert.rejects(access(temporary));assert.equal(await readFile(destination,'utf8'),'complete');}finally{await available.close();}
  }finally{await rm(root,{recursive:true,force:true});}
});

for(const mode of ['sharing','disconnected'])test(`failed ${mode} external temporary cleanup keeps the journal and retries on reopening`,async()=>{
  const root=await mkdtemp(join(tmpdir(),'neuroscape-backup-sharing-')),profileDirectory=join(root,'profile'),drive=join(root,'drive'),destination=join(drive,'complete.zip');
  try{
    await mkdir(drive);await writeFile(destination,'complete');
    const worker=fork(join(__dirname,'fixtures/backup-cleanup-worker.ts'),[profileDirectory,destination,mode],{execArgv:['--import','tsx'],stdio:['ignore','ignore','pipe','ipc']});
    const exited=new Promise<number|null>(done=>worker.once('exit',code=>done(code)));let stderr='';worker.stderr?.on('data',value=>{stderr+=value;});
    try{await new Promise<void>((done,reject)=>{const timeout=setTimeout(()=>reject(new Error('Cleanup fault did not settle: '+stderr)),10000);worker.once('message',message=>{clearTimeout(timeout);try{assert.deepEqual(message,{failed:true});done();}catch(error){reject(error);}});worker.once('error',error=>{clearTimeout(timeout);reject(error);});worker.once('exit',code=>{clearTimeout(timeout);reject(new Error('Cleanup worker exited before proof: '+code+' '+stderr));});});assert.equal(await exited,0);}
    finally{if(worker.exitCode===null){worker.kill('SIGKILL');await exited;}}
    const runs=await readdir(join(profileDirectory,'backup-staging'));assert.equal(runs.length,1);const journal=JSON.parse(await readFile(join(profileDirectory,'backup-staging',runs[0],'job.json'),'utf8'));
    if(mode==='disconnected')await rename(drive+'-offline',drive);
    await access(journal.temporary);
    const reopened=openApplication({profileDirectory});try{await assert.rejects(access(journal.temporary));assert.deepEqual(await readdir(join(profileDirectory,'backup-staging')),[]);assert.equal(await readFile(destination,'utf8'),'complete');}finally{await reopened.close();}
  }finally{await rm(root,{recursive:true,force:true});}
});
