import {chromium,expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {desktopArguments} from './desktop-launch.mjs';

const delay=ms=>new Promise(done=>setTimeout(done,ms));
async function freePort(){const server=createServer();await new Promise(done=>server.listen(0,'127.0.0.1',done));const port=server.address().port;await new Promise(done=>server.close(done));return port;}
async function endpoint(port,path,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){try{const response=await fetch('http://127.0.0.1:'+port+path,{signal:AbortSignal.timeout(500)});if(response.ok)return await response.json();}catch{}await delay(100);}throw new Error('Owned debug endpoint did not open.');}
async function inspector(port,timeout=30000){
  const targets=await endpoint(port,'/json/list',timeout),socket=new WebSocket(targets[0].webSocketDebuggerUrl);await new Promise((done,reject)=>{socket.addEventListener('open',done,{once:true});socket.addEventListener('error',reject,{once:true});});let id=0;const pending=new Map();
  socket.addEventListener('message',({data})=>{const message=JSON.parse(String(data)),entry=pending.get(message.id);if(entry){pending.delete(message.id);clearTimeout(entry.timer);message.error||message.result?.exceptionDetails?entry.reject(new Error(JSON.stringify(message))):entry.resolve(message.result.result.value);}});
  socket.addEventListener('close',()=>{for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(new Error('Owned inspector closed.'));}pending.clear();});
  return {close:()=>socket.close(),evaluate(expression){const key=++id;return new Promise((done,reject)=>{const timer=setTimeout(()=>{pending.delete(key);reject(new Error('Owned inspector request timed out.'));},10000);pending.set(key,{resolve:done,reject,timer});socket.send(JSON.stringify({id:key,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));});}};
}
const electron="process.getBuiltinModule('module').createRequire(process.resourcesPath+'/app.asar/package.json')('electron')";
async function firstPage(browser){const context=browser.contexts()[0];return context.pages()[0]??await context.waitForEvent('page',{timeout:30000});}
async function main(){
  const fixture=JSON.parse(await readFile('.local/restore-ui-profile.json','utf8')),executablePath=resolve(process.env.NEUROSCAPE_EXE??'release/win-unpacked/Neuroscape Local.exe');
  const nodePort=await freePort(),browserPort=await freePort(),run=randomUUID(),env={...process.env,NEUROSCAPE_PROFILE_DIR:fixture.profileDirectory,NEUROSCAPE_VERIFICATION_RUN:run};delete env.ELECTRON_RUN_AS_NODE;
  const appImage=process.platform==='linux'&&executablePath.endsWith('.AppImage');
  const nextNodePort=appImage?await freePort():nodePort,nextBrowserPort=appImage?await freePort():browserPort;
  const child=spawn(executablePath,desktopArguments(['--inspect=127.0.0.1:'+nodePort,'--remote-debugging-address=127.0.0.1','--remote-debugging-port='+browserPort],env),{env,windowsHide:true,stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',data=>{stderr=(stderr+data).slice(-8000);});child.on('error',error=>{stderr+=String(error);});
  const exited=new Promise(done=>child.once('exit',done));let browser,control;
  async function ownedInspector(timeout=30000,port=nodePort){const connection=await inspector(port,timeout);try{let identity;const until=Date.now()+timeout;do{identity=await connection.evaluate('({pid:process.pid,executable:process.execPath,appImage:process.env.APPIMAGE,resources:process.resourcesPath,profile:process.env.NEUROSCAPE_PROFILE_DIR,run:process.env.NEUROSCAPE_VERIFICATION_RUN})');assert.equal(identity.run,run);assert.equal(identity.profile,fixture.profileDirectory);if(Number.isSafeInteger(identity.pid)&&typeof identity.executable==='string'&&typeof identity.resources==='string')break;await delay(100);}while(Date.now()<until);assert.ok(Number.isSafeInteger(identity.pid));if(appImage){assert.equal(resolve(identity.appImage),executablePath);assert.equal(basename(identity.executable),'neuroscape-app');assert.equal(resolve(identity.resources),resolve(dirname(identity.executable),'resources'));}else assert.equal(resolve(identity.executable),executablePath);assert.equal(resolve(identity.profile),resolve(fixture.profileDirectory));return {connection,pid:identity.pid};}catch(error){connection.close();throw error;}}
  try{
    const previous=await ownedInspector();control=previous.connection;const previousPid=previous.pid;if(!(process.platform==='linux'&&executablePath.endsWith('.AppImage')))assert.equal(previousPid,child.pid);
    await control.evaluate(`(()=>{const e=${electron};e.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[${JSON.stringify(fixture.sourceArchive)}]});e.dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});return true;})()`);
    if(appImage)await control.evaluate(`(()=>{const cp=process.getBuiltinModule('child_process'),spawn=cp.spawn;cp.spawn=(file,args,options)=>spawn(file,file==='/bin/sh'&&args[2]==='neuroscape-restart'?args.map(arg=>arg.startsWith('--inspect=')?'--inspect=127.0.0.1:${nextNodePort}':arg.startsWith('--remote-debugging-port=')?'--remote-debugging-port=${nextBrowserPort}':arg):args,options);return true;})()`);
    browser=await chromium.connectOverCDP((await endpoint(browserPort,'/json/version')).webSocketDebuggerUrl);let page=await firstPage(browser);await page.getByRole('link',{name:'Backups',exact:true}).click();
    control.close();control=undefined;
    await page.getByRole('region',{name:'Restore profile',exact:true}).getByRole('button',{name:'Choose backup to restore',exact:true}).click();
    await Promise.race([exited,delay(30000).then(()=>{throw new Error('Old app did not exit for native relaunch.');})]);browser=undefined;
    const next=await ownedInspector(30000,nextNodePort);control=next.connection;const nextPid=next.pid;assert.notEqual(nextPid,previousPid);
    browser=await chromium.connectOverCDP((await endpoint(nextBrowserPort,'/json/version')).webSocketDebuggerUrl);page=await firstPage(browser);
    await expect(page.getByRole('region',{name:'Restore profile',exact:true}).getByRole('status')).toContainText('Profile restored.');
    const generation=await page.evaluate(()=>window.neuroscape.profileGeneration);assert.ok(generation);assert.deepEqual(await page.evaluate(id=>window.neuroscape.readMatch(id),fixture.id),fixture.before);
    const security=await control.evaluate(`(()=>{const e=${electron},preferences=e.BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();return {sandbox:preferences.sandbox,contextIsolation:preferences.contextIsolation,nodeIntegration:preferences.nodeIntegration,noSandbox:e.app.commandLine.hasSwitch('no-sandbox')};})()`);assert.deepEqual(security,{sandbox:true,contextIsolation:true,nodeIntegration:false,noSandbox:false});
    await writeFile('.local/profile-native-relaunch.json',JSON.stringify({executablePath,profileDirectory:fixture.profileDirectory,previousPid,nextPid,generation,nativeRelaunch:true,restoredMatchUnchanged:true,nativeDialogsControlled:true,freshAppImageDebugPorts:appImage,security},null,2));
    console.log('PASS: the actual OS relaunch opened a different main process, the restored generation and the unchanged original match.');
  }catch(error){console.error(stderr);throw error;}
  finally{
    // The spawn handle covers startup failure before inspector discovery. Relaunched endpoints
    // are authenticated by executable, profile and a unique inherited run token before control.
    if(!control)for(const port of new Set([nextNodePort,nodePort]))try{control=(await ownedInspector(1500,port)).connection;break;}catch{}
    if(control){await control.evaluate(`(()=>{const e=${electron};e.BrowserWindow.getAllWindows().forEach(w=>w.destroy());e.app.quit();return true;})()`).catch(()=>{});control.close();}
    if(child.exitCode===null&&child.signalCode===null)child.kill();
    await browser?.close().catch(()=>{});
  }
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
