import {spawn} from 'node:child_process';
import {createReadStream,createWriteStream} from 'node:fs';
import {access,mkdir,writeFile,copyFile,readdir,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';

// Run sequentially: individual proofs deliberately exchange only their owned fixtures.
assert.ok(process.env.NEUROSCAPE_EXE,'Set NEUROSCAPE_EXE to an installed artifact.');
const executable=resolve(process.env.NEUROSCAPE_EXE);await access(executable);
const run=randomUUID(),folder=resolve('.local/qualification-'+process.platform+'-'+run);
await mkdir(folder,{recursive:true});
const hash=createHash('sha256');for await(const bytes of createReadStream(executable))hash.update(bytes);
const evidence={run,started:new Date().toISOString(),platform:process.platform,architecture:process.arch,display:process.env.NEUROSCAPE_DISPLAY??null,executable,executableSha256:hash.digest('hex'),success:false,folder,steps:[],boundaries:{nativeDialogs:'Controlled OS selection/cancel responses; actual files, archives and app operations.',browser:'Controlled system-browser opener; no real browser acceptance claimed.',network:'HTTP/HTTPS denied in the shared Electron network session, including real main and utility requests. No OS firewall claim.',profiles:'Separate disposable profiles per destructive regression; full official-source rehearsal supplies the game/artwork baseline.'}};
const summary=join(folder,'qualification.json');
const env={...process.env,NEUROSCAPE_EXE:executable};
for(const key of Object.keys(env))if(/(^|_)SUPABASE_/.test(key)||['ELECTRON_RUN_AS_NODE','NEUROSCAPE_CATALOG_FIXTURE_ORIGIN','NEUROSCAPE_RELEASE_FIXTURE_ORIGIN'].includes(key))delete env[key];
async function save(){await writeFile(summary,JSON.stringify(evidence,null,2)+'\n');}
async function step(name,args,outputs=[]){
  const started=Date.now(),directory=join(folder,String(evidence.steps.length+1).padStart(2,'0')+'-'+name),entry={name,args,directory,started:new Date(started).toISOString(),success:false};evidence.steps.push(entry);await mkdir(directory);await save();console.log('START '+name);
  const log=createWriteStream(join(directory,'process.log'));
  try{
    await new Promise((done,reject)=>{const child=spawn(process.execPath,args,{env,windowsHide:true,stdio:['ignore','pipe','pipe']});for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{log.write(bytes);process.stdout.write(bytes);});child.once('error',reject);child.once('close',(code,signal)=>code===0?done():reject(new Error(name+' failed: '+(signal??code))));});
    for(const filename of outputs){const path=join('.local',filename),info=await stat(path);assert.ok(info.mtimeMs>=started-1000,'Missing current-run evidence: '+filename);await copyFile(path,join(directory,filename));}
    entry.success=true;entry.durationMs=Date.now()-started;console.log('PASS '+name);
  }catch(error){entry.error=String(error);throw error;}finally{await new Promise(done=>log.end(done));await save();}
}
const tool=(name,output)=>step(name,[...(name.endsWith('.ts')?['--disable-warning=ExperimentalWarning','--import','tsx']:[]),'tools/'+name],output);
try{
  await save();
  await tool('desktop-smoke.mjs',['desktop-proof.json','desktop-proof.png']);
  await tool('catalog-live.mjs',['catalog-live.json','catalog-live.png']);
  await tool('catalog-offline-check.mjs',['catalog-network-denied.json','catalog-network-denied.png']);
  await tool('decks-offline-check.mjs',['decks-network-denied.json','decks-network-denied.png']);
  await tool('catalog-smoke.mjs',['catalog-smoke.json']);
  await tool('decks-smoke.mjs',['decks-smoke.json','deck-editor.png','deck-reopened.png']);
  await tool('interchange-smoke.mjs',['interchange-core.json']);
  await tool('starter-interchange-smoke.mjs',['interchange-starters.json','interchange-starter-editor.png']);
  await tool('prepare-solo-ui.ts',['solo-ui-profile.json']);
  await tool('solo-smoke.mjs',['solo-ui.json']);
  await tool('roster-smoke.mjs',['bot-roster-ui.json']);
  await tool('game-smoke.ts',['game-ui.json','game-setup.png','game-battlefield.png','game-outcome.png']);
  await tool('prepare-solo-ui.ts',['solo-ui-profile.json']);
  await tool('prepare-resume-ui.ts',['resume-ui-profile.json']);
  await tool('resume-smoke.mjs',['resume-ui.json']);
  await tool('prepare-solo-ui.ts',['solo-ui-profile.json']);
  await tool('prepare-resume-ui.ts',['resume-ui-profile.json']);
  await tool('match-recovery-smoke.mjs',['match-recovery-ui.json','recovery-service-error.png']);
  await tool('prepare-solo-ui.ts',['solo-ui-profile.json']);
  await tool('prepare-resume-ui.ts',['resume-ui-profile.json']);
  await tool('content-retention-smoke.ts',['content-retention-ui.json']);
  await tool('prepare-solo-ui.ts',['solo-ui-profile.json']);
  await tool('prepare-backup-ui.ts',['backup-ui-profile.json']);
  await tool('backup-smoke.mjs',['profile-backup-ui.json']);
  await tool('prepare-restore-ui.ts',['restore-ui-profile.json']);
  await tool('restore-smoke.ts',['profile-restore-ui.json']);
  await tool('prepare-restore-ui.ts',['restore-ui-profile.json']);
  await tool('restore-native-relaunch.mjs',['profile-native-relaunch.json']);
  await tool('app-release-smoke.mjs',['app-release-ui.json','releases-unconfigured.png','releases-available.png']);
  const heavy=new Set(['bot-roster-game.test.ts','deckscape-simulator-bot.test.ts']);
  const tests=(await readdir('tests')).filter(name=>name.endsWith('.test.ts')&&!heavy.has(name)).sort().map(name=>'tests/'+name);
  await step('application-regressions',['--disable-warning=ExperimentalWarning','--import','tsx','--test',...tests]);
  evidence.success=true;evidence.completed=new Date().toISOString();await save();console.log('PASS installed qualification: '+summary);
}catch(error){evidence.error=String(error);await save();throw error;}
