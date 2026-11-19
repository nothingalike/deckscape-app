import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from './contract';

const generation=process.argv.findLast(argument=>argument.startsWith('--neuroscape-generation='))?.slice('--neuroscape-generation='.length) ?? '';
const api: DesktopApi = {
  appReleaseInfo:()=>ipcRenderer.invoke('release:info'),
  checkAppRelease:()=>ipcRenderer.invoke('release:check'),
  openAppDownload:()=>ipcRenderer.invoke('release:openDownload'),
  profileGeneration: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(generation)?generation:null,
  openExternal: url => ipcRenderer.invoke('external:open', url),
  readProfile: () => ipcRenderer.invoke('profile:read'),
  exportProfileBackup: () => ipcRenderer.invoke('backup:export'),
  profileBackupStatus: () => ipcRenderer.invoke('backup:status'),
  restoreProfileBackup: () => ipcRenderer.invoke('backup:restore'),
  profileRestoreStatus: () => ipcRenderer.invoke('restore:status'),
  openRecoveryBackupFolder: () => ipcRenderer.invoke('backup:openRecovery'),
  renameDraft: (name, expectedRevision) => ipcRenderer.invoke('profile:rename', name, expectedRevision),
  catalogStatus: () => ipcRenderer.invoke('catalog:status'),
  listCards: query => ipcRenderer.invoke('catalog:list', query),
  syncCatalog: () => ipcRenderer.invoke('catalog:sync'),
  cancelCatalog: () => ipcRenderer.invoke('catalog:cancel'),
  createDeck: name => ipcRenderer.invoke('deck:create', name),
  listDecks: () => ipcRenderer.invoke('deck:list'),
  readDeck: id => ipcRenderer.invoke('deck:read', id),
  saveDeck: (deck, expectedRevision) => ipcRenderer.invoke('deck:save', deck, expectedRevision),
  deleteDeck: (id, expectedRevision) => ipcRenderer.invoke('deck:delete', id, expectedRevision),
  previewDeckImport: input => ipcRenderer.invoke('deck:previewImport', input),
  importDeck: input => ipcRenderer.invoke('deck:import', input),
  listStarterDecks: () => ipcRenderer.invoke('deck:starters'),
  importStarterDeck: key => ipcRenderer.invoke('deck:importStarter', key),
  saveDeckBackup: deck => ipcRenderer.invoke('deck:exportBackup', deck),
  copyDeckText: text => ipcRenderer.invoke('deck:copyText', text),
  saveDeckImage: (bytes, name) => ipcRenderer.invoke('deck:exportImage', bytes, name),
  soloOpponents: () => ipcRenderer.invoke('solo:opponents'),
  previewSolo: (deckId, opponentKey) => ipcRenderer.invoke('solo:preview', deckId, opponentKey),
  createSoloSetup: input => ipcRenderer.invoke('solo:createSetup', input),
  readSoloSetup: id => ipcRenderer.invoke('solo:readSetup', id),
  listSoloSetups: () => ipcRenderer.invoke('solo:listSetups'),
  readMatch: id => ipcRenderer.invoke('match:read', id),
  listUnfinishedMatches: cursor => ipcRenderer.invoke('match:list', cursor),
  submitSetup: (id, commandId, expectedRevision, action) => ipcRenderer.invoke('match:setup', id, commandId, expectedRevision, action),
  submitMatch: (id, commandId, command) => ipcRenderer.invoke('match:command', id, commandId, command),
  advanceMatchBot: id => ipcRenderer.invoke('match:bot', id),
  quoteProgram: (id, input) => ipcRenderer.invoke('match:programQuote', id, input),
  quoteActivation: (id, input) => ipcRenderer.invoke('match:activationQuote', id, input),
  onMatchRevision(listener) {
    const receive = (_event: Electron.IpcRendererEvent, notice: unknown) => {
      if (notice === null) listener(null);
      else if (notice && typeof notice === 'object' && 'id' in notice && 'revision' in notice
        && typeof notice.id === 'string' && Number.isSafeInteger(notice.revision) && typeof notice.revision === 'number' && notice.revision >= 0)
        listener({ id: notice.id, revision: notice.revision });
    };
    ipcRenderer.on('match:revision', receive);
    return () => { ipcRenderer.removeListener('match:revision', receive); };
  },
};
contextBridge.exposeInMainWorld('neuroscape', api);
