import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {stageProfileArchive} from '../src/profile-archive';
import {openApplication} from '../src/application';
import {archiveFixture,writeArchive,changeManifest,changeDatabase} from './fixtures/profile-archive';
import {backupLimits} from '../src/profile-backup';
import {DatabaseSync} from 'node:sqlite';

test('a validated archive reopens its exact pending game with original content and receipts',async()=>{
  const root=await mkdtemp(join(tmpdir(),'neuroscape-archive-valid-'));
  try{const fixture=await archiveFixture(root),target=join(root,'target'),staged=await stageProfileArchive(fixture.source,target,fixture.fixture.content);assert.equal(staged.manifest.matches[0].id,fixture.id);
    const app=openApplication({profileDirectory:staged.directory,soloContent:fixture.fixture.content});try{assert.deepEqual(await app.execute({type:'match.read',id:fixture.id}),fixture.before);}finally{await app.close();}
  }finally{await rm(root,{recursive:true,force:true});}
});

for(const fault of ['checksum','missing-art','missing-reference','catalog-fields','saved-card-fields','unsupported-schema','unsupported-version','runtime','definition','hidden-setup-pin','unexpected-trigger','receipt','oversized-entry','symlink','traversal','duplicate','crc','encrypted','oversized-count'] as const)test(`archive validation rejects ${fault} before changing the current profile`,async()=>{
  const root=await mkdtemp(join(tmpdir(),'neuroscape-archive-invalid-'));
  try{
    const fixture=await archiveFixture(root),files=new Map(fixture.files),target=join(root,'target'),path=join(root,'invalid.zip');
    const old=openApplication({profileDirectory:target});const keep=await old.execute({type:'deck.create',name:'Keep current profile'});assert.ok(keep.ok);await old.close();const original=await readFile(join(target,'profile.sqlite'));
    const art=[...files.keys()].find(name=>name.startsWith('artwork/'))!;
    if(fault==='checksum')files.set(art,Buffer.from('corrupted artwork'));
    if(fault==='missing-art')files.delete(art);
    if(fault==='missing-reference')await changeDatabase(root,files,db=>db.prepare("UPDATE catalog_cards SET payload=json_set(payload,'$.image_path',?,'$.image_hash',?)").run('f'.repeat(64)+'.png','f'.repeat(64)));
    if(fault==='catalog-fields')await changeDatabase(root,files,db=>db.exec("UPDATE catalog_cards SET payload=json_set(payload,'$.rules_text',NULL);"));
    if(fault==='saved-card-fields')await changeDatabase(root,files,db=>db.exec("UPDATE solo_setups SET payload=json_set(payload,'$.cards[0].factions',NULL);"));
    if(fault==='unsupported-schema')changeManifest(files,manifest=>{manifest.schemaVersion=99;});
    if(fault==='unsupported-version')changeManifest(files,manifest=>{manifest.version=99;});
    if(fault==='runtime')await changeDatabase(root,files,db=>{db.prepare("UPDATE solo_setups SET payload=json_set(payload,'$.summary.engineVersion','unavailable-engine')").run();changeManifest(files,manifest=>{manifest.matches[0].engineVersion='unavailable-engine';});});
    if(fault==='definition')await changeDatabase(root,files,db=>db.exec("UPDATE solo_setups SET payload=json_set(payload,'$.definitions[0].definition.characteristics.name','altered definition');"));
    if(fault==='hidden-setup-pin')await changeDatabase(root,files,db=>{const row=db.prepare('SELECT id,payload FROM solo_setups').get()!,saved=JSON.parse(String(row.payload));saved.state.instances[saved.state.players[1].cyberdeck[0]].definitionVersion='f'.repeat(64);db.prepare('UPDATE solo_setups SET payload=? WHERE id=?').run(JSON.stringify(saved),row.id);});
    if(fault==='unexpected-trigger')await changeDatabase(root,files,db=>db.exec('CREATE TRIGGER unexpected AFTER UPDATE ON decks BEGIN SELECT 1; END;'));
    if(fault==='receipt')await changeDatabase(root,files,db=>db.exec("UPDATE setup_receipts SET command_json='{}';"));
    if(fault==='oversized-entry')files.set(art,Buffer.alloc(backupLimits.artworkBytes+1));
    if(fault==='traversal')files.set('safe-placeholder.bin',Buffer.from('outside'));
    await writeArchive(path,files,fault==='symlink'?{path:art,value:0o120777}:undefined,fault==='duplicate'?art:undefined);
    if(fault==='traversal'){let bytes=await readFile(path);const name=Buffer.from('safe-placeholder.bin'),unsafe=Buffer.from('../'+'.'.repeat(name.length-3));for(let offset=bytes.indexOf(name);offset>=0;offset=bytes.indexOf(name,offset+name.length))unsafe.copy(bytes,offset);await writeFile(path,bytes);}
    if(fault==='crc'||fault==='encrypted'){const bytes=await readFile(path),signature=Buffer.from([0x50,0x4b,0x01,0x02]);for(let offset=bytes.indexOf(signature);offset>=0;offset=bytes.indexOf(signature,offset+4)){const length=bytes.readUInt16LE(offset+28),name=bytes.subarray(offset+46,offset+46+length).toString();if(name===art){if(fault==='crc')bytes.writeUInt32LE((bytes.readUInt32LE(offset+16)^1)>>>0,offset+16);else bytes.writeUInt16LE(bytes.readUInt16LE(offset+8)|1,offset+8);break;}}await writeFile(path,bytes);}
    if(fault==='oversized-count'){const bytes=await readFile(path),end=bytes.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));bytes.writeUInt16LE(backupLimits.files+2,end+8);bytes.writeUInt16LE(backupLimits.files+2,end+10);await writeFile(path,bytes);}
    await assert.rejects(stageProfileArchive(path,target,fixture.fixture.content));
    assert.deepEqual(await readFile(join(target,'profile.sqlite')),original);assert.deepEqual(await readdir(join(target,'restore-staging')),[]);
    const current=openApplication({profileDirectory:target});try{assert.deepEqual(await current.execute({type:'deck.read',id:keep.data.id}),keep);}finally{await current.close();}
  }finally{await rm(root,{recursive:true,force:true});}
});

