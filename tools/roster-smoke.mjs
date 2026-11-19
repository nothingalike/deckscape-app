import {launchDesktop} from './desktop-launch.mjs';
import {expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const fixture=JSON.parse(await readFile('.local/solo-ui-profile.json','utf8')),roster=JSON.parse(await readFile('src/data/bot-roster.json','utf8'));
const development=process.argv.includes('--development'),executablePath=resolve(development?'node_modules/electron/dist/electron.exe':process.env.NEUROSCAPE_EXE??'release/win-unpacked/Neuroscape Local.exe');
const env={...process.env,NEUROSCAPE_PROFILE_DIR:fixture.profileDirectory};delete env.ELECTRON_RUN_AS_NODE;delete env.NEUROSCAPE_CATALOG_FIXTURE_ORIGIN;
let desktop;const errors=[],saved=[];
try{
  desktop=await launchDesktop({executablePath,args:development?['.']:[],env});
  assert.equal(await desktop.evaluate(async({session,net})=>{session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true}));try{await net.fetch('https://www.neuroscapetcg.com/',{cache:'no-store'});return false;}catch{return true;}}),true);
  const page=await desktop.firstWindow();page.on('pageerror',error=>errors.push(error.message));
  for(const opponent of roster.opponents){
    await page.evaluate(id=>{location.hash='/solo/'+id;},fixture.supportedId);
    await expect(page.getByLabel('Your deck',{exact:true})).toHaveValue(fixture.supportedId);
    const picker=page.getByLabel('Bot opponent',{exact:true});await expect(picker.locator('option')).toHaveCount(4);
    await picker.selectOption(opponent.key);await expect(picker).toHaveValue(opponent.key);
    await expect(page.getByText('Hosted general tactics, saved with your matchup.',{exact:true})).toBeVisible();
    await expect(page.getByRole('region',{name:'Bot deck checks'})).toContainText('Solo support: supported');
    await expect(page.getByRole('button',{name:'Create match setup',exact:true})).toBeEnabled();
    await page.getByRole('button',{name:'Create match setup',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Saved match setup',exact:true})).toBeVisible();
    const id=page.url().split('/').at(-1),result=await page.evaluate(id=>window.neuroscape.readSoloSetup(id),id);assert.ok(result.ok);
    assert.equal(result.data.opponent.key,opponent.key);assert.equal(result.data.playbookHash,opponent.playbookSha256);
    assert.equal(result.data.engineVersion,roster.engineVersion);assert.equal(result.data.rulesVersion,roster.rulesVersion);
    const view=await page.evaluate(id=>window.neuroscape.readMatch(id),id);assert.ok(view.ok && view.data.phase==='setup');
    const url=view.data.setup.players[1].mainframe.artworkUrl;assert.ok(url);
    assert.equal(await page.evaluate(async url=>{const response=await fetch(url),bitmap=await createImageBitmap(await response.blob());const valid=response.ok&&bitmap.width>1;bitmap.close();return valid;},url),true);
    await page.screenshot({path:'.local/roster-'+opponent.key+'.png'});saved.push(result.data);
  }
  const artwork=new Map(roster.opponents.flatMap(opponent=>opponent.artwork).map(art=>[art.path,art.sha256]));
  for(const[path,hash]of artwork)assert.equal(createHash('sha256').update(await readFile(join(fixture.profileDirectory,'artwork',path.split('/').at(-1)))).digest('hex'),hash);
  await page.getByRole('link',{name:'Back to matchups',exact:true}).click();await expect(page.getByRole('region',{name:'Resume matches'})).toContainText('4');
  await page.screenshot({path:'.local/roster-picker.png'});assert.deepEqual(errors,[]);
  await writeFile('.local/bot-roster-ui.json',JSON.stringify({development,executablePath,profileDirectory:fixture.profileDirectory,selectedAllOpponents:true,validatedStrategies:true,artworkObjectsVerified:artwork.size,offline:true,saved,pageErrors:errors},null,2));
  console.log('PASS: all four packaged opponents selected and admitted offline with pinned strategies, reviewed definitions and original local artwork.');
}catch(error){if(desktop){const page=(await desktop.windows())[0];if(page)await page.screenshot({path:'.local/roster-failure.png',timeout:5000}).catch(()=>{});}throw error;}
finally{if(desktop){await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(window=>window.destroy())).catch(()=>{});await desktop.close();}}
