import fileSystem from 'node:fs';
import {join,basename,sep} from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {openApplication} from '../../src/application';
import {soloFixture} from './solo';
const[profileDirectory,source,boundary]=process.argv.slice(2),app=openApplication({profileDirectory,soloContent:soloFixture().content});
function hold(){process.send?.({boundary});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);}
const rename=fileSystem.renameSync;
fileSystem.renameSync=(from,to)=>{
  const pointer=basename(String(to))==='current-profile.json';
  if(pointer&&boundary==='before-publish')hold();
  if(pointer&&boundary==='publish-failure')throw Object.assign(new Error('controlled activation fault'),{code:'EACCES'});
  rename(from,to);
  if(pointer&&boundary==='reopen-failure'){
    const selected=JSON.parse(fileSystem.readFileSync(String(to),'utf8')),db=new DatabaseSync(join(profileDirectory,'data-generations',selected.generation,'profile.sqlite'));db.exec('PRAGMA user_version=99;');db.close();hold();
  }
  if(pointer&&boundary==='after-publish')hold();
};
const create=fileSystem.createWriteStream;
fileSystem.createWriteStream=(...args)=>{
  const stream=create(...args);
  if(boundary==='staging'&&String(args[0]).includes(sep+'restore-staging'+sep))stream._write=()=>hold();
  return stream;
};
syncBuiltinESMExports();
async function main(){const started=await app.execute({type:'backup.restore',source});if(!started.ok)throw new Error('Restore did not start.');for(let attempt=0;attempt<2000;attempt++){const result=await app.execute({type:'restore.status'});if(result.ok&&!result.data.running){if(boundary!=='publish-failure'||result.data.phase!=='failed'||!result.data.restartRequired)throw new Error('Unexpected restore completion.');await app.close();process.send?.({boundary});process.disconnect?.();return;}await new Promise(done=>setTimeout(done,5));}throw new Error('Restore did not reach its boundary.');}
void main().catch(error=>{console.error(error);process.exitCode=1;});
