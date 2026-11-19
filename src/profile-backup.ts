import {DatabaseSync,backup} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,lstat,open,rename,rm,unlink,realpath,stat} from 'node:fs/promises';
import {join,resolve,dirname,basename,sep,isAbsolute} from 'node:path';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {ZipFile} from 'yazl';
import {z} from 'zod';
import type {AppResult,BackupStatus} from './contract';
import packageInfo from '../package.json';
import {recoverBackupStaging} from './backup-staging';

export const backupLimits={totalBytes:2*1024**3,databaseBytes:512*1024**2,artworkBytes:10*1024**2,files:20002,manifestBytes:8*1024**2};
const sha=z.string().regex(/^[a-f0-9]{64}$/),artName=/^[a-f0-9]{64}\.(png|jpg|webp)$/;
export const backupManifestSchema=z.object({format:z.literal('neuroscape-profile'),version:z.literal(1),createdAt:z.iso.datetime(),appVersion:z.string().min(1),schemaVersion:z.number().int().positive(),
  files:z.array(z.object({path:z.string().regex(/^(profile\.sqlite|artwork\/[a-f0-9]{64}\.(png|jpg|webp))$/),size:z.number().int().nonnegative(),sha256:sha}).strict()).min(1).max(backupLimits.files),
  matches:z.array(z.object({id:z.uuid(),engineVersion:z.string().min(1).max(100),rulesVersion:z.string().min(1).max(100),definitionVersions:z.array(sha).max(1000),playbookHash:sha}).strict()).max(10000),
}).strict();
export type BackupManifest=z.infer<typeof backupManifestSchema>;
class BackupError extends Error {}
const pathKey=(path:string)=>process.platform==='win32'?resolve(path).toLowerCase():resolve(path);
function inside(path:string,root:string){const parent=pathKey(root),child=pathKey(path);return child===parent||child.startsWith(parent+sep);}

/** References come from the consistent database snapshot, including retained catalog history. */
export function profileBackupReferences(db:DatabaseSync){
  const artwork=new Map<string,string>();
  function add(path:unknown,hash:unknown){if(typeof path!=='string'||!artName.test(path)||!sha.safeParse(hash).success||!path.startsWith(String(hash)+'.'))throw new BackupError('An artwork reference is invalid. Your profile is unchanged.');artwork.set(path,String(hash));}
  for(const row of db.prepare('SELECT payload FROM catalog_cards').iterate()){
    const card=JSON.parse(String(row.payload));if(card.image_path!==null&&card.image_path!==undefined)add(card.image_path,card.image_hash);
  }
  const matches=[];
  for(const row of db.prepare('SELECT payload FROM solo_setups ORDER BY id').iterate()){
    const saved=JSON.parse(String(row.payload));for(const art of saved.artwork)add(art.path,art.sha256);
    matches.push({id:saved.summary.id,engineVersion:saved.summary.engineVersion,rulesVersion:saved.summary.rulesVersion,
      definitionVersions:saved.summary.definitionVersions,playbookHash:saved.summary.playbookHash});
  }
  return {artwork,matches};
}

async function digestFile(path:string,limit:number){
  const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size>limit)throw new BackupError('A required backup file is invalid or exceeds the supported size.');
  const hash=createHash('sha256');let size=0;
  for await(const chunk of createReadStream(path)){size+=chunk.length;if(size>limit)throw new BackupError('A required backup file exceeds the supported size.');hash.update(chunk);}
  return {size,sha256:hash.digest('hex')};
}

