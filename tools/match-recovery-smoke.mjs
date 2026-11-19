import {launchDesktop} from './desktop-launch.mjs';
import {expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

const fixture=JSON.parse(await readFile('.local/resume-ui-profile.json','utf8'));
const development=process.argv.includes('--development'),executablePath=resolve(development?'node_modules/electron/dist/electron.exe':process.env.NEUROSCAPE_EXE??'release/win-unpacked/Neuroscape Local.exe');
const env={...process.env,NEUROSCAPE_PROFILE_DIR:fixture.profileDirectory};delete env.ELECTRON_RUN_AS_NODE;delete env.NEUROSCAPE_CATALOG_FIXTURE_ORIGIN;
const player=fixture.cases.find(item=>item.kind==='player'),bot=fixture.cases.find(item=>item.kind==='bot');
let desktop;const errors=[];const killed=[];
async function launch(){
  desktop=await launchDesktop({executablePath,args:development?['.']:[],env});
  assert.equal(await desktop.evaluate(async({session,net})=>{
    session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true}));
    try{await net.fetch('https://www.neuroscapetcg.com/',{cache:'no-store'});return false;}catch{return true;}
  }),true);
  const page=await desktop.firstWindow();page.on('pageerror',error=>errors.push(error.message));
  await expect(page.getByRole('link',{name:'Fight a bot',exact:true})).toBeVisible();return page;
}
async function resume(page,saved){await page.getByRole('link',{name:'Fight a bot',exact:true}).click();await page.getByRole('link',{name:'Resume game '+saved.id.slice(0,8),exact:true}).click();}
try{
  let page=await launch();assert.deepEqual(await page.evaluate(id=>window.neuroscape.readMatch(id),player.id),player.before);
  await resume(page,player);await expect(page.getByRole('button',{name:'Install 1 RAM',exact:true})).toBeEnabled();
  const ownedService=await desktop.evaluate(({app})=>{
    const metrics=app.getAppMetrics();const service=metrics.find(item=>item.name==='Neuroscape local data');
    if(!service)throw new Error('Owned utility process not found: '+JSON.stringify(metrics));
    process.kill(service.pid,'SIGKILL');return {pid:service.pid,name:service.name};
  });killed.push(ownedService);
  await expect(page.getByText('The local service is unavailable. Reopen the app to recover committed data.',{exact:true}).first()).toBeVisible({timeout:15000});
  await expect(page.getByRole('alert')).toContainText('Close and reopen the app to continue');
  assert.ok(await page.getByRole('alert').evaluate(element=>Number.parseFloat(getComputedStyle(element).fontSize))>=14);
  await expect(page.getByRole('region',{name:'Local match',exact:true})).toHaveAttribute('data-match-revision',String(player.before.data.snapshot.view.revision));
  await page.screenshot({path:'.local/recovery-service-error.png'});
  await desktop.close();desktop=undefined;
  page=await launch();assert.deepEqual(await page.evaluate(id=>window.neuroscape.readMatch(id),player.id),player.before);
  await resume(page,player);await page.getByRole('button',{name:'Install 1 RAM',exact:true}).click();
  await expect.poll(async()=>{const result=await page.evaluate(id=>window.neuroscape.readMatch(id),player.id);return result.ok&&result.data.phase==='game'?result.data.snapshot.view.revision:-1;}).toBeGreaterThan(player.before.data.snapshot.view.revision);
  await page.screenshot({path:'.local/recovery-player.png'});
  await page.locator('summary[aria-label="Options"]').click();
  await page.getByRole('link',{name:'Leave match view',exact:true}).click();
  assert.deepEqual(await page.evaluate(id=>window.neuroscape.readMatch(id),bot.id),bot.before);
  const owner=desktop.process(),ownerPid=await desktop.evaluate(()=>process.pid);assert.ok(ownerPid);
  await writeFile('.local/recovery-owner-pids.json',JSON.stringify({launcherPid:owner.pid,mainPid:ownerPid,profileDirectory:fixture.profileDirectory},null,2));
  const exited=new Promise((done,reject)=>{const timeout=setTimeout(()=>reject(new Error('Owned app process did not terminate')),10000);owner.once('exit',()=>{clearTimeout(timeout);done();});});
  process.kill(ownerPid,'SIGKILL');killed.push({pid:ownerPid,name:'owned connected Electron main'});await exited;desktop=undefined;
  page=await launch();assert.deepEqual(await page.evaluate(id=>window.neuroscape.readMatch(id),bot.id),bot.before);
  const secondExit=await new Promise((done,reject)=>{
    const second=spawn(executablePath,development?['.']:[],{env,windowsHide:true});
    const timeout=setTimeout(()=>{second.kill();reject(new Error('Second instance did not yield after recovery'));},10000);
    second.once('error',error=>{clearTimeout(timeout);reject(error);});second.once('exit',code=>{clearTimeout(timeout);done(code);});
  });assert.equal(secondExit,0);
  await resume(page,bot);
  await expect.poll(async()=>{const result=await page.evaluate(id=>window.neuroscape.readMatch(id),bot.id);return result.ok&&result.data.phase==='game'?result.data.snapshot.view.revision:-1;},{timeout:15000}).toBeGreaterThan(bot.before.data.snapshot.view.revision);
  await page.screenshot({path:'.local/recovery-bot.png'});
  assert.deepEqual(errors,[]);
  await writeFile('.local/match-recovery-ui.json',JSON.stringify({development,executablePath,profileDirectory:fixture.profileDirectory,ownedTerminations:killed,serviceFailureVisible:true,lastCommittedBoardRetained:true,playerReopenedAndAdvanced:true,terminatedOwnerReopened:true,botReopenedAndAdvanced:true,secondInstanceYielded:true,httpHttpsDenied:true,pageErrors:errors},null,2));
  console.log('PASS: visible service loss, retained board, terminated-owner recovery, resumed player/bot work and single writer under HTTP/HTTPS denial.');
}catch(error){
  console.error(error);if(desktop){const page=(await desktop.windows())[0];if(page)await page.screenshot({path:'.local/recovery-failure.png',timeout:5000}).catch(()=>{});}throw error;
}finally{if(desktop){await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(window=>window.destroy())).catch(()=>{});await desktop.close();}}
