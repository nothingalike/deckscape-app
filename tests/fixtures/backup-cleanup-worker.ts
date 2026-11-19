import fileSystem from 'node:fs/promises';
import {openApplication} from '../../src/application';
import {dirname} from 'node:path';
const[profileDirectory,destination,mode]=process.argv.slice(2);
const app=openApplication({profileDirectory});
const fault=()=>Object.assign(new Error('controlled filesystem sharing fault'),{code:'EACCES'});
if(mode==='disconnected'){
  const rename=fileSystem.rename;
  fileSystem.rename=async()=>{await rename(dirname(destination),dirname(destination)+'-offline');throw Object.assign(new Error('controlled disconnected destination'),{code:'ENOENT'});};
}else{fileSystem.rename=async()=>{throw fault();};fileSystem.unlink=async()=>{throw fault();};}
async function main(){
  const started=await app.execute({type:'backup.export',destination});if(!started.ok)throw new Error('Backup did not start.');
  for(let attempt=0;attempt<1000;attempt++){const status=await app.execute({type:'backup.status'});if(status.ok&&!status.data.running){if(status.data.phase!=='failed')throw new Error('Expected controlled failure.');await app.close();process.send?.({failed:true});process.disconnect?.();return;}await new Promise(done=>setTimeout(done,5));}
  throw new Error('Backup failure did not settle.');
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