export function createProfileBackups(db:DatabaseSync,profileDirectory:string,{profileRoot=profileDirectory,appVersion=packageInfo.version}:{profileRoot?:string;appVersion?:string}={}){
  let state:BackupStatus={running:false,phase:'idle',done:0,total:0},task:Promise<void>|null=null;
  const stagingRoot=join(profileRoot,'backup-staging'),recoveryRoot=join(profileRoot,'recovery-backups');
  try{if(recoverBackupStaging(profileRoot))state={...state,message:'Recovered temporary backup files from a previous session. Your profile remains available.'};}
  catch{state={...state,phase:'failed',message:'Temporary backup cleanup could not finish. Your profile remains available. Check folder access before retrying.'};}
  async function create(destination:string,recovery=false){
    let staging:string|undefined,temporary:string|undefined;
    try{
      const parent=await realpath(dirname(destination)),rootPath=await realpath(profileRoot);
      const internalRecovery=recovery&&pathKey(parent)===pathKey(join(rootPath,'recovery-backups'))&&/^[a-f0-9-]{36}\.zip$/.test(basename(destination));
      if(inside(parent,rootPath)&&!internalRecovery)throw new BackupError('Choose a backup destination outside the active profile folder.');
      await mkdir(stagingRoot,{recursive:true});const root=await lstat(stagingRoot);if(root.isSymbolicLink()||!root.isDirectory())throw new BackupError('The backup staging folder is unavailable.');
      const runId=randomUUID();staging=join(stagingRoot,runId);if(!inside(staging,stagingRoot))throw new BackupError('The backup staging folder is invalid.');await mkdir(staging);
      const snapshot=join(staging,'profile.sqlite');state={running:true,phase:'snapshot',done:0,total:0};
      await backup(db,snapshot);
      const snapshotDb=new DatabaseSync(snapshot,{readOnly:true});let references:ReturnType<typeof profileBackupReferences>,schemaVersion:number;
      try{if(snapshotDb.prepare('PRAGMA quick_check').get()?.quick_check!=='ok')throw new BackupError('The profile needs recovery before it can be backed up.');schemaVersion=Number(snapshotDb.prepare('PRAGMA user_version').get()?.user_version);references=profileBackupReferences(snapshotDb);}finally{snapshotDb.close();}
      if(references.artwork.size+1>backupLimits.files)throw new BackupError('This profile exceeds the supported backup file count.');
      const files:BackupManifest['files']=[{path:'profile.sqlite',...await digestFile(snapshot,backupLimits.databaseBytes)}];let total=files[0].size;
      state={running:true,phase:'artwork',done:0,total:references.artwork.size};await mkdir(join(staging,'artwork'));
      for(const[name,expectedHash]of [...references.artwork].sort(([a],[b])=>a.localeCompare(b))){
        const source=join(profileDirectory,'artwork',name),target=join(staging,'artwork',name);
        const info=await lstat(source);if(!info.isFile()||info.isSymbolicLink()||info.size>backupLimits.artworkBytes)throw new BackupError('Required artwork is missing or damaged. Restore the original downloaded files before retrying.');
        const hash=createHash('sha256');let size=0;
        await pipeline(createReadStream(source),new Transform({transform(chunk,_encoding,callback){size+=chunk.length;if(size>backupLimits.artworkBytes)return callback(new BackupError('An artwork file exceeds the supported size.'));hash.update(chunk);callback(null,chunk);}}),createWriteStream(target,{flags:'wx'}));
        const actual=hash.digest('hex');if(actual!==expectedHash)throw new BackupError('Required artwork is missing or damaged. Restore the original downloaded files before retrying.');
        total+=size;if(total>backupLimits.totalBytes)throw new BackupError('This profile exceeds the supported 2 GiB backup limit.');
        files.push({path:'artwork/'+name,size,sha256:actual});state={...state,done:state.done+1};
      }
      const manifest=backupManifestSchema.parse({format:'neuroscape-profile',version:1,createdAt:new Date().toISOString(),appVersion,schemaVersion,files,matches:references.matches});
      const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2));if(manifestBytes.length>backupLimits.manifestBytes||total+manifestBytes.length>backupLimits.totalBytes)throw new BackupError('This profile exceeds the supported backup size.');
      state={running:true,phase:'archive',done:0,total:files.length};
      temporary=join(parent,`.${basename(destination)}.${runId}.tmp`);
      const journal=await open(join(staging,'job.json'),'wx');try{await journal.writeFile(JSON.stringify({destination:join(parent,basename(destination)),temporary,purpose:recovery?'recovery':'export'}));await journal.sync();}finally{await journal.close();}
      const zip=new ZipFile(),output=createWriteStream(temporary,{flags:'wx'});zip.on('error',error=>output.destroy(error));
      zip.addBuffer(manifestBytes,'manifest.json');for(const file of files)zip.addFile(join(staging,file.path),file.path,{compress:file.path==='profile.sqlite'});
      const written=pipeline(zip.outputStream,output);zip.end();await written;
      const outputFile=await open(temporary,'r+');try{await outputFile.sync();}finally{await outputFile.close();}
      if((await stat(temporary)).size>backupLimits.totalBytes)throw new BackupError('The archive exceeds the supported backup size.');
      await rename(temporary,destination);temporary=undefined;
      state={running:true,phase:'complete',done:files.length,total:files.length,lastSavedAt:new Date().toISOString(),message:'Complete profile backup saved.'};
    }catch(error){state={running:true,phase:'failed',done:state.done,total:state.total,message:error instanceof BackupError?error.message:'The backup could not be saved. Your active profile and previous destination are unchanged. Check available space and folder access, then retry.'};}
    finally{
      let retryExternalCleanup=false;
      if(temporary)try{await unlink(temporary);}catch{retryExternalCleanup=true;}
      if(!retryExternalCleanup&&staging&&inside(staging,stagingRoot))await rm(staging,{recursive:true,force:true}).catch(()=>{});
    }
  }
  return {
    execute(input:unknown):AppResult<BackupStatus|{started:boolean}>{
      const parsed=z.discriminatedUnion('type',[z.object({type:z.literal('backup.status')}).strict(),z.object({type:z.literal('backup.export'),destination:z.string().min(1).max(32768)}).strict()]).safeParse(input);
      if(!parsed.success)return {ok:false,error:{code:'INVALID_REQUEST',message:'The requested backup operation is invalid.'}};
      if(parsed.data.type==='backup.status')return {ok:true,data:{...state}};
      if(task)return {ok:false,error:{code:'BACKUP_RUNNING',message:'A profile backup is already running.'}};
      const destination=parsed.data.destination;
      if(!isAbsolute(destination)||inside(destination,profileRoot)||basename(destination).includes(':'))return {ok:false,error:{code:'INVALID_DESTINATION',message:'Choose a backup destination outside the active profile folder.'}};
      state={running:true,phase:'snapshot',done:0,total:0};task=create(destination).finally(()=>{task=null;state={...state,running:false};});return {ok:true,data:{started:true}};
    },
    async createRecoveryBackup(){
      await task;await mkdir(recoveryRoot,{recursive:true});const info=await lstat(recoveryRoot);if(!info.isDirectory()||info.isSymbolicLink())throw new BackupError('The recovery backup folder is unavailable.');
      const destination=join(await realpath(recoveryRoot),randomUUID()+'.zip');
      state={running:true,phase:'snapshot',done:0,total:0};task=create(destination,true).finally(()=>{task=null;state={...state,running:false};});await task;
      if(state.phase!=='complete')throw new BackupError(state.message??'The recovery backup could not be saved.');return destination;
    },
    async close(){await task;},
  };
}
