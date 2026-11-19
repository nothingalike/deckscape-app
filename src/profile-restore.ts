import {mkdir,lstat,rename,rm} from 'node:fs/promises';
import {lstatSync,readdirSync,rmSync} from 'node:fs';
import {join,resolve,dirname,basename,isAbsolute,sep} from 'node:path';
import {z} from 'zod';
import type {AppResult,RestoreStatus} from './contract';
import type {SoloContent} from './solo-content';
import {stageProfileArchive,ProfileArchiveError,type StagedProfileArchive} from './profile-archive';
import {markProfileGenerationReady,publishProfileGeneration,readRestoreResult,writeRestoreResult} from './profile-location';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const key=(path:string)=>process.platform==='win32'?resolve(path).toLowerCase():resolve(path);
function inside(path:string,root:string){return key(path)===key(root)||key(path).startsWith(key(root)+sep);}
export function recoverRestoreStaging(profileRoot:string){
  const root=resolve(profileRoot,'restore-staging'),info=lstatSync(root,{throwIfNoEntry:false});if(!info)return 0;
  if(!info.isDirectory()||info.isSymbolicLink())throw new Error('The restore staging folder is unavailable.');let recovered=0;
  for(const entry of readdirSync(root,{withFileTypes:true}))if(entry.isDirectory()&&!entry.isSymbolicLink()&&uuid.test(entry.name)){
    const path=resolve(root,entry.name);if(dirname(path)!==root)throw new Error('Invalid restore staging path.');rmSync(path,{recursive:true,force:true});recovered++;
  }
  return recovered;
}
interface RestoreOwner {drain():Promise<void>;createRecoveryBackup():Promise<string>;closeStorage():Promise<void>;restartRequired():void}

/** Validation completes before current writes drain. Only a complete generation can become active. */
export function createProfileRestores(profileRoot:string,owner:RestoreOwner,content?:SoloContent){
  let state:RestoreStatus={running:false,phase:'idle',restartRequired:false},task:Promise<void>|null=null,quiesced=false;
  try{
    const recovered=recoverRestoreStaging(profileRoot),prior=readRestoreResult(profileRoot);
    if(prior)state={...state,phase:prior.phase,message:prior.message,...(prior.recoveryBackup?{recoveryBackupPath:join(profileRoot,'recovery-backups',prior.recoveryBackup)}:{})};
    else if(recovered)state={...state,phase:'failed',message:'An interrupted restore was discarded. Your active complete profile is unchanged.'};
  }catch{state={...state,phase:'failed',message:'Previous restore cleanup or status could not be read. Your profile remains available. Check folder access before retrying.'};}
  async function restore(source:string){
    let staged:StagedProfileArchive|undefined,moved=false,recoveryBackup:string|null=null;
    try{
      state={running:true,phase:'validating',restartRequired:false,message:'Validating backup files, records and saved-game compatibility…'};
      writeRestoreResult(profileRoot,{phase:'failed',message:'Restore was interrupted before activation. Your active complete profile was kept.',recoveryBackup:null});
      staged=await stageProfileArchive(source,profileRoot,content);
      quiesced=true;state={running:true,phase:'backup',restartRequired:false,message:'Saving a recovery backup of the current profile…'};
      await owner.drain();const recoveryPath=await owner.createRecoveryBackup();recoveryBackup=basename(recoveryPath);
      writeRestoreResult(profileRoot,{phase:'failed',message:'Restore was interrupted before activation. Your active complete profile and recovery backup were kept.',recoveryBackup});
      state={running:true,phase:'activating',restartRequired:false,recoveryBackupPath:recoveryPath,message:'Activating the complete restored profile…'};
      await owner.closeStorage();
      const generations=resolve(profileRoot,'data-generations');await mkdir(generations,{recursive:true});const info=await lstat(generations);if(!info.isDirectory()||info.isSymbolicLink())throw new Error('Invalid generation container.');
      const generation=join(generations,staged.id);if(dirname(resolve(staged.directory))!==resolve(profileRoot,'restore-staging')||dirname(generation)!==generations||!uuid.test(staged.id))throw new Error('Invalid generation path.');
      await rename(staged.directory,generation);moved=true;markProfileGenerationReady(profileRoot,staged.id);publishProfileGeneration(profileRoot,staged.id,recoveryBackup);
      state={...state,phase:'complete',restartRequired:true,message:'Profile restored. Restarting the app with the imported data…'};
    }catch(error){
      state={...state,phase:'failed',restartRequired:quiesced,message:error instanceof ProfileArchiveError?error.message:quiesced?'Restore could not finish. Reopening a complete profile; the previous data and any recovery backup are retained.':'The backup could not be read or validated. Your current profile is unchanged. Check the file and available space, then retry.'};
      if(quiesced)await owner.closeStorage().catch(()=>{});
      try{writeRestoreResult(profileRoot,{phase:'failed',message:state.message!,recoveryBackup});}catch{/* Status failure cannot overwrite either complete profile. */}
    }finally{if(staged&&!moved&&inside(staged.directory,join(profileRoot,'restore-staging')))await rm(staged.directory,{recursive:true,force:true}).catch(()=>{});}
  }
  return {
    get quiesced(){return quiesced;},
    execute(input:unknown):AppResult<RestoreStatus|{started:boolean}>{
      const parsed=z.discriminatedUnion('type',[z.object({type:z.literal('restore.status')}).strict(),z.object({type:z.literal('backup.restore'),source:z.string().min(1).max(32768)}).strict()]).safeParse(input);
      if(!parsed.success)return {ok:false,error:{code:'INVALID_REQUEST',message:'The requested restore operation is invalid.'}};
      if(parsed.data.type==='restore.status'){
        if(!task&&!quiesced)try{const prior=readRestoreResult(profileRoot);if(prior)state={...state,phase:prior.phase,message:prior.message,...(prior.recoveryBackup?{recoveryBackupPath:join(profileRoot,'recovery-backups',prior.recoveryBackup)}:{})};}catch{/* Keep the last usable status when diagnostics cannot be refreshed. */}
        return {ok:true,data:{...state}};
      }
      if(task||quiesced)return {ok:false,error:{code:'RESTORE_RUNNING',message:'A profile restore is already running or awaiting restart.'}};
      if(!isAbsolute(parsed.data.source)||inside(parsed.data.source,join(profileRoot,'restore-staging')))return {ok:false,error:{code:'INVALID_RESTORE_SOURCE',message:'Choose a profile ZIP outside the private restore staging folder.'}};
      task=restore(parsed.data.source).finally(()=>{task=null;state={...state,running:false};if(state.restartRequired)owner.restartRequired();});return {ok:true,data:{started:true}};
    },
    async close(){await task;},
  };
}
