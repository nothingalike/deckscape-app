import {launchDesktop} from './desktop-launch.mjs';
import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, access, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';

const executablePath = resolve(process.env.NEUROSCAPE_EXE ?? 'release/win-unpacked/Neuroscape Local.exe');
await access(executablePath);
const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-desktop-'));
const env = { ...process.env, NEUROSCAPE_PROFILE_DIR: profileDirectory };
delete env.ELECTRON_RUN_AS_NODE;
await mkdir('.local', { recursive: true });
const started = performance.now();
let desktop;
const errors = [];
async function directorySize(directory) {
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    bytes += entry.isDirectory() ? await directorySize(path) : (await stat(path)).size;
  }
  return bytes;
}
try {
  desktop = await launchDesktop({ executablePath, env });
  let page = await desktop.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') console.error('Renderer:', message.text()); });
  await expect.poll(()=>desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),{timeout:10000,message:'The loaded desktop window must become visible'}).toBe(true);
  await page.getByRole('link', { name: 'My decks', exact: true }).click();
  await page.getByRole('button', { name: 'New deck', exact: true }).waitFor();
  const coldStartupMs = performance.now() - started;
  await page.getByRole('button', { name: 'New deck', exact: true }).click();
  // Wait for the editor textbox; the outgoing deck-list sort also contains "Deck name".
  await page.getByRole('textbox', { name: 'Deck name', exact: true }).fill('Corpo offline proof');
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this device only' })).toBeVisible();
  const secondExit = await new Promise((resolveExit, rejectExit) => {
    const second = spawn(executablePath, [], { env, windowsHide: true });
    const timer = setTimeout(() => { second.kill(); rejectExit(new Error('Second instance did not yield profile ownership')); }, 10_000);
    second.on('error', error => { clearTimeout(timer); rejectExit(error); });
    second.on('exit', code => { clearTimeout(timer); resolveExit(code); });
  });
  assert.equal(secondExit, 0);
  const preferences = await desktop.evaluate(({ BrowserWindow }) => {
    const prefs = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { sandbox: prefs.sandbox, contextIsolation: prefs.contextIsolation, nodeIntegration: prefs.nodeIntegration };
  });
  assert.deepEqual(preferences, { sandbox: true, contextIsolation: true, nodeIntegration: false });
  assert.equal(await desktop.evaluate(({app})=>app.commandLine.hasSwitch('no-sandbox')),false);
  const denied = await page.evaluate(async () => {
    const response = await fetch('neuroscape://app/forbidden/profile.sqlite');
    return { status: response.status, hasNode: typeof window.require !== 'undefined', keys: Object.keys(window.neuroscape) };
  });
  assert.equal(denied.status, 404);
  assert.equal(denied.hasNode, false);
  assert.deepEqual(denied.keys.sort(), ['advanceMatchBot', 'appReleaseInfo', 'cancelCatalog', 'catalogStatus', 'checkAppRelease', 'copyDeckText', 'createDeck', 'createSoloSetup', 'deleteDeck', 'exportProfileBackup', 'importDeck', 'importStarterDeck', 'listCards', 'listDecks', 'listSoloSetups', 'listStarterDecks', 'listUnfinishedMatches', 'onMatchRevision', 'openAppDownload', 'openExternal', 'openRecoveryBackupFolder', 'previewDeckImport', 'previewSolo', 'profileBackupStatus', 'profileGeneration', 'profileRestoreStatus', 'quoteActivation', 'quoteProgram', 'readDeck', 'readMatch', 'readProfile', 'readSoloSetup', 'renameDraft', 'restoreProfileBackup', 'saveDeck', 'saveDeckBackup', 'saveDeckImage', 'soloOpponents', 'submitMatch', 'submitSetup', 'syncCatalog']);
  const invalid = await page.evaluate(() => window.neuroscape.renameDraft('', -1));
  assert.equal(invalid.ok, false);
  await page.screenshot({ path: '.local/desktop-proof.png' });
  const metrics = await desktop.evaluate(({ app }) => ({
    platform:process.platform,architecture:process.arch,kernelVersion:process.getBuiltinModule('os').release(),systemVersion:process.getSystemVersion(),runningUnderARM64Translation:['darwin','win32'].includes(process.platform)?app.runningUnderARM64Translation:null,
    display:app.commandLine.getSwitchValue('ozone-platform')||'native default',
    appDataRoot:app.getPath('appData'),profileDirectory:app.getPath('userData'),
    versions: process.versions,
    processes: app.getAppMetrics().map(p => ({ pid:p.pid,type: p.type, workingSetKb: p.memory.workingSetSize })),
  }));
  if(process.platform==='linux'){
    const renderers=metrics.processes.filter(p=>p.type==='Tab');assert.ok(renderers.length);
    metrics.rendererSandbox=await Promise.all(renderers.map(async p=>{const status=await readFile('/proc/'+p.pid+'/status','utf8'),seccomp=Number(status.match(/^Seccomp:\s+(\d+)/m)?.[1]);assert.equal(seccomp,2);return {pid:p.pid,seccomp};}));
  }
  await desktop.close();
  desktop = await launchDesktop({ executablePath, env });
  page = await desktop.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('link', { name: 'My decks', exact: true }).click();
  await page.getByRole('link').filter({ hasText: 'Corpo offline proof' }).click();
  await page.getByRole('textbox', { name: 'Deck name', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('input')?.value === 'Corpo offline proof');
  assert.equal((await readFile(join(profileDirectory, 'profile.sqlite'))).subarray(0, 15).toString(), 'SQLite format 3');
  assert.deepEqual(errors, []);
  const packageInfo = JSON.parse(await readFile('package.json', 'utf8'));
  const runtimeExecutable=await desktop.evaluate(()=>process.execPath);
  const installerPath = process.env.NEUROSCAPE_INSTALLER??(executablePath.endsWith('.AppImage')?executablePath:resolve('release', `Neuroscape Local Setup ${packageInfo.version}.exe`));
  const artifactDirectory=process.platform==='darwin'?resolve(runtimeExecutable,'../../..'):resolve(runtimeExecutable,'..');
  const artifact = { executablePath,runtimeExecutable,artifactDirectory, version: packageInfo.version,
    installedDirectoryBytes: await directorySize(artifactDirectory),
    installerBytes: await stat(installerPath).then(info => info.size, () => null) };
  await writeFile('.local/desktop-proof.json', JSON.stringify({ artifact, coldStartupMs, ...metrics, preferences, denied, reopened: true, secondInstanceYielded: true }, null, 2));
  console.log('PASS: packaged app, isolated preload, SQLite deck persistence and reopen.');
  console.log(JSON.stringify({ coldStartupMs, versions: metrics.versions, processes: metrics.processes }));
} catch (error) {
  console.error(error);
  const page = desktop && (await desktop.windows())[0];
  if (page) { await page.screenshot({ path: '.local/desktop-failure.png',timeout:5000 }).catch(()=>{}); console.error(await page.locator('body').innerText({timeout:5000}).catch(()=>'')); }
  throw error;
} finally {
  await desktop?.close();
}
