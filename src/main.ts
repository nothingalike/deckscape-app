import { app, BrowserWindow, dialog, ipcMain, protocol, utilityProcess, shell, session,net } from 'electron';
import { readFile, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import type { AppResult } from './contract';
import { registerDesktopExports } from './desktop-exports';
import { resolveProfileLocation } from './profile-location';
import {waitForProfileService} from './service-startup';
import {createAppReleases} from './app-releases';
import releaseSource from './data/app-releases.json';
import {scheduleLinuxRelaunch} from './linux-relaunch';

const applicationUrl = 'neuroscape://app/index.html';
protocol.registerSchemesAsPrivileged([
  { scheme: 'neuroscape', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);
const profileDirectory = process.env.NEUROSCAPE_PROFILE_DIR
  ? resolve(process.env.NEUROSCAPE_PROFILE_DIR) : join(app.getPath('userData'), 'profile');
app.setPath('userData', profileDirectory);
const ownsProfile = app.requestSingleInstanceLock();
let window: BrowserWindow | undefined;
let service: Electron.UtilityProcess | undefined;
let requestId = 0;
let quitting = false;
let dataDirectory = profileDirectory;
let restartScheduled = false;
const pending = new Map<number, { resolve: (result: AppResult<unknown>) => void; timer: ReturnType<typeof setTimeout> }>();
const unavailable: AppResult<unknown> = { ok: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'The local service is unavailable. Reopen the app to recover committed data.' } };
function externalUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && ['www.neuroscapetcg.com','static1.squarespace.com'].includes(url.hostname) ? url.href : null;
  } catch { return null; }
}

function request(input: unknown): Promise<AppResult<unknown>> {
  if (!service?.pid) return Promise.resolve(unavailable);
  const id = ++requestId;
  return new Promise(resolveResult => {
    const timer = setTimeout(() => { pending.delete(id); resolveResult(unavailable); }, 15_000);
    pending.set(id, { resolve: resolveResult, timer });
    service!.postMessage({ id, request: input });
  });
}

