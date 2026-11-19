import {launchDesktop} from './desktop-launch.mjs';
import {expect,type ElectronApplication} from '@playwright/test';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {stageProfileArchive} from '../src/profile-archive';
import {writeProfileRelease} from '../src/profile-location';
import packageInfo from '../package.json';

async function main(){
  if(!process.env.NEUROSCAPE_EXE)throw new Error('Set NEUROSCAPE_EXE to the installed platform artifact.');
  const directory=resolve(process.env.NEUROSCAPE_PORTABILITY_FIXTURE??'.local/portability-fixtures'),fixture=JSON.parse(await readFile(join(directory,'fixture.json'),'utf8'));
  if(!/^[a-z0-9-]+\.zip$/.test(fixture.archive))throw new Error('Invalid fixture archive name.');const archive=join(directory,fixture.archive),hash=createHash('sha256');for await(const bytes of createReadStream(archive))hash.update(bytes);assert.equal(hash.digest('hex'),fixture.sha256);
  const root=await mkdtemp(join(tmpdir(),'neuroscape-platform-render-')),staged=await stageProfileArchive(archive,root);writeProfileRelease(staged.directory,packageInfo.version);
  const executablePath=resolve(process.env.NEUROSCAPE_EXE),env={...process.env,NEUROSCAPE_PROFILE_DIR:staged.directory};delete env.ELECTRON_RUN_AS_NODE;delete env.NEUROSCAPE_CATALOG_FIXTURE_ORIGIN;delete env.NEUROSCAPE_RELEASE_FIXTURE_ORIGIN;
  let desktop:ElectronApplication|undefined;const errors:string[]=[];
  async function launch(){desktop=await launchDesktop({executablePath,env});assert.equal(await desktop!.evaluate(async({session,net})=>{session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true}));try{await net.fetch('https://www.neuroscapetcg.com/',{cache:'no-store'});return false;}catch{return true;}}),true);const page=await desktop!.firstWindow();page.on('pageerror',error=>errors.push(error.message));return page;}
  try{
    let page=await launch();assert.deepEqual(await page.evaluate(()=>window.neuroscape.listDecks()),{ok:true,data:fixture.decks});assert.deepEqual(await page.evaluate(id=>window.neuroscape.readMatch(id),fixture.match.id),{ok:true,data:fixture.match.expected});
    await page.getByRole('navigation').getByRole('link',{name:'Fight a bot',exact:true}).click();await page.getByRole('link',{name:'Resume game '+fixture.match.id.slice(0,8),exact:true}).click();await expect(page.getByRole('button',{name:'Install 1 RAM',exact:true})).toBeEnabled();
    const canvas=page.locator('canvas').first();await expect(canvas).toBeVisible();const dimensions=await canvas.evaluate((element:HTMLCanvasElement)=>({width:element.width,height:element.height,displayWidth:element.getBoundingClientRect().width,displayHeight:element.getBoundingClientRect().height}));assert.ok(dimensions.width>200&&dimensions.height>150);
    const card=Object.values(fixture.match.expected.snapshot.presentations).find((value:any)=>value.artworkUrl) as {artworkUrl:string};assert.ok(card);assert.equal(await page.evaluate(async url=>{const response=await fetch(url,{cache:'no-store'}),image=await createImageBitmap(await response.blob());const valid=response.ok&&image.width>1;image.close();return valid;},card.artworkUrl),true);
    const platform=await desktop!.evaluate(async({app,BrowserWindow})=>({platform:process.platform,architecture:process.arch,kernelVersion:process.getBuiltinModule('os').release(),versions:process.versions,profileDirectory:app.getPath('userData'),appDataRoot:app.getPath('appData'),noSandbox:app.commandLine.hasSwitch('no-sandbox'),display:app.commandLine.getSwitchValue('ozone-platform')||'native default',preferences:BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),gpuFeatures:app.getGPUFeatureStatus(),gpu:await app.getGPUInfo('complete')}));assert.equal(platform.noSandbox,false);assert.equal(platform.preferences.sandbox,true);assert.equal(platform.preferences.contextIsolation,true);assert.equal(platform.preferences.nodeIntegration,false);
    await page.screenshot({path:'.local/platform-render-before.png'});await page.getByRole('button',{name:'Install 1 RAM',exact:true}).click();await expect.poll(async()=>{const value=await page.evaluate(id=>window.neuroscape.readMatch(id),fixture.match.id);return value.ok&&value.data.phase==='game'?value.data.snapshot.view.revision:-1;}).toBeGreaterThan(fixture.match.expected.snapshot.view.revision);const after=await page.evaluate(id=>window.neuroscape.readMatch(id),fixture.match.id);await page.screenshot({path:'.local/platform-render-after.png'});
    await desktop!.close();desktop=undefined;page=await launch();assert.deepEqual(await page.evaluate(id=>window.neuroscape.readMatch(id),fixture.match.id),after);assert.deepEqual(errors,[]);
    await writeFile('.local/platform-render-proof.json',JSON.stringify({executablePath,...platform,sourceFixture:fixture.origin,archiveHash:fixture.sha256,sourceSchemaVersion:staged.sourceSchemaVersion,canvas:dimensions,artworkDecoded:true,originalPlayerInput:true,reopenedCommittedGame:true,httpHttpsDenied:true,pageErrors:errors},null,2));console.log('PASS: installed platform artifact, original Pixi game/input, native artwork decoding, sandbox and committed offline reopen.');
  }catch(error){if(desktop){const page=(await desktop.windows())[0];if(page)await page.screenshot({path:'.local/platform-render-failure.png',timeout:5000}).catch(()=>{});}throw error;}
  finally{await desktop?.close();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
