import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {openApplication} from '../src/application';

test('an active complete data generation supplies the profile while the legacy data remains intact',async()=>{
  const root=await mkdtemp(join(tmpdir(),'neuroscape-generation-')),id=randomUUID(),generation=join(root,'data-generations',id);
  try{
    const old=openApplication({profileDirectory:root});const oldDeck=await old.execute({type:'deck.create',name:'Previous profile'});assert.ok(oldDeck.ok);await old.close();
    const next=openApplication({profileDirectory:generation});const nextDeck=await next.execute({type:'deck.create',name:'Restored profile'});assert.ok(nextDeck.ok);await next.close();
    await writeFile(join(generation,'.profile-generation.json'),JSON.stringify({version:1,generation:id}));
    await writeFile(join(root,'current-profile.json'),JSON.stringify({version:1,generation:id}));
    const active=openApplication({profileDirectory:root});try{assert.deepEqual(await active.execute({type:'deck.list'}),{ok:true,data:[nextDeck.data]});}finally{await active.close();}
    assert.ok((await readFile(join(root,'profile.sqlite'))).length>0);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('invalid generation references preserve the original profile instead of choosing a different directory',async()=>{
  const root=await mkdtemp(join(tmpdir(),'neuroscape-generation-invalid-'));
  try{
    const old=openApplication({profileDirectory:root});await old.close();const original=await readFile(join(root,'profile.sqlite'));
    await writeFile(join(root,'current-profile.json'),JSON.stringify({version:1,generation:'../outside'}));
    let unexpected:ReturnType<typeof openApplication>|undefined;
    try{assert.throws(()=>{unexpected=openApplication({profileDirectory:root});},/profile.*preserved|generation|pointer/i);}finally{await unexpected?.close();}
    assert.deepEqual(await readFile(join(root,'profile.sqlite')),original);
  }finally{await rm(root,{recursive:true,force:true});}
});

for(const published of [false,true])test(`interrupted activation ${published?'after':'before'} pointer publication selects one complete profile`,async()=>{
  const root=await mkdtemp(join(tmpdir(),'neuroscape-generation-interrupted-')),id=randomUUID(),generation=join(root,'data-generations',id);
  try{
    const old=openApplication({profileDirectory:root});const oldDeck=await old.execute({type:'deck.create',name:'Previous profile'});assert.ok(oldDeck.ok);await old.close();
    const next=openApplication({profileDirectory:generation});const nextDeck=await next.execute({type:'deck.create',name:'Restored profile'});assert.ok(nextDeck.ok);await next.close();
    await writeFile(join(generation,'.profile-generation.json'),JSON.stringify({version:1,generation:id}));
    await writeFile(join(root,'restore-activation.json'),JSON.stringify({version:1,previous:{version:1,generation:null},next:id,recoveryBackup:null}));
    if(published)await writeFile(join(root,'current-profile.json'),JSON.stringify({version:1,generation:id}));
    const active=openApplication({profileDirectory:root});try{assert.deepEqual(await active.execute({type:'deck.list'}),{ok:true,data:[published?nextDeck.data:oldDeck.data]});}finally{await active.close();}
  }finally{await rm(root,{recursive:true,force:true});}
});