test('a supported version-one predecessor migrated to the current schema remains backup-compatible',async()=>{
  const root=await mkdtemp(join(tmpdir(),'neuroscape-archive-predecessor-')),profileDirectory=join(root,'profile');
  try{
    await import('node:fs/promises').then(fs=>fs.mkdir(profileDirectory));const predecessor=new DatabaseSync(join(profileDirectory,'profile.sqlite'));predecessor.exec("CREATE TABLE profile(id INTEGER PRIMARY KEY,name TEXT NOT NULL,revision INTEGER NOT NULL); INSERT INTO profile VALUES(1,'Legacy profile',7); PRAGMA user_version=1;");predecessor.close();
    const app=openApplication({profileDirectory}),source=join(root,'migrated.zip');try{assert.ok((await app.execute({type:'backup.export',destination:source})).ok);for(let attempt=0;attempt<1000;attempt++){const status=await app.execute({type:'backup.status'});assert.ok(status.ok);if(!status.data.running){assert.equal(status.data.phase,'complete');break;}await new Promise(done=>setTimeout(done,5));}}finally{await app.close();}
    const staged=await stageProfileArchive(source,join(root,'target')),restored=openApplication({profileDirectory:staged.directory});try{const profile=await restored.execute({type:'profile.read'});assert.ok(profile.ok);assert.equal(profile.data.draftName,'Legacy profile');assert.equal(profile.data.revision,7);}finally{await restored.close();}
  }finally{await rm(root,{recursive:true,force:true});}
});
