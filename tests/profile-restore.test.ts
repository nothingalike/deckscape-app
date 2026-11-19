import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openApplication} from '../src/application';
import {archiveFixture} from './fixtures/profile-archive';
import {stageProfileArchive} from '../src/profile-archive';
import {resolveProfileLocation} from '../src/profile-location';

async function waitRestore(app:ReturnType<typeof openApplication>){for(let attempt=0;attempt<2000;attempt++){const status=await app.execute({type:'restore.status'});assert.ok(status.ok);if(!status.data.running)return status.data;await new Promise(done=>setTimeout(done,5));}assert.fail('Restore did not settle.');}

test('restoring a valid backup retains a recovery copy and reopens the original imported game',async()=>{
  const root=await mkdtemp(join(tmpdir(),'neuroscape-restore-'));await mkdir(join(root,'incoming'));await mkdir(join(root,'current'));
  const incoming=await archiveFixture(join(root,'incoming')),current=await archiveFixture(join(root,'current')),profileDirectory=join(root,'current','source');
  let app=openApplication({profileDirectory,soloContent:current.fixture.content});
  try{
    const changed=await app.execute({type:'deck.save',deck:{...current.deck,name:'Latest previous draft'},expectedRevision:1});assert.ok(changed.ok);
    assert.ok((await app.execute({type:'backup.restore',source:incoming.source})).ok);
    const status=await waitRestore(app);assert.equal(status.phase,'complete');assert.equal(status.restartRequired,true);assert.ok(status.recoveryBackupPath);await access(status.recoveryBackupPath);
    await app.close();app=openApplication({profileDirectory,soloContent:incoming.fixture.content});
    const reopenedStatus=await app.execute({type:'restore.status'});assert.ok(reopenedStatus.ok);assert.equal(reopenedStatus.data.phase,'complete');assert.equal(reopenedStatus.data.restartRequired,false);
    assert.notEqual(resolveProfileLocation(profileDirectory).directory,profileDirectory);
    assert.deepEqual(await app.execute({type:'match.read',id:incoming.id}),incoming.before);
    assert.equal((await app.execute({type:'match.read',id:current.id})).ok,false);
    assert.deepEqual(await app.execute({type:'deck.list'}),{ok:true,data:[incoming.deck]});
    const staged=await stageProfileArchive(status.recoveryBackupPath,join(root,'recovery-inspection'),current.fixture.content);
    const previous=openApplication({profileDirectory:staged.directory,soloContent:current.fixture.content});
    try{assert.deepEqual(await previous.execute({type:'match.read',id:current.id}),current.before);assert.deepEqual(await previous.execute({type:'deck.read',id:changed.data.id}),changed);}finally{await previous.close();}
    // A player can use the same flow to return from an active generation to its recovery backup.
    const importedDirectory=resolveProfileLocation(profileDirectory).directory;
    const internalExport=await app.execute({type:'backup.export',destination:join(profileDirectory,'forbidden.zip')});assert.equal(internalExport.ok,false);
    assert.ok((await app.execute({type:'backup.restore',source:status.recoveryBackupPath})).ok);assert.equal((await waitRestore(app)).phase,'complete');
    await app.close();app=openApplication({profileDirectory,soloContent:current.fixture.content});
    assert.notEqual(resolveProfileLocation(profileDirectory).directory,importedDirectory);await access(join(importedDirectory,'profile.sqlite'));
    assert.deepEqual(await app.execute({type:'match.read',id:current.id}),current.before);assert.deepEqual(await app.execute({type:'deck.read',id:changed.data.id}),changed);
    assert.equal((await app.execute({type:'match.read',id:incoming.id})).ok,false);
  }finally{await app.close();await rm(root,{recursive:true,force:true});}
});

test('a rejected restore leaves the current service usable and permits a valid retry',async()=>{
  const root=await mkdtemp(join(tmpdir(),'neuroscape-restore-retry-'));await mkdir(join(root,'incoming'));const incoming=await archiveFixture(join(root,'incoming')),profileDirectory=join(root,'current'),bad=join(root,'damaged.zip');await writeFile(bad,'not an archive');
  let app=openApplication({profileDirectory,soloContent:incoming.fixture.content});
  try{
    const keep=await app.execute({type:'deck.create',name:'Keep current profile'});assert.ok(keep.ok);
    assert.ok((await app.execute({type:'backup.restore',source:bad})).ok);const failed=await waitRestore(app);assert.equal(failed.phase,'failed');assert.equal(failed.restartRequired,false);
    assert.deepEqual(await app.execute({type:'deck.read',id:keep.data.id}),keep);assert.ok((await app.execute({type:'deck.create',name:'Still editable'})).ok);
    assert.ok((await app.execute({type:'backup.restore',source:incoming.source})).ok);assert.equal((await waitRestore(app)).phase,'complete');
    await app.close();app=openApplication({profileDirectory,soloContent:incoming.fixture.content});assert.deepEqual(await app.execute({type:'match.read',id:incoming.id}),incoming.before);
  }finally{await app.close();await rm(root,{recursive:true,force:true});}
});