async function start() {
  await app.whenReady();
  const files = new Map<string, readonly [string, string]>([
    ['/index.html', ['index.html', 'text/html']],
    ['/renderer.js', ['renderer.js', 'text/javascript']],
    ['/renderer.css', ['renderer.css', 'text/css']],
    ['/theme.css', ['theme.css', 'text/css']],
    ...['obsidian-material-v1.webp', ...['rook','revenant','pawn','drone','dreamwalker','butterfly','bishop'].map(name => 'tokens/' + name + '-v1.webp')]
      .map(name => ['/simulator/' + name, ['simulator/' + name, 'image/webp']] as const),
  ]);
  protocol.handle('neuroscape', async incoming => {
    const url = new URL(incoming.url);
    const file = url.host === 'app' ? files.get(url.pathname) : url.host === 'simulator' ? files.get('/simulator' + url.pathname) : undefined;
    const artName = url.host === 'art' ? /^\/(?:[a-f0-9-]{36}\/)?([a-f0-9]{64}\.(?:png|jpg|webp))$/.exec(url.pathname)?.[1] : null;
    const artwork = artName ? join(dataDirectory, 'artwork', artName) : null;
    if (incoming.method !== 'GET' || (!artwork && !file) || url.search) {
      return new Response('Not found', { status: 404 });
    }
    try {
      const bytes = await readFile(artwork ?? join(__dirname, 'renderer', file![0]));
      const mime = artwork ? (artwork.endsWith('.png') ? 'image/png' : artwork.endsWith('.jpg') ? 'image/jpeg' : 'image/webp') : file![1];
      return new Response(new Uint8Array(bytes), { headers: {
        'Content-Type': mime, 'X-Content-Type-Options': 'nosniff',
        'Access-Control-Allow-Origin': 'neuroscape://app',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' neuroscape://art neuroscape://simulator data: blob:; connect-src 'self' neuroscape://art neuroscape://simulator; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-src 'none'",
      } });
    } catch { return new Response('Not found', { status: 404 }); }
  });
  service = utilityProcess.fork(join(__dirname, 'service.cjs'), [profileDirectory], { serviceName: 'Neuroscape local data', stdio: 'pipe', session: session.defaultSession });
  service.stderr?.on('data', bytes => process.stderr.write(bytes));
  const ready = waitForProfileService(service);
    service!.on('message', message => {
      if(message?.type==='profile-restart'&&!restartScheduled){
        restartScheduled=true;
        const args=[...process.argv.slice(1).filter(arg=>arg!=='--show-backups'),'--show-backups'];
        void (async()=>{
          if(process.platform==='linux'&&app.isPackaged&&process.env.APPIMAGE)await scheduleLinuxRelaunch(process.env.APPIMAGE,args,process.pid);
          else app.relaunch({args});
          app.quit();
        })().catch(()=>{dialog.showErrorBox('Finish restoring your profile','Your restored profile is ready. Reopen Neuroscape Local to finish.');app.quit();});
        return;
      }
      if (message?.type === 'match-revision' && typeof message.id === 'string' && Number.isSafeInteger(message.revision) && message.revision >= 0) {
        if (window && !window.isDestroyed()) window.webContents.send('match:revision', { id: message.id, revision: message.revision });
        return;
      }
      const handler = pending.get(message?.id);
      if (handler) { clearTimeout(handler.timer); pending.delete(message.id); handler.resolve(message.result); }
    });
    service!.on('exit', () => {
      if (window && !window.isDestroyed()) window.webContents.send('match:revision', null);
      for (const handler of pending.values()) { clearTimeout(handler.timer); handler.resolve(unavailable); }
      pending.clear();
    });
  await ready;
  const location = resolveProfileLocation(profileDirectory);
  dataDirectory = location.directory;
  window = new BrowserWindow({ width: 1280, height: 860, minWidth: 740, minHeight: 600, backgroundColor: '#080b12',
    title: 'Neuroscape Local', show: false, webPreferences: {
      preload: join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false,
      additionalArguments: ['--neuroscape-generation='+(location.generation??'legacy')],
    } });
  const trusted = (event: Electron.IpcMainInvokeEvent) => event.senderFrame === window?.webContents.mainFrame && event.senderFrame?.url.split('#')[0] === applicationUrl;
  registerDesktopExports(window, trusted);
  const releases=createAppReleases({installedVersion:app.getVersion(),source:releaseSource,fixtureOrigin:process.env.NEUROSCAPE_RELEASE_FIXTURE_ORIGIN,fetcher:(url,init)=>net.fetch(url,init),opener:url=>shell.openExternal(url)});
  ipcMain.handle('release:info',event=>trusted(event)?{ok:true,data:releases.info()}:unavailable);
  ipcMain.handle('release:check',async event=>trusted(event)?{ok:true,data:await releases.check()}:unavailable);
  ipcMain.handle('release:openDownload',event=>trusted(event)?releases.openDownload():false);
  ipcMain.handle('backup:status', event => trusted(event) ? request({ type: 'backup.status' }) : unavailable);
  ipcMain.handle('restore:status', event => trusted(event) ? request({ type: 'restore.status' }) : unavailable);
  ipcMain.handle('backup:restore', async event => {
    if(!trusted(event))return unavailable;
    try{
      const selected=await dialog.showOpenDialog(window!,{title:'Restore profile backup',filters:[{name:'Neuroscape profile backup',extensions:['zip']}],properties:['openFile']});
      if(selected.canceled||selected.filePaths.length!==1)return {ok:true,data:{started:false}};
      const confirmed=await dialog.showMessageBox(window!,{type:'warning',title:'Restore profile',message:'Replace the current profile and restart?',detail:'The backup is validated first. A recovery copy of the current profile is saved before replacement.',buttons:['Restore and restart','Cancel'],defaultId:1,cancelId:1,noLink:true});
      if(confirmed.response!==0)return {ok:true,data:{started:false}};
      return request({type:'backup.restore',source:selected.filePaths[0]});
    }catch{return {ok:false,error:{code:'RESTORE_DIALOG_FAILED',message:'The restore file could not be selected. Your profile is unchanged. Retry the file dialog.'}};}
  });
  ipcMain.handle('backup:openRecovery',async event=>{
    if(!trusted(event))return false;
    try{const path=join(profileDirectory,'recovery-backups'),info=await lstat(path);if(!info.isDirectory()||info.isSymbolicLink())return false;return await shell.openPath(path)==='';}catch{return false;}
  });
  ipcMain.handle('backup:export', async event => {
    if (!trusted(event)) return unavailable;
    try {
      const selected = await dialog.showSaveDialog(window!, { title: 'Back up profile',
        defaultPath: 'neuroscape-profile-' + new Date().toISOString().slice(0, 10) + '.zip',
        filters: [{ name: 'Neuroscape profile backup', extensions: ['zip'] }], properties: ['showOverwriteConfirmation'] });
      if (selected.canceled || !selected.filePath) return { ok: true, data: { started: false } };
      return request({ type: 'backup.export', destination: selected.filePath });
    } catch { return { ok: false, error: { code: 'BACKUP_DIALOG_FAILED', message: 'The backup destination could not be selected. Your profile is unchanged. Retry the save dialog.' } }; }
  });
  ipcMain.handle('profile:read', event => trusted(event) ? request({ type: 'profile.read' }) : unavailable);
  ipcMain.handle('profile:rename', (event, name: unknown, expectedRevision: unknown) => trusted(event)
    ? request({ type: 'profile.rename', name, expectedRevision }) : unavailable);
  ipcMain.handle('catalog:status', event => trusted(event) ? request({ type: 'catalog.status' }) : unavailable);
  ipcMain.handle('catalog:list', (event, query: unknown) => trusted(event) ? request({ type: 'catalog.list', query }) : unavailable);
  ipcMain.handle('catalog:sync', event => trusted(event) ? request({ type: 'catalog.sync' }) : unavailable);
  ipcMain.handle('catalog:cancel', event => trusted(event) ? request({ type: 'catalog.cancel' }) : unavailable);
  ipcMain.handle('solo:opponents', event => trusted(event) ? request({ type: 'solo.opponents' }) : unavailable);
  ipcMain.handle('solo:preview', (event, deckId: unknown, opponentKey: unknown) => trusted(event) ? request({ type: 'solo.preview', deckId, opponentKey }) : unavailable);
  ipcMain.handle('solo:createSetup', (event, input: unknown) => trusted(event) && input && typeof input === 'object'
    ? request({ ...input, type: 'solo.createSetup' }) : unavailable);
  ipcMain.handle('solo:readSetup', (event, id: unknown) => trusted(event) ? request({ type: 'solo.readSetup', id }) : unavailable);
  ipcMain.handle('solo:listSetups', event => trusted(event) ? request({ type: 'solo.listSetups' }) : unavailable);
  ipcMain.handle('match:read', (event, id: unknown) => trusted(event) ? request({ type: 'match.read', id }) : unavailable);
  ipcMain.handle('match:list', (event, cursor: unknown) => trusted(event) ? request({ type: 'match.list', cursor }) : unavailable);
  ipcMain.handle('match:setup', (event, id: unknown, commandId: unknown, expectedRevision: unknown, action: unknown) => trusted(event)
    ? request({ type: 'match.setup', id, commandId, expectedRevision, action }) : unavailable);
  ipcMain.handle('match:command', (event, id: unknown, commandId: unknown, command: unknown) => trusted(event)
    ? request({ type: 'match.command', id, commandId, command }) : unavailable);
  ipcMain.handle('match:bot', (event, id: unknown) => trusted(event) ? request({ type: 'match.bot', id }) : unavailable);
  ipcMain.handle('match:programQuote', (event, id: unknown, input: unknown) => trusted(event) ? request({ type: 'match.programQuote', id, input }) : unavailable);
  ipcMain.handle('match:activationQuote', (event, id: unknown, input: unknown) => trusted(event) ? request({ type: 'match.activationQuote', id, input }) : unavailable);
    ipcMain.handle('deck:create', (event, name: unknown) => trusted(event) ? request({ type: 'deck.create', name }) : unavailable);
    ipcMain.handle('deck:list', event => trusted(event) ? request({ type: 'deck.list' }) : unavailable);
    ipcMain.handle('deck:read', (event, id: unknown) => trusted(event) ? request({ type: 'deck.read', id }) : unavailable);
    ipcMain.handle('deck:save', (event, deck: unknown, expectedRevision: unknown) => trusted(event) ? request({ type: 'deck.save', deck, expectedRevision }) : unavailable);
    ipcMain.handle('deck:delete', (event, id: unknown, expectedRevision: unknown) => trusted(event) ? request({ type: 'deck.delete', id, expectedRevision }) : unavailable);
    ipcMain.handle('deck:previewImport', (event, input: unknown) => trusted(event) ? request({ type: 'deck.previewImport', input }) : unavailable);
    ipcMain.handle('deck:import', (event, input: unknown) => trusted(event) ? request({ type: 'deck.import', input }) : unavailable);
    ipcMain.handle('deck:starters', event => trusted(event) ? request({ type: 'deck.starters' }) : unavailable);
    ipcMain.handle('deck:importStarter', (event, key: unknown) => trusted(event) ? request({ type: 'deck.importStarter', key }) : unavailable);
  ipcMain.handle('external:open', async (event, value: unknown) => {
    const url = trusted(event) && externalUrl(value);
    if (!url) return false;
    await shell.openExternal(url); return true;
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    const approved = externalUrl(url); if (approved) void shell.openExternal(approved);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', event => {
    if (event.url.split('#')[0] !== applicationUrl) event.preventDefault();
  });
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  const showLoadedWindow=()=>{if(window&&!window.isDestroyed()&&!window.isVisible())window.show();};
  window.once('ready-to-show', showLoadedWindow);
  await window.loadURL(applicationUrl+(process.argv.includes('--show-backups')?'#/backups':''));
  // On Wayland, the loaded page can stay hidden when relying only on ready-to-show.
  // Document readiness is a safe visibility fallback; the guard preserves a single activation.
  showLoadedWindow();
}

app.on('second-instance', () => { window?.restore(); window?.show(); window?.focus(); });
app.on('window-all-closed', () => app.quit());
// will-quit runs after every window has accepted closing. A dirty editor can
// veto beforeunload and keep its persistence service available for retry.
app.on('will-quit', event => {
  if (quitting || !service?.pid) return;
  event.preventDefault();
  quitting = true;
  service.once('exit', () => app.quit());
  service.postMessage({ type: 'shutdown' });
});
if (ownsProfile) {
  start().catch(error => {
    console.error(error);
    dialog.showErrorBox('Neuroscape could not start', error instanceof Error?error.message:'The local profile could not be opened. Existing data has been preserved.');
    app.quit();
  });
} else { app.quit(); }
