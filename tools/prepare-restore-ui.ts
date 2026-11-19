import {DatabaseSync,backup} from 'node:sqlite';
import {readFile,writeFile,mkdtemp,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resolveProfileLocation} from '../src/profile-location';
import {openApplication} from '../src/application';
async function main(){
  const evidence=JSON.parse(await readFile('.local/profile-backup-ui.json','utf8')),source=resolveProfileLocation(evidence.profileDirectory).directory;
  const profileDirectory=await mkdtemp(join(tmpdir(),'neuroscape-restore-ui-')),db=new DatabaseSync(join(source,'profile.sqlite'),{readOnly:true});
  try{await backup(db,join(profileDirectory,'profile.sqlite'));}finally{db.close();}
  await cp(join(source,'artwork'),join(profileDirectory,'artwork'),{recursive:true});
  const app=openApplication({profileDirectory});try{
    const id=evidence.manifest.matches[0].id,before=await app.execute({type:'match.read',id});if(!before.ok||before.data.phase!=='game')throw new Error('Expected original backup game.');
    const deck=await app.execute({type:'deck.read',id:before.data.summary.playerDeck.id}),decks=await app.execute({type:'deck.list'});if(!deck.ok||!decks.ok)throw new Error('Expected backed-up decks.');
    await writeFile('.local/restore-ui-profile.json',JSON.stringify({profileDirectory,sourceArchive:evidence.destination,id,before,deck:deck.data,decks:decks.data},null,2));
  }finally{await app.close();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
