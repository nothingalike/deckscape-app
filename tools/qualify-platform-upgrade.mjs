import {spawn} from 'node:child_process';
import {access,copyFile,readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

assert.ok(process.env.NEUROSCAPE_EXE&&process.env.NEUROSCAPE_PREDECESSOR_EXE,'Set current and native 0.1.0 predecessor executable paths.');
const current=resolve(process.env.NEUROSCAPE_EXE),previous=resolve(process.env.NEUROSCAPE_PREDECESSOR_EXE);
await access(current);await access(previous);assert.notEqual(current,previous);
const folder=resolve('.local/platform-upgrade-'+randomUUID());await mkdir(folder);
async function run(tool,executable,args=[]){
  const env={...process.env,NEUROSCAPE_EXE:executable};delete env.ELECTRON_RUN_AS_NODE;
  // The preserved early predecessor's window proof was X11. Current acceptance
  // uses the caller's selected display; the predecessor display is explicit.
  if(process.env.NEUROSCAPE_PREDECESSOR_DISPLAY)env.NEUROSCAPE_DISPLAY=process.env.NEUROSCAPE_PREDECESSOR_DISPLAY;
  if(executable===current){
    if(process.env.NEUROSCAPE_DISPLAY)env.NEUROSCAPE_DISPLAY=process.env.NEUROSCAPE_DISPLAY;
    else delete env.NEUROSCAPE_DISPLAY;
  }
  await new Promise((done,reject)=>{const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning','--import','tsx','tools/'+tool,...args],{env,stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('close',code=>code===0?done():reject(new Error(tool+' failed: '+code)));});
}
const evidence={platform:process.platform,current,previous,predecessorDisplay:process.env.NEUROSCAPE_PREDECESSOR_DISPLAY??null,currentDisplay:process.env.NEUROSCAPE_DISPLAY??null,success:false,cases:[]};
try{
  for(const schema of [8,7]){
    await run('prepare-upgrade-ui.ts',current);
    await run('upgrade-smoke.ts',previous,['--before',...(schema===7?['--schema7']:[])]);
    await run('upgrade-smoke.ts',current);
    const result=JSON.parse(await readFile('.local/profile-upgrade-ui.json','utf8'));assert.equal(result.sourceSchemaVersion,schema);
    evidence.cases.push(result);await copyFile('.local/profile-upgrade-ui.json',join(folder,'schema'+schema+'.json'));
    for(const image of ['upgrade-before.png','upgrade-complete.png','upgrade-resumed.png'])await copyFile('.local/'+image,join(folder,'schema'+schema+'-'+image));
  }
  evidence.success=true;
}finally{await writeFile(join(folder,'qualification.json'),JSON.stringify(evidence,null,2)+'\n');console.log(folder);}
