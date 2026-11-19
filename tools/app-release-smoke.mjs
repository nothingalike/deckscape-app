import {launchDesktop} from './desktop-launch.mjs';
import {expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';

const fixture=JSON.parse(await readFile('.local/restore-ui-profile.json','utf8')),executablePath=resolve(process.env.NEUROSCAPE_EXE??'release/win-unpacked/Neuroscape Local.exe');
let mode='current',redirectTargets=0,origin='',desktop;
const notes='Controlled release notes.\n<script>window.releaseInjected=true</script>';
const server=createServer((request,response)=>{
  if(request.url==='/redirect-target'){redirectTargets++;response.writeHead(500).end();return;}
  assert.equal(request.url,'/release.json');
  if(mode==='redirect'){response.writeHead(302,{Location:origin+'/redirect-target'}).end();return;}
  if(mode==='unavailable'){response.writeHead(503).end();return;}
  if(mode==='timeout'){response.writeHead(200,{'Content-Type':'application/json'});response.flushHeaders();return;}
  response.writeHead(200,{'Content-Type':mode==='wrong-type'?'text/html':'application/json'});
  if(mode==='oversized'){response.end(' '.repeat(65537));return;}
  response.end(JSON.stringify({format:'neuroscape-app-release',version:1,release:{version:mode==='malformed'?'invalid':mode==='new'?'0.2.1':'0.2.0',publishedAt:'2026-11-15T12:00:00.000Z',notes}}));
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));origin='http://127.0.0.1:'+server.address().port;
const errors=[];
async function launch(configured){const env={...process.env,NEUROSCAPE_PROFILE_DIR:fixture.profileDirectory};delete env.ELECTRON_RUN_AS_NODE;delete env.NEUROSCAPE_RELEASE_FIXTURE_ORIGIN;if(configured)env.NEUROSCAPE_RELEASE_FIXTURE_ORIGIN=origin;
  desktop=await launchDesktop({executablePath,env});assert.equal(await desktop.evaluate(async({session,net},{origin,configured})=>{session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(details,callback)=>callback({cancel:!configured||!details.url.startsWith(origin+'/')}));try{await net.fetch('https://www.neuroscapetcg.com/',{cache:'no-store'});return false;}catch{return true;}},{origin,configured}),true);
  const page=await desktop.firstWindow();page.on('pageerror',error=>errors.push(error.message));await page.getByRole('link',{name:'App & updates',exact:true}).click();return page;
}
try{
  let page=await launch(false);await expect(page.getByRole('heading',{name:'Installed app',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'App releases'}).getByRole('status')).toContainText('not configured');await expect(page.getByRole('button',{name:'Check app releases',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Open download page',exact:true})).toHaveCount(0);assert.deepEqual(await page.evaluate(id=>window.neuroscape.readMatch(id),fixture.id),fixture.before);await page.screenshot({path:'.local/releases-unconfigured.png',fullPage:true});await desktop.close();desktop=undefined;
  page=await launch(true);const mainPid=await desktop.evaluate(()=>process.pid),beforeCatalog=await page.evaluate(()=>window.neuroscape.catalogStatus());
  await desktop.evaluate(({shell})=>{globalThis.releaseOpened=[];shell.openExternal=async url=>{globalThis.releaseOpened.push(url);};});
  await page.getByRole('button',{name:'Check app releases',exact:true}).click();await expect(page.getByRole('region',{name:'App releases'}).getByRole('status')).toContainText('latest listed');await expect(page.getByRole('heading',{name:'Latest listed release: 0.2.0'})).toBeVisible();
  await page.getByRole('button',{name:'Open download page',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Opened the release download page'})).toBeVisible();
  mode='new';await page.getByRole('button',{name:'Check app releases',exact:true}).click();await expect(page.getByRole('heading',{name:'Latest listed release: 0.2.1'})).toBeVisible();assert.equal(await page.evaluate(()=>window.releaseInjected),undefined);await expect(page.getByText(notes,{exact:true})).toBeVisible();
  assert.equal(await page.evaluate(()=>Reflect.apply(window.neuroscape.openAppDownload,null,['file:///unapproved.exe'])),true);assert.deepEqual(await desktop.evaluate(()=>globalThis.releaseOpened),['https://releases.example.test/neuroscape','https://releases.example.test/neuroscape']);assert.equal(await page.evaluate(()=>window.neuroscape.openExternal('file:///unapproved.exe')),false);assert.equal((await desktop.windows()).length,1);assert.equal(page.url(),'neuroscape://app/index.html#/app');await page.screenshot({path:'.local/releases-available.png',fullPage:true});
  for(const failure of ['malformed','oversized','wrong-type','unavailable','redirect']){mode=failure;await page.getByRole('button',{name:'Check app releases',exact:true}).click();await expect(page.getByRole('alert')).toContainText(['unavailable','redirect'].includes(failure)?'could not be reached':'could not be validated');await expect(page.getByRole('button',{name:'Open download page',exact:true})).toHaveCount(0);assert.deepEqual(await page.evaluate(id=>window.neuroscape.readMatch(id),fixture.id),fixture.before);}
  assert.equal(redirectTargets,0);await page.screenshot({path:'.local/releases-unavailable.png',fullPage:true});
  mode='timeout';await page.getByRole('button',{name:'Check app releases',exact:true}).click();await expect.poll(async()=>{const result=await page.evaluate(()=>window.neuroscape.appReleaseInfo());return result.ok&&result.data.status;}).toBe('checking');assert.deepEqual(await page.evaluate(id=>window.neuroscape.readMatch(id),fixture.id),fixture.before);assert.deepEqual(await page.evaluate(()=>window.neuroscape.listDecks()),{ok:true,data:fixture.decks});await expect(page.getByRole('alert')).toContainText('could not be reached',{timeout:15000});
  mode='new';await page.getByRole('button',{name:'Check app releases',exact:true}).click();await expect(page.getByRole('heading',{name:'Latest listed release: 0.2.1'})).toBeVisible();assert.deepEqual(await page.evaluate(()=>window.neuroscape.catalogStatus()),beforeCatalog);assert.deepEqual(await page.evaluate(id=>window.neuroscape.readMatch(id),fixture.id),fixture.before);assert.equal(await desktop.evaluate(()=>process.pid),mainPid);assert.equal(await desktop.evaluate(({app})=>app.getVersion()),'0.2.0');assert.deepEqual(errors,[]);
  await writeFile('.local/app-release-ui.json',JSON.stringify({executablePath,profileDirectory:fixture.profileDirectory,installedVersion:'0.2.0',unconfigured:true,current:true,newRelease:true,malformed:true,oversized:true,wrongMime:true,unavailable:true,redirectRejected:true,timeout:true,retry:true,approvedExternalBrowserBoundary:true,noPrivilegedNavigation:true,notesArePlainText:true,matchAndCatalogUnchanged:true,mainProcessUnchanged:true,nonFixtureHttpHttpsDenied:true,pageErrors:errors},null,2));console.log('PASS: packaged separate app releases, unconfigured/current/new/error states, bounded timeout/retry, approved browser boundary and unchanged game/catalog.');
}catch(error){if(desktop){const page=(await desktop.windows())[0];if(page)await page.screenshot({path:'.local/releases-failure.png',timeout:5000}).catch(()=>{});}throw error;}
finally{try{await desktop?.close();}finally{server.closeAllConnections();await new Promise(done=>server.close(()=>done()));}}
