import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AppResult, Profile, CatalogStatus, CatalogView, CatalogQuery, Deck, DeckImportInput, DeckImportPreview, StarterDeck, SoloOpponent, SoloPreview, SoloSelection, SoloSetup } from './contract';
import { createSolo } from './solo';
import type { SoloContent } from './solo-content';
import { createLocalMatches } from './local-matches';
import { createProfileBackups } from './profile-backup';
import { resolveProfileLocation, finishProfileActivation, rollbackProfileActivation,writeProfileRelease } from './profile-location';
import packageInfo from '../package.json';
import { initializeProfileDatabase } from './profile-database';
import { createProfileRestores } from './profile-restore';
import type { LocalMatchView, BotAdvance, MatchRevision, BackupStatus, RestoreStatus } from './contract';
import type { SetupCommand } from './deckscape/lib/simulator/setup';
import type { CommandDelivery } from './deckscape/lib/simulator/match-client-session';
import type { GameCommand } from './deckscape/lib/simulator/commands';
import type { ProgramQuoteRequest, ProgramQuote } from './deckscape/lib/simulator/program-quote-contract';
import type { ActivationQuoteRequest, ActivationQuote } from './deckscape/lib/simulator/activation-quote-contract';
import type { MatchDirectoryCursor, UnfinishedMatchPage } from './deckscape/lib/simulator/match-directory';
import { createDecks } from './decks';
import { catalogQuery, createCatalog, officialCatalogSource, type CatalogSource, type CatalogFileSystem } from './catalog';

