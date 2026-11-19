import {launchDesktop} from './desktop-launch.mjs';
import {expect,type ElectronApplication} from '@playwright/test';
import {readFile,writeFile,mkdtemp,rename,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';
import {stageProfileArchive} from '../src/profile-archive';
import {resolveProfileLocation} from '../src/profile-location';
import {openApplication} from '../src/application';

async function main(){
  const fixture=JSON.parse(await readFile('.local/restore-ui-profile.json','utf8')),development=process.argv.includes('--development');
  const executablePath=resolve(development?'node_modules/electron/dist/electron.exe':process.env.NEUROSCAPE_EXE??'release/win-unpacked/Neuroscape Local.exe');
  const env={...process.env,NEUROSCAPE_PROFILE_DIR:fixture.profileDirectory};delete env.ELECTRON_RUN_AS_NODE;delete env.NEUROSCAPE_CATALOG_FIXTURE_ORIGIN;
  const output=await mkdtemp(join(tmpdir(),'neuroscape-restore-output-')),bad=join(output,'damaged.zip'),relaunch=join(output,'relaunch.json');await writeFile(bad,'not a profile ZIP');
  let desktop:ElectronApplication|undefined;const errors:string[]=[];
  async function launch(backups=false){
    desktop=await launchDesktop({executablePath,args:[...(development?['.']:[]),...(backups?['--show-backups']:[])],env});
    assert.equal(await desktop.evaluate(async({session,net})=>{session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true}));try{await net.fetch('https://www.neuroscapetcg.com/',{cache:'no-store'});return false;}catch{return true;}}),true);
    const page=await desktop.firstWindow();page.on('pageerror',error=>errors.push(error.message));return page;
  }
  try{
    let page=await launch();assert.equal(await page.evaluate(()=>window.neuroscape.profileGeneration),null);
    await page.evaluate(id=>{location.hash='/decks/'+id;},fixture.deck.id);
    await page.getByLabel('Deck name',{exact:true}).fill('Changed current deck');await expect(page.getByRole('status').filter({hasText:'Saved on this device only'})).toBeVisible();
    const extra=await page.evaluate(()=>window.neuroscape.createDeck('Current-only draft'));assert.ok(extra.ok);
    const oldRecoveryKey='deckscape:unsaved:'+fixture.deck.id+':prior-profile';
    await page.evaluate(({key,deck})=>localStorage.setItem(key,JSON.stringify({...deck,name:'Previous unsaved browser draft'})),{key:oldRecoveryKey,deck:fixture.deck});
    await page.getByRole('link',{name:'Backups',exact:true}).click();const panel=page.getByRole('region',{name:'Restore profile',exact:true});
    await desktop!.evaluate(({dialog})=>{dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});});
    await panel.getByRole('button',{name:'Choose backup to restore',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Restore canceled.');
    await desktop!.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});dialog.showMessageBox=async()=>({response:1,checkboxChecked:false});},fixture.sourceArchive);
    await panel.getByRole('button',{name:'Choose backup to restore',exact:true}).click();await expect(panel.getByRole('status')).toContainText('Restore canceled.');
    const unchanged=await page.evaluate(id=>window.neuroscape.readDeck(id),fixture.deck.id);assert.ok(unchanged.ok);assert.equal(unchanged.data.name,'Changed current deck');
    await desktop!.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});},bad);
    await panel.getByRole('button',{name:'Choose backup to restore',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('current profile is unchanged',{timeout:30000});
    assert.deepEqual(await page.evaluate(id=>window.neuroscape.readMatch(id),fixture.id),fixture.before);await page.screenshot({path:'.local/restore-rejected.png'});
    await desktop!.evaluate(({dialog,app},{source,relaunch})=>{
      dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});
      // Control the OS launch boundary; the old app really quits and the harness cold-launches the same artifact/profile.
      app.relaunch=options=>{process.getBuiltinModule('fs').writeFileSync(relaunch,JSON.stringify(options));return true;};
      const childProcess=process.getBuiltinModule('child_process'),spawn=childProcess.spawn;
      childProcess.spawn=(file,args,options)=>{
        if(file==='/bin/sh'&&args?.[2]==='neuroscape-restart'){
          process.getBuiltinModule('fs').writeFileSync(relaunch,JSON.stringify({args:args.slice(5)}));
          return spawn('/bin/sh',['-c','exit 0'],options);
        }
        return spawn(file,args,options);
      };
    },{source:fixture.sourceArchive,relaunch});
    const closed=desktop!.waitForEvent('close',{timeout:60000});await panel.getByRole('button',{name:'Choose backup to restore',exact:true}).click();await closed;desktop=undefined;
    const launchRequest=JSON.parse(await readFile(relaunch,'utf8'));assert.ok(launchRequest.args.includes('--show-backups'));
    page=await launch(true);const restoredPanel=page.getByRole('region',{name:'Restore profile',exact:true});await expect(restoredPanel.getByRole('status')).toContainText('Profile restored.');
    const location=resolveProfileLocation(fixture.profileDirectory);assert.ok(location.generation);assert.equal(await page.evaluate(()=>window.neuroscape.profileGeneration),location.generation);
    assert.deepEqual(await page.evaluate(()=>window.neuroscape.listDecks()),{ok:true,data:fixture.decks});assert.equal((await page.evaluate(id=>window.neuroscape.readDeck(id),extra.data.id)).ok,false);
    assert.deepEqual(await page.evaluate(id=>window.neuroscape.readMatch(id),fixture.id),fixture.before);
    const result=await page.evaluate(()=>window.neuroscape.profileRestoreStatus());assert.ok(result.ok&&result.data.recoveryBackupPath);await access(result.data.recoveryBackupPath);
    await desktop!.evaluate(({shell})=>{shell.openPath=async()=>'';});await restoredPanel.getByRole('button',{name:'Open recovery backup folder',exact:true}).click();await page.screenshot({path:'.local/restore-complete.png'});
    const inspected=await stageProfileArchive(result.data.recoveryBackupPath,join(output,'recovery-inspection')),prior=openApplication({profileDirectory:inspected.directory});
    try{const previous=await prior.execute({type:'deck.read',id:fixture.deck.id});assert.ok(previous.ok);assert.equal(previous.data.name,'Changed current deck');assert.ok((await prior.execute({type:'deck.read',id:extra.data.id})).ok);}finally{await prior.close();}
    await page.evaluate(id=>{location.hash='/decks/'+id;},fixture.deck.id);await expect(page.getByLabel('Deck name',{exact:true})).toHaveValue(fixture.deck.name);
    await expect(page.getByRole('button',{name:'Restore recovered edits',exact:true})).toHaveCount(0);assert.ok(await page.evaluate(key=>localStorage.getItem(key),oldRecoveryKey));
    await page.getByRole('navigation').getByRole('link',{name:'Fight a bot',exact:true}).click();await page.getByRole('link',{name:'Resume game '+fixture.id.slice(0,8),exact:true}).click();await expect(page.getByRole('button',{name:'Install 1 RAM',exact:true})).toBeEnabled();
    const presentation=Object.values(fixture.before.data.snapshot.presentations).find((card:any)=>card.artworkUrl) as {artworkUrl:string};assert.ok(presentation);
    const legacyArtwork=join(resolve(fixture.profileDirectory),'artwork'),hidden=join(resolve(fixture.profileDirectory),'legacy-artwork-kept');assert.equal(dirname(legacyArtwork),resolve(fixture.profileDirectory));assert.equal(dirname(hidden),resolve(fixture.profileDirectory));
    await rename(legacyArtwork,hidden);try{assert.equal(await page.evaluate(async url=>{const response=await fetch(url,{cache:'no-store'}),image=await createImageBitmap(await response.blob());const valid=response.ok&&image.width>1;image.close();return valid;},presentation.artworkUrl),true);}finally{await rename(hidden,legacyArtwork);}
    await page.getByRole('button',{name:'Install 1 RAM',exact:true}).click();await expect.poll(async()=>{const match=await page.evaluate(id=>window.neuroscape.readMatch(id),fixture.id);return match.ok&&match.data.phase==='game'?match.data.snapshot.view.revision:-1;}).toBeGreaterThan(fixture.before.data.snapshot.view.revision);
    await page.screenshot({path:'.local/restore-resumed.png'});assert.deepEqual(errors,[]);
    await writeFile('.local/profile-restore-ui.json',JSON.stringify({development,executablePath,profileDirectory:fixture.profileDirectory,generation:location.generation,fileCancel:true,confirmationCancel:true,invalidArchivePreservesCurrent:true,recoveryBackupVerified:true,relaunchBoundaryControlled:true,coldReopen:true,restoredDecksAndMatch:true,browserRecoveryIsolatedAndPreserved:true,activeGenerationArtworkVerified:true,resumedPlayerAction:true,httpHttpsDenied:true,pageErrors:errors},null,2));
    console.log('PASS: native restore cancel/confirm, rejected archive, recovery backup, complete generation activation, cold reopen and original offline match.');
  }catch(error){console.error(error);if(desktop){const page=(await desktop.windows())[0];if(page)await page.screenshot({path:'.local/restore-failure.png',timeout:5000}).catch(()=>{});}throw error;}
  finally{if(desktop){await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(window=>window.destroy())).catch(()=>{});await desktop.close();}}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
