import {readFile,writeFile,mkdir,copyFile,mkdtemp} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {stageProfileArchive} from '../src/profile-archive';
import {openApplication} from '../src/application';

async function main(){
  const evidence=JSON.parse(await readFile('.local/profile-backup-ui.json','utf8'));
  if(!evidence.origin?.platform||!evidence.origin?.architecture)throw new Error('Run the current backup UI proof first to record the exporting app architecture.');
  const output=resolve(process.env.NEUROSCAPE_PORTABILITY_OUTPUT??'.local/portability-export');
  await mkdir(output,{recursive:true});
  const archive=evidence.origin.platform+'-profile-v1-schema8.zip',target=join(output,archive);
  await copyFile(evidence.destination,target);
  const hash=createHash('sha256');for await(const bytes of createReadStream(target))hash.update(bytes);
  // Derive expected records from the exported archive, never from a later live profile.
  const root=await mkdtemp(join(tmpdir(),'neuroscape-portability-export-')),staged=await stageProfileArchive(target,root);
  const app=openApplication({profileDirectory:staged.directory});
  try{
    const id=evidence.manifest.matches[0].id,match=await app.execute({type:'match.read',id}),decks=await app.execute({type:'deck.list'});
    if(!match.ok||match.data.phase!=='game'||!decks.ok)throw new Error('The exported archive needs a resumable original game and its decks.');
    await writeFile(join(output,'fixture.json'),JSON.stringify({version:1,origin:evidence.origin,archive,sha256:hash.digest('hex'),schemaVersion:staged.sourceSchemaVersion,decks:decks.data,match:{id,expected:match.data}},null,2)+'\n');
    console.log('Prepared private '+process.platform+' backup fixture: '+output);
  }finally{await app.close();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
