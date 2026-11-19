import {DatabaseSync,backup} from 'node:sqlite';
import {readFile,writeFile,mkdtemp,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openApplication} from '../src/application';
import {resolveProfileLocation,writeProfileRelease} from '../src/profile-location';
async function main(){
  const evidence=JSON.parse(await readFile('.local/profile-backup-ui.json','utf8')),source=resolveProfileLocation(evidence.profileDirectory).directory,profileDirectory=await mkdtemp(join(tmpdir(),'neuroscape-upgrade-ui-')),db=new DatabaseSync(join(source,'profile.sqlite'),{readOnly:true});
  try{await backup(db,join(profileDirectory,'profile.sqlite'));}finally{db.close();}await cp(join(source,'artwork'),join(profileDirectory,'artwork'),{recursive:true});
  const app=openApplication({profileDirectory});try{const id=evidence.manifest.matches[0].id,before=await app.execute({type:'match.read',id}),decks=await app.execute({type:'deck.list'});if(!before.ok||before.data.phase!=='game'||!decks.ok)throw new Error('Expected the original pending backup game.');await writeFile('.local/upgrade-ui-profile.json',JSON.stringify({profileDirectory,id,before,decks:decks.data},null,2));}finally{await app.close();}
  // This is a qualified copy of the preserved 0.1.0 data; the old artifact opens it in the next step.
  writeProfileRelease(profileDirectory,'0.1.0');
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
