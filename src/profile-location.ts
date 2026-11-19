import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {lstatSync,readFileSync,openSync,writeFileSync,fsyncSync,closeSync,renameSync,unlinkSync,mkdirSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';

const generationId=z.uuid().refine(value=>value===value.toLowerCase());
const pointerSchema=z.object({version:z.literal(1),generation:generationId.nullable()}).strict();
const journalSchema=z.object({version:z.literal(1),previous:pointerSchema,next:generationId,recoveryBackup:z.string().regex(/^[a-f0-9-]{36}\.zip$/).nullable(),purpose:z.enum(['restore','upgrade']).optional()}).strict();
const readySchema=z.object({version:z.literal(1),generation:generationId}).strict();
const resultSchema=z.object({phase:z.enum(['complete','failed']),message:z.string().max(2000),recoveryBackup:z.string().regex(/^[a-f0-9-]{36}\.zip$/).nullable()}).strict();
const releaseSchema=z.object({version:z.literal(1),appVersion:z.string().max(100).regex(/^\d+\.\d+\.\d+$/),schemaVersion:z.union([z.literal(7),z.literal(8)])}).strict();
type Pointer=z.infer<typeof pointerSchema>;
type Activation=z.infer<typeof journalSchema>;
export interface ProfileLocation {directory:string;generation:string|null;activation?:{journal:Activation;selected:'previous'|'next'}}
export type RestoreResult=z.infer<typeof resultSchema>;

function readControl(root:string,name:string):unknown|undefined{
  const path=join(root,name),info=lstatSync(path,{throwIfNoEntry:false});if(!info)return undefined;
  if(!info.isFile()||info.isSymbolicLink()||info.size>16384)throw new Error('The profile control file is invalid. Existing data has been preserved.');
  try{return JSON.parse(readFileSync(path,'utf8'));}catch{throw new Error('The profile control file could not be read. Existing data has been preserved.');}
}
function writeControl(root:string,name:string,value:unknown){
  mkdirSync(root,{recursive:true});const path=join(root,name),temporary=join(root,`.${name}.${randomUUID()}.tmp`),fd=openSync(temporary,'wx');
  try{writeFileSync(fd,JSON.stringify(value)+'\n');fsyncSync(fd);}finally{closeSync(fd);}
  try{renameSync(temporary,path);}finally{try{unlinkSync(temporary);}catch{/* A promoted temporary no longer exists. */}}
  if(process.platform!=='win32'){const directory=openSync(root,'r');try{fsyncSync(directory);}finally{closeSync(directory);}}
}
function readPointer(root:string):Pointer{
  const raw=readControl(root,'current-profile.json');if(raw===undefined)return {version:1,generation:null};
  const parsed=pointerSchema.safeParse(raw);if(!parsed.success)throw new Error('The active profile generation pointer is invalid. Existing data has been preserved.');return parsed.data;
}
function generationDirectory(root:string,id:string|null){return id===null?root:join(root,'data-generations',generationId.parse(id));}
function complete(root:string,pointer:Pointer){
  const directory=generationDirectory(root,pointer.generation),info=lstatSync(directory,{throwIfNoEntry:false});
  if(!info?.isDirectory()||info.isSymbolicLink())return false;
  if(pointer.generation!==null){
    const container=lstatSync(join(root,'data-generations'),{throwIfNoEntry:false});if(!container?.isDirectory()||container.isSymbolicLink())return false;
    let marker;try{marker=readySchema.safeParse(readControl(directory,'.profile-generation.json'));}catch{return false;}
    if(!marker.success||marker.data.generation!==pointer.generation)return false;
  }
  const database=lstatSync(join(directory,'profile.sqlite'),{throwIfNoEntry:false});return Boolean(database?.isFile()&&!database.isSymbolicLink());
}
export function readRestoreResult(root:string):RestoreResult|undefined{
  const raw=readControl(root,'restore-result.json');return raw===undefined?undefined:resultSchema.parse(raw);
}
export function writeRestoreResult(root:string,result:RestoreResult){writeControl(root,'restore-result.json',resultSchema.parse(result));}
export function readProfileRelease(directory:string){const raw=readControl(directory,'profile-release.json');return raw===undefined?undefined:releaseSchema.parse(raw);}
export function writeProfileRelease(directory:string,appVersion:string,schemaVersion=8){writeControl(directory,'profile-release.json',releaseSchema.parse({version:1,appVersion,schemaVersion}));}

/** Browser data and instance ownership stay at root; only committed application data changes location. */
export function resolveProfileLocation(profileRoot:string):ProfileLocation{
  const root=resolve(profileRoot);
  for(const entry of readdirSync(root,{withFileTypes:true}))if(entry.isFile()&&!entry.isSymbolicLink()&&/^\.(current-profile|restore-activation|restore-result)\.json\.[a-f0-9-]{36}\.tmp$/.test(entry.name))try{unlinkSync(join(root,entry.name));}catch{/* The next launch retries owned metadata cleanup. */}
  const raw=readControl(root,'restore-activation.json');
  if(raw===undefined){const pointer=readPointer(root);if(pointer.generation!==null&&!complete(root,pointer))throw new Error('The selected profile generation is unavailable. Existing data has been preserved.');return {directory:generationDirectory(root,pointer.generation),generation:pointer.generation};}
  const journal=journalSchema.parse(raw);let pointer:Pointer|undefined;try{pointer=readPointer(root);}catch{/* The journal retains the previous complete profile. */}
  const selected=pointer?.generation===journal.next&&complete(root,pointer)?'next':'previous';
  const target:Pointer=selected==='next'?{version:1,generation:journal.next}:journal.previous;
  if(!complete(root,target))throw new Error('Restore recovery needs the previous complete profile or its recovery backup. Existing data has been preserved.');
  if(selected==='previous')writeControl(root,'current-profile.json',target);
  return {directory:generationDirectory(root,target.generation),generation:target.generation,activation:{journal,selected}};
}
export function finishProfileActivation(root:string,location:ProfileLocation){
  if(!location.activation)return;
  const {journal,selected}=location.activation;
  const action=journal.purpose==='upgrade'?'App upgrade':'Restore';
  writeRestoreResult(root,{phase:selected==='next'?'complete':'failed',message:selected==='next'?(journal.purpose==='upgrade'?'App upgraded.':'Profile restored.')+' The previous profile and recovery backup are retained.':action+' was interrupted. The previous complete profile was recovered.',recoveryBackup:journal.recoveryBackup});
  unlinkSync(join(root,'restore-activation.json'));
}
export function rollbackProfileActivation(root:string,location:ProfileLocation){
  if(!location.activation)return;
  if(!complete(root,location.activation.journal.previous))throw new Error('The previous profile needs its recovery backup. Existing data has been preserved.');
  writeControl(root,'current-profile.json',location.activation.journal.previous);
  writeRestoreResult(root,{phase:'failed',message:'The restored profile could not be opened. The previous complete profile was recovered.',recoveryBackup:location.activation.journal.recoveryBackup});
  unlinkSync(join(root,'restore-activation.json'));
}
export function markProfileGenerationReady(profileRoot:string,id:string){
  const generation=generationId.parse(id),root=resolve(profileRoot),directory=generationDirectory(root,generation);
  for(const path of [join(root,'data-generations'),directory]){const info=lstatSync(path);if(!info.isDirectory()||info.isSymbolicLink())throw new Error('The restored profile generation is unavailable.');}
  writeControl(directory,'.profile-generation.json',{version:1,generation});
}
export function publishProfileGeneration(profileRoot:string,id:string,recoveryBackup:string|null,purpose:'restore'|'upgrade'='restore'){
  const root=resolve(profileRoot),next=generationId.parse(id),previous=readPointer(root);
  if(!complete(root,{version:1,generation:next}))throw new Error('The restored profile generation is incomplete.');
  const journal=journalSchema.parse({version:1,previous,next,recoveryBackup,...(purpose==='upgrade'?{purpose}:{})});writeControl(root,'restore-activation.json',journal);writeControl(root,'current-profile.json',{version:1,generation:next});
}
