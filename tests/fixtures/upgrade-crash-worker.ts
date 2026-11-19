import fileSystem from 'node:fs';
import {join,basename,sep} from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {startApplication,ProfileUpgradeError} from '../../src/startup';
import {soloFixture} from './solo';
const[profileDirectory,boundary]=process.argv.slice(2);
function hold(){process.send?.({boundary});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);}
const execute=DatabaseSync.prototype.exec;
DatabaseSync.prototype.exec=function(sql){
  if(sql.includes('ALTER TABLE solo_setups ADD COLUMN updated_at')&&String(this.location?.()??'').includes('restore-staging')){
    if(boundary==='migration-failure'){execute.call(this,sql.replace('COMMIT;',''));throw Object.assign(new Error('controlled full disk during migration'),{code:'ENOSPC'});}
    execute.call(this,sql);if(boundary==='after-migration')hold();
    if(boundary==='long-validation'){const until=performance.now()+16250;while(performance.now()<until){/* Model a blocking SQLite/validation operation beyond the initial startup deadline. */}}
    return;
  }
  return execute.call(this,sql);
};
const rename=fileSystem.renameSync;
fileSystem.renameSync=(from,to)=>{
  const pointer=basename(String(to))==='current-profile.json';
  if(pointer&&boundary==='before-publish')hold();
  if(pointer&&boundary==='publish-failure')throw Object.assign(new Error('controlled upgrade activation fault'),{code:'EACCES'});
  rename(from,to);
  if(pointer&&boundary==='reopen-failure'){const selected=JSON.parse(fileSystem.readFileSync(String(to),'utf8')),db=new DatabaseSync(join(profileDirectory,'data-generations',selected.generation,'profile.sqlite'));db.exec('PRAGMA user_version=99;');db.close();hold();}
  if(pointer&&boundary==='after-publish')hold();
};
const create=fileSystem.createWriteStream;
fileSystem.createWriteStream=(...args)=>{const stream=create(...args);if(boundary==='staging'&&String(args[0]).includes(sep+'restore-staging'+sep))stream._write=()=>hold();return stream;};
syncBuiltinESMExports();
void startApplication({profileDirectory,soloContent:soloFixture().content,onUpgradeProgress:message=>{if(boundary==='long-validation')process.send?.({type:'startup-progress',message});}}).then(async app=>{await app.close();if(boundary==='long-validation'){process.send?.({type:'ready'});process.disconnect?.();return;}throw new Error('Upgrade did not reach its boundary.');}).catch(error=>{
  if(['migration-failure','publish-failure'].includes(boundary)&&error instanceof ProfileUpgradeError){process.send?.({boundary});process.disconnect?.();}
  else{console.error(error);process.exitCode=1;}
});
