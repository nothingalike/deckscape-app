import fileSystem from 'node:fs/promises';
import {openApplication} from '../../src/application';
const[profileDirectory,destination]=process.argv.slice(2);
const app=openApplication({profileDirectory});
fileSystem.rename=async()=>{process.send?.({boundary:'before-publish'});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);};
void app.execute({type:'backup.export',destination});
