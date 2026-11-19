import {DatabaseSync} from 'node:sqlite';
import {mkdir,lstat,rename,rm} from 'node:fs/promises';
import {join,resolve,basename,dirname} from 'node:path';
import {openApplication,type ApplicationOptions} from './application';
import {createProfileBackups} from './profile-backup';
import {stageProfileArchive,type StagedProfileArchive} from './profile-archive';
import {resolveProfileLocation,readProfileRelease,writeProfileRelease,markProfileGenerationReady,publishProfileGeneration,finishProfileActivation} from './profile-location';
import packageInfo from '../package.json';

export class ProfileUpgradeError extends Error {}
const versionParts=(value:string)=>value.split('.').map(Number);
function newer(left:string,right:string){const a=versionParts(left),b=versionParts(right);for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i];return false;}

/** Desktop startup gate. The synchronous application constructor remains the trusted storage seam. */
export async function startApplication(options:ApplicationOptions & {onUpgradeProgress?:(message:string)=>void}){
  const root=resolve(options.profileDirectory);await mkdir(root,{recursive:true});
  let location=resolveProfileLocation(root);
  if(location.activation?.journal.purpose==='upgrade'&&location.activation.selected==='previous'){finishProfileActivation(root,location);location=resolveProfileLocation(root);}
  const path=join(location.directory,'profile.sqlite'),info=await lstat(path).catch(error=>{if(error.code==='ENOENT')return undefined;throw error;});
  if(!info||location.activation){try{return openApplication(options);}catch(error){if(location.activation?.journal.purpose==='upgrade')throw new ProfileUpgradeError('The upgraded profile could not open. The previous complete profile and recovery ZIP are preserved. Reopen the prior compatible app release or restore the recovery ZIP.');throw error;}}
  if(!info.isFile()||info.isSymbolicLink())throw new ProfileUpgradeError('The profile database is unavailable. Keep the profile folder and use a compatible app release or restore a recovery ZIP.');
  let priorVersion='0.1.0',schema:number;
  try{const prior=readProfileRelease(location.directory);if(prior)priorVersion=prior.appVersion;
    const source=new DatabaseSync(path,{readOnly:true,allowExtension:false});try{schema=Number(source.prepare('PRAGMA user_version').get()?.user_version);}finally{source.close();}
  }catch{throw new ProfileUpgradeError('Profile compatibility metadata could not be read. Keep the profile folder and use a compatible app release or restore a recovery ZIP.');}
  if(![7,8].includes(schema)||newer(priorVersion,packageInfo.version))throw new ProfileUpgradeError('This profile needs a compatible app release. Its data is preserved. Keep the profile folder, reopen the matching release, or restore its recovery ZIP with a supported release.');
  if(schema===8&&priorVersion===packageInfo.version)return openApplication(options);
  options.onUpgradeProgress?.('Creating a recovery backup before upgrading the profile…');
  const source=new DatabaseSync(path,{readOnly:true,allowExtension:false}),backups=createProfileBackups(source,location.directory,{profileRoot:root,appVersion:priorVersion});
  let recovery:string|undefined,staged:StagedProfileArchive|undefined,moved=false;
  try{
    recovery=await backups.createRecoveryBackup();await backups.close();source.close();
    options.onUpgradeProgress?.('Validating a complete profile copy and its supported migration…');
    staged=await stageProfileArchive(recovery,root,options.soloContent,{preserveUnavailableMatches:true});
    writeProfileRelease(staged.directory,packageInfo.version);
    const generations=resolve(root,'data-generations');await mkdir(generations,{recursive:true});const container=await lstat(generations);if(!container.isDirectory()||container.isSymbolicLink())throw new Error('Invalid generation container.');
    const destination=join(generations,staged.id);if(dirname(destination)!==generations||dirname(resolve(staged.directory))!==join(root,'restore-staging'))throw new Error('Invalid upgrade generation.');
    await rename(staged.directory,destination);moved=true;markProfileGenerationReady(root,staged.id);publishProfileGeneration(root,staged.id,basename(recovery),'upgrade');
    options.onUpgradeProgress?.('Opening the upgraded profile with its original saved-game requirements…');
    return openApplication(options);
  }catch{
    throw new ProfileUpgradeError('The app upgrade could not finish. The previous complete profile is preserved.'+(recovery?' Recovery ZIP: '+recovery+'.':' Check available space and folder access before retrying.')+' Reopen the prior app release or restore that ZIP through Backups in a compatible release.');
  }finally{
    await backups.close();if(source.isOpen)source.close();
    if(staged&&!moved&&dirname(resolve(staged.directory))===join(root,'restore-staging'))await rm(staged.directory,{recursive:true,force:true}).catch(()=>{});
  }
}
