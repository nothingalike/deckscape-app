import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {archiveFixture} from './fixtures/profile-archive';
import {startApplication} from '../src/startup';
import {resolveProfileLocation,writeProfileRelease} from '../src/profile-location';
import {stageProfileArchive} from '../src/profile-archive';
import {openApplication} from '../src/application';

for(const legacyProfile of [false,true])test(`a versioned schema-seven predecessor upgrades after a recovery snapshot and preserves its exact pending game (legacy profile: ${legacyProfile})`,async()=>{
  const root=await mkdtemp(join(tmpdir(),'neuroscape-upgrade-'));
  try{
    const fixture=await archiveFixture(root),profileDirectory=join(root,'source'),path=join(profileDirectory,'profile.sqlite');
    const predecessor=new DatabaseSync(path);predecessor.exec('ALTER TABLE solo_setups DROP COLUMN updated_at; PRAGMA user_version=7;');
    if(legacyProfile)predecessor.exec('ALTER TABLE profile RENAME TO old_profile; CREATE TABLE profile(id INTEGER PRIMARY KEY,draft_name TEXT NOT NULL,revision INTEGER NOT NULL); INSERT INTO profile SELECT * FROM old_profile; DROP TABLE old_profile;');
    predecessor.close();writeProfileRelease(profileDirectory,'0.1.0',7);const before=await readFile(path);
    const app=await startApplication({profileDirectory,soloContent:fixture.fixture.content});
    try{assert.deepEqual(await app.execute({type:'match.read',id:fixture.id}),fixture.before);assert.deepEqual(await app.execute({type:'deck.list'}),{ok:true,data:[fixture.deck]});}finally{await app.close();}
    assert.deepEqual(await readFile(path),before);assert.notEqual(resolveProfileLocation(profileDirectory).directory,profileDirectory);
    const copies=await readdir(join(profileDirectory,'recovery-backups'));assert.equal(copies.length,1);
    const restored=await stageProfileArchive(join(profileDirectory,'recovery-backups',copies[0]),join(root,'recovery'),fixture.fixture.content);
    const recovered=openApplication({profileDirectory:restored.directory,soloContent:fixture.fixture.content});try{assert.deepEqual(await recovered.execute({type:'match.read',id:fixture.id}),fixture.before);}finally{await recovered.close();}
    const reopened=await startApplication({profileDirectory,soloContent:fixture.fixture.content});await reopened.close();assert.deepEqual(await readdir(join(profileDirectory,'recovery-backups')),copies);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('unsupported schemas stay byte-identical and explain the compatible-app recovery path',async()=>{
  const root=await mkdtemp(join(tmpdir(),'neuroscape-upgrade-unsupported-'));
  try{const fixture=await archiveFixture(root),profileDirectory=join(root,'source'),path=join(profileDirectory,'profile.sqlite'),db=new DatabaseSync(path);db.exec('PRAGMA user_version=99;');db.close();const before=await readFile(path);
    await assert.rejects(startApplication({profileDirectory,soloContent:fixture.fixture.content}),/compatible app release/);assert.deepEqual(await readFile(path),before);
  }finally{await rm(root,{recursive:true,force:true});}
});

for(const missing of ['runtime','definitions'] as const)test(`an upgrade preserves an unavailable ${missing} save and explains its compatibility`,async()=>{
  const root=await mkdtemp(join(tmpdir(),'neuroscape-upgrade-unavailable-'));
  try{
    const fixture=await archiveFixture(root),profileDirectory=join(root,'source'),path=join(profileDirectory,'profile.sqlite'),db=new DatabaseSync(path);
    if(missing==='runtime'){db.exec("UPDATE solo_setups SET payload=json_set(payload,'$.summary.engineVersion','retained-older-engine'); UPDATE matches SET engine_version='retained-older-engine';");}
    else db.exec("UPDATE solo_setups SET payload=json_set(payload,'$.definitions[0].version','"+'f'.repeat(64)+"');");
    const before=db.prepare('SELECT payload FROM solo_setups').get()!.payload,game=db.prepare('SELECT payload FROM matches').get()!.payload;db.close();writeProfileRelease(profileDirectory,'0.1.0');
    const app=await startApplication({profileDirectory,soloContent:fixture.fixture.content});
    try{assert.ok((await app.execute({type:'deck.read',id:fixture.deck.id})).ok);const list=await app.execute({type:'match.list'});assert.ok(list.ok);assert.equal(list.data.matches[0].compatibility?.ok,false);assert.equal((await app.execute({type:'match.read',id:fixture.id})).ok,false);assert.equal((await app.execute({type:'match.bot',id:fixture.id})).ok,false);}finally{await app.close();}
    const retained=new DatabaseSync(join(resolveProfileLocation(profileDirectory).directory,'profile.sqlite'),{readOnly:true});try{assert.equal(retained.prepare('SELECT payload FROM solo_setups').get()!.payload,before);assert.equal(retained.prepare('SELECT payload FROM matches').get()!.payload,game);}finally{retained.close();}
  }finally{await rm(root,{recursive:true,force:true});}
});
