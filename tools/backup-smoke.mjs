import {launchDesktop} from './desktop-launch.mjs';
import {expect} from '@playwright/test';
import {readFile,writeFile,mkdtemp,mkdir,readdir,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {openPromise} from 'yauzl';
import assert from 'node:assert/strict';
const fixture=JSON.parse(await readFile('.local/backup-ui-profile.json','utf8')),development=process.argv.includes('--development');
const executablePath=resolve(development?'node_modules/electron/dist/electron.exe':process.env.NEUROSCAPE_EXE??'release/win-unpacked/Neuroscape Local.exe');
const env={...process.env,NEUROSCAPE_PROFILE_DIR:fixture.profileDirectory};delete env.ELECTRON_RUN_AS_NODE;delete env.NEUROSCAPE_CATALOG_FIXTURE_ORIGIN;
const outputDirectory=await mkdtemp(join(tmpdir(),'neuroscape-backup-ui-')),blocked=join(outputDirectory,'existing-directory'),destination=join(outputDirectory,'complete-profile.zip');await mkdir(blocked);
let desktop;const errors=[];
try{
  desktop=await launchDesktop({executablePath,args:development?['.']:[],env});
  assert.equal(await desktop.evaluate(async({session,net})=>{session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true}));try{await net.fetch('https://www.neuroscapetcg.com/',{cache:'no-store'});return false;}catch{return true;}}),true);
  const page=await desktop.firstWindow();page.on('pageerror',error=>errors.push(error.message));
  const origin=await desktop.evaluate(({app})=>({platform:process.platform,architecture:process.arch,systemVersion:process.getSystemVersion(),runningUnderARM64Translation:['darwin','win32'].includes(process.platform)?app.runningUnderARM64Translation:null}));
  await page.getByRole('link',{name:'Backups',exact:true}).click();await expect(page.getByRole('heading',{name:'Profile backups',exact:true})).toBeVisible();
  await desktop.evaluate(({dialog})=>{dialog.showSaveDialog=async()=>({canceled:true});});
  await page.getByRole('button',{name:'Save complete backup',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Backup canceled.'})).toBeVisible();
  assert.deepEqual(await readdir(outputDirectory),['existing-directory']);
  await desktop.evaluate(({dialog},path)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:path});},blocked);
  await page.getByRole('button',{name:'Save complete backup',exact:true}).click();await expect(page.getByRole('alert')).toContainText('folder access',{timeout:60000});
  assert.deepEqual(await page.evaluate(id=>window.neuroscape.readMatch(id),fixture.id),fixture.before);
  assert.deepEqual(await readdir(outputDirectory),['existing-directory']);await page.screenshot({path:'.local/backup-failed.png'});
  await desktop.evaluate(({dialog},path)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:path});},destination);
  await page.getByRole('button',{name:'Save complete backup',exact:true}).click();await expect(page.getByRole('button',{name:'Creating backup…',exact:true})).toBeDisabled();
  await expect(page.getByRole('status').filter({hasText:'Complete profile backup saved.'})).toBeVisible({timeout:60000});
  await page.screenshot({path:'.local/backup-complete.png'});
  assert.deepEqual(await page.evaluate(id=>window.neuroscape.readMatch(id),fixture.id),fixture.before);
  const archive=await openPromise(destination,{lazyEntries:true,strictFileNames:true}),files=new Map();let manifest;
  try{for await(const entry of archive.eachEntry()){
    const stream=await archive.openReadStreamPromise(entry),hash=createHash('sha256'),chunks=[];let size=0;
    for await(const bytes of stream){hash.update(bytes);size+=bytes.length;if(entry.fileName==='manifest.json')chunks.push(bytes);}
    if(entry.fileName==='manifest.json')manifest=JSON.parse(Buffer.concat(chunks).toString());else files.set(entry.fileName,{size,sha256:hash.digest('hex')});
  }}finally{archive.close();}
  assert.equal(manifest.format,'neuroscape-profile');assert.equal(manifest.version,1);assert.ok(manifest.matches.some(match=>match.id===fixture.id));
  for(const file of manifest.files)assert.deepEqual(files.get(file.path),{size:file.size,sha256:file.sha256},file.path);assert.equal(files.size,manifest.files.length);
  assert.ok([...files.keys()].every(path=>path==='profile.sqlite'||/^artwork\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(path)));
  const shutdownDestination=join(outputDirectory,'quit-drained.zip');
  await desktop.evaluate(({dialog},path)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:path});},shutdownDestination);
  await page.getByRole('button',{name:'Save complete backup',exact:true}).click();
  await expect(page.getByRole('button',{name:'Creating backup…',exact:true})).toBeDisabled();
  await desktop.close();desktop=undefined;await access(shutdownDestination);
  const drained=await openPromise(shutdownDestination,{lazyEntries:true,strictFileNames:true});let count=0;try{for await(const entry of drained.eachEntry())count++;}finally{drained.close();}assert.equal(count,files.size+1);
  assert.deepEqual(errors,[]);
  await writeFile('.local/profile-backup-ui.json',JSON.stringify({development,executablePath,origin,profileDirectory:fixture.profileDirectory,destination,nativeSaveSelectionBoundary:true,cancelPreservesDestination:true,failedWritePreservesProfile:true,retryCreatesCompleteArchive:true,normalQuitDrainedBackup:true,matchUnchanged:true,archiveFiles:files.size,artworkFiles:files.size-1,manifest,pageErrors:errors},null,2));
  console.log('PASS: native backup selection/cancel, failed promotion/retry, unchanged real match and complete hashed SQLite/artwork archive offline.');
}catch(error){console.error(error);if(desktop){const page=(await desktop.windows())[0];if(page)await page.screenshot({path:'.local/backup-failure.png',timeout:5000}).catch(()=>{});}throw error;}
finally{if(desktop){await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(window=>window.destroy())).catch(()=>{});await desktop.close();}}
