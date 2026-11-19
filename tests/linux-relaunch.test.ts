import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {scheduleLinuxRelaunch} from '../src/linux-relaunch';

test('Linux restart waits for the old owner and preserves literal paths and arguments',{skip:process.platform!=='linux'},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'neuroscape-relaunch-')),destination=join(directory,'saved $name \' " .json');
  const owner=spawn(process.execPath,['-e',"process.send('ready');process.on('message',()=>process.exit(0))"],{stdio:['ignore','ignore','ignore','ipc']});
  await once(owner,'message');assert.ok(owner.pid);
  const literal='literal $HOME; $(printf unwanted) "quotes"';
  try{
    await scheduleLinuxRelaunch(process.execPath,['-e',"require('node:fs').writeFileSync(process.argv[1],process.argv[2])",destination,literal],owner.pid);
    await new Promise(done=>setTimeout(done,200));await assert.rejects(access(destination));
    const exited=once(owner,'exit');owner.send('quit');await exited;
    const until=Date.now()+5000;let value='';do{try{value=await readFile(destination,'utf8');break;}catch{await new Promise(done=>setTimeout(done,50));}}while(Date.now()<until);
    assert.equal(value,literal);
  }finally{if(owner.exitCode===null&&owner.signalCode===null)owner.kill();}
});
