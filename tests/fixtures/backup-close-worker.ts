import fileSystem from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {openApplication} from '../../src/application';
import assert from 'node:assert/strict';
const[profileDirectory,destination]=process.argv.slice(2),original=fileSystem.createWriteStream;
fileSystem.createWriteStream=(...args)=>{
  const stream=original(...args);
  if(String(args[0]).endsWith('.tmp')){
    const final=stream._final?.bind(stream);
    stream._final=callback=>{setTimeout(()=>{if(final)final(callback);else callback();},2500);};
  }
  return stream;
};
syncBuiltinESMExports();
async function main(){const app=openApplication({profileDirectory});const started=await app.execute({type:'backup.export',destination});assert.ok(started.ok);const begin=Date.now();await app.close();process.send?.({drained:true,elapsedMs:Date.now()-begin});process.disconnect?.();}
void main().catch(error=>{console.error(error);process.exitCode=1;});
