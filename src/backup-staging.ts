import {lstatSync,readdirSync,readFileSync,realpathSync,unlinkSync,rmSync} from 'node:fs';
import {resolve,join,dirname,basename,sep,isAbsolute} from 'node:path';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const key=(path:string)=>process.platform==='win32'?resolve(path).toLowerCase():resolve(path);
function inside(path:string,root:string){return key(path)===key(root)||key(path).startsWith(key(root)+sep);}

/** Reclaim only this profile's UUID backup runs and their exactly derived temporary ZIPs. */
export function recoverBackupStaging(profileDirectory:string){
  const root=resolve(profileDirectory,'backup-staging'),info=lstatSync(root,{throwIfNoEntry:false});
  if(!info)return 0;if(!info.isDirectory()||info.isSymbolicLink())throw new Error('Invalid backup staging directory.');
  let recovered=0;
  for(const entry of readdirSync(root,{withFileTypes:true})){
    if(!entry.isDirectory()||entry.isSymbolicLink()||!uuid.test(entry.name))continue;
    const run=resolve(root,entry.name);if(dirname(run)!==root)throw new Error('Invalid backup staging path.');
    const journal=join(run,'job.json'),record=lstatSync(journal,{throwIfNoEntry:false});
    let job:unknown;
    if(record?.isFile()&&!record.isSymbolicLink()&&record.size<=16384){
      const text=readFileSync(journal,'utf8');try{job=JSON.parse(text);}catch{/* Invalid JSON cannot authorize external deletion. */}
    }
    if(job&&typeof job==='object'&&'destination'in job&&'temporary'in job&&typeof job.destination==='string'&&isAbsolute(job.destination)&&typeof job.temporary==='string'){
      const expected=join(dirname(job.destination),`.${basename(job.destination)}.${entry.name}.tmp`);
      if(key(job.temporary)===key(expected)){
        // A valid ownership record remains until its destination can be checked, including removable drives.
        const parent=realpathSync(dirname(job.destination));
        const profileRoot=realpathSync(profileDirectory),internalRecovery='purpose'in job&&job.purpose==='recovery'&&key(parent)===key(join(profileRoot,'recovery-backups'))&&/^[a-f0-9-]{36}\.zip$/.test(basename(job.destination));
        if(key(parent)!==key(dirname(expected))||(inside(parent,profileRoot)&&!internalRecovery))throw new Error('Backup destination ownership could not be verified.');
        const file=lstatSync(expected,{throwIfNoEntry:false});if(file?.isFile()&&!file.isSymbolicLink())unlinkSync(expected);
      }
    }
    rmSync(run,{recursive:true,force:true});recovered++;
  }
  return recovered;
}