export type ApplicationOptions={
  profileDirectory: string; catalogSource?: CatalogSource; catalogFileSystem?: CatalogFileSystem; soloContent?: SoloContent; matchSeed?: string;
};
export function openApplication(options:ApplicationOptions):ReturnType<typeof openDataApplication>{
  mkdirSync(options.profileDirectory,{recursive:true});const location=resolveProfileLocation(options.profileDirectory);
  let application:ReturnType<typeof openDataApplication>|undefined;
  try{application=openDataApplication({...options,profileRoot:options.profileDirectory,profileDirectory:location.directory});writeProfileRelease(location.directory,packageInfo.version);finishProfileActivation(options.profileDirectory,location);return application;}
  catch(error){if(application)void application.close();if(location.activation?.selected==='next'){rollbackProfileActivation(options.profileDirectory,location);if(location.activation.journal.purpose==='upgrade')throw error;return openApplication(options);}throw error;}
}
function openDataApplication({ profileDirectory, profileRoot, catalogSource, catalogFileSystem, soloContent, matchSeed }: ApplicationOptions & {profileRoot:string}) {
  mkdirSync(profileDirectory, { recursive: true });
  const db = new DatabaseSync(join(profileDirectory, 'profile.sqlite'));
  try {
  initializeProfileDatabase(db);
  const catalog = createCatalog(db, profileDirectory, catalogSource ?? officialCatalogSource(), catalogFileSystem);
  const decks = createDecks(db, catalog.allCards);
  const solo = createSolo(db, profileDirectory, catalog.allCards, soloContent, matchSeed);
  const matchListeners = new Set<(notice: MatchRevision) => void>();
  const matches = createLocalMatches(db, soloContent, notice => {
    for (const listener of matchListeners) { try { listener(notice); } catch { /* A view listener cannot undo a committed command. */ } }
  });
  const backups = createProfileBackups(db, profileDirectory, {profileRoot});
  const restartListeners=new Set<()=>void>();let storageClosing:Promise<void>|null=null;
  function closeStorage(){return storageClosing??=(async()=>{await matches.close();await catalog.close();await backups.close();if(db.isOpen)db.close();})();}
  const restores=createProfileRestores(profileRoot,{drain:async()=>{await matches.close();await catalog.close();await backups.close();},createRecoveryBackup:backups.createRecoveryBackup,closeStorage,
    restartRequired:()=>{for(const listener of restartListeners)try{listener();}catch{/* A restart observer cannot change committed activation. */}}},soloContent);

  function read(): Profile {
    const row = db.prepare('SELECT draft_name, revision FROM profile WHERE id=1').get();
    if (typeof row?.draft_name !== 'string' || typeof row.revision !== 'number') {
      throw new Error('Invalid profile');
    }
    return { draftName: row.draft_name, revision: row.revision };
  }

  function execute(input: { type: 'profile.read' }): Promise<AppResult>;
  function execute(input: { type: 'backup.status' }): Promise<AppResult<BackupStatus>>;
  function execute(input: { type: 'backup.export'; destination: string }): Promise<AppResult<{ started: boolean }>>;
  function execute(input: { type: 'restore.status' }): Promise<AppResult<RestoreStatus>>;
  function execute(input: { type: 'backup.restore'; source: string }): Promise<AppResult<{ started: boolean }>>;
  function execute(input: { type: 'profile.rename'; name: string; expectedRevision: number }): Promise<AppResult>;
  function execute(input: { type: 'catalog.status' }): Promise<AppResult<CatalogStatus>>;
  function execute(input: { type: 'catalog.list'; query?: CatalogQuery }): Promise<AppResult<CatalogView>>;
  function execute(input: { type: 'catalog.sync' }): Promise<AppResult<{ runId: string }>>;
  function execute(input: { type: 'catalog.cancel' }): Promise<AppResult<{ canceled: boolean }>>;
  function execute(input: { type: 'deck.create'; name: string }): Promise<AppResult<Deck>>;
  function execute(input: { type: 'deck.list' }): Promise<AppResult<Deck[]>>;
  function execute(input: { type: 'deck.read'; id: string }): Promise<AppResult<Deck>>;
  function execute(input: { type: 'deck.save'; deck: Deck; expectedRevision: number }): Promise<AppResult<Deck>>;
  function execute(input: { type: 'deck.delete'; id: string; expectedRevision: number }): Promise<AppResult<{ deleted: boolean }>>;
  function execute(input: { type: 'deck.previewImport'; input: DeckImportInput }): Promise<AppResult<DeckImportPreview>>;
  function execute(input: { type: 'deck.import'; input: DeckImportInput }): Promise<AppResult<Deck>>;
  function execute(input: { type: 'deck.starters' }): Promise<AppResult<StarterDeck[]>>;
  function execute(input: { type: 'deck.importStarter'; key: string }): Promise<AppResult<Deck>>;
  function execute(input: { type: 'solo.opponents' }): Promise<AppResult<SoloOpponent[]>>;
  function execute(input: { type: 'solo.preview'; deckId: string; opponentKey: string }): Promise<AppResult<SoloPreview>>;
  function execute(input: { type: 'solo.createSetup' } & SoloSelection): Promise<AppResult<SoloSetup>>;
  function execute(input: { type: 'solo.readSetup'; id: string }): Promise<AppResult<SoloSetup>>;
  function execute(input: { type: 'solo.listSetups' }): Promise<AppResult<SoloSetup[]>>;
  function execute(input: { type: 'match.read'; id: string }): Promise<AppResult<LocalMatchView>>;
  function execute(input: { type: 'match.list'; cursor?: MatchDirectoryCursor }): Promise<AppResult<UnfinishedMatchPage>>;
  function execute(input: { type: 'match.setup'; id: string; commandId: string; expectedRevision: number; action: SetupCommand }): Promise<AppResult<CommandDelivery>>;
  function execute(input: { type: 'match.command'; id: string; commandId: string; command: GameCommand }): Promise<AppResult<CommandDelivery>>;
  function execute(input: { type: 'match.bot'; id: string }): Promise<AppResult<BotAdvance>>;
  function execute(input: { type: 'match.programQuote'; id: string; input: ProgramQuoteRequest }): Promise<AppResult<ProgramQuote>>;
  function execute(input: { type: 'match.activationQuote'; id: string; input: ActivationQuoteRequest }): Promise<AppResult<ActivationQuote>>;
  function execute(input: unknown): Promise<AppResult<unknown>>;
  async function execute(input: unknown): Promise<AppResult<unknown>> {
      if (!input || typeof input !== 'object' || !('type' in input)) {
        return { ok: false, error: { code: 'INVALID_REQUEST', message: 'The requested operation is invalid.' } };
      }
      try {
        if(input.type==='backup.restore'||input.type==='restore.status')return restores.execute(input);
        if(restores.quiesced&&input.type!=='backup.status')return {ok:false,error:{code:'PROFILE_RESTORING',message:'Restore is activating a complete profile. Reopen the app to continue.'}};
        if (typeof input.type === 'string' && input.type.startsWith('deck.')) return decks.execute(input);
        if (typeof input.type === 'string' && input.type.startsWith('solo.')) return solo.execute(input);
        if (typeof input.type === 'string' && input.type.startsWith('match.')) return await matches.execute(input);
        if (typeof input.type === 'string' && input.type.startsWith('backup.')) return backups.execute(input);
        if (input.type === 'catalog.status') return { ok: true, data: catalog.status() };
        if (input.type === 'catalog.sync') return { ok: true, data: catalog.start() };
        if (input.type === 'catalog.cancel') return { ok: true, data: catalog.cancel() };
        if (input.type === 'catalog.list') {
          const query = catalogQuery.safeParse('query' in input ? input.query ?? {} : {});
          if (query.success) { const view = catalog.list(query.data); return { ok: true, data: { ...view,
            items: view.items.map(card => ({ ...card, solo_support: solo.support(card) })) } }; }
        }
        if (input.type === 'profile.read') return { ok: true, data: read() };
        if (input.type === 'profile.rename' && 'name' in input && 'expectedRevision' in input
          && typeof input.name === 'string' && input.name.trim().length > 0 && input.name.length <= 120
          && Number.isSafeInteger(input.expectedRevision) && typeof input.expectedRevision === 'number') {
          const update = db.prepare('UPDATE profile SET draft_name=?, revision=revision+1 WHERE id=1 AND revision=?')
            .run(input.name.trim(), input.expectedRevision);
          if (update.changes === 0) return { ok: false, error: { code: 'REVISION_CONFLICT', message: 'This deck changed. Reload before saving again.' } };
          return { ok: true, data: read() };
        }
        return { ok: false, error: { code: 'INVALID_REQUEST', message: 'The requested operation is invalid.' } };
      } catch {
        return { ok: false, error: { code: 'STORAGE_ERROR', message: 'The local profile could not be saved or read. Your unsaved edits are still available.' } };
      }
  }
  let closing:Promise<void>|null=null;
  return {
    execute,
    onMatchRevision(listener: (notice: MatchRevision) => void) { matchListeners.add(listener); return () => { matchListeners.delete(listener); }; },
    onProfileRestart(listener:()=>void){restartListeners.add(listener);return()=>{restartListeners.delete(listener);};},
    close() { return closing ??= (async()=>{await restores.close();await closeStorage();})(); },
  };
  } catch(error) { if(db.isOpen)db.close();throw error; }
}
