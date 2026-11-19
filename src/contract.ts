export interface Profile {
  draftName: string;
  revision: number;
}

export type AppResult<T = Profile> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export interface DesktopApi {
  appReleaseInfo():Promise<AppResult<AppReleaseInfo>>;
  checkAppRelease():Promise<AppResult<AppReleaseInfo>>;
  openAppDownload():Promise<boolean>;
  readonly profileGeneration:string|null;
  openExternal(url: string): Promise<boolean>;
  readProfile(): Promise<AppResult>;
  renameDraft(name: string, expectedRevision: number): Promise<AppResult>;
  catalogStatus(): Promise<AppResult<CatalogStatus>>;
  listCards(query?: CatalogQuery): Promise<AppResult<CatalogView>>;
  syncCatalog(): Promise<AppResult<{ runId: string }>>;
  cancelCatalog(): Promise<AppResult<{ canceled: boolean }>>;
  createDeck(name: string): Promise<AppResult<Deck>>;
  listDecks(): Promise<AppResult<Deck[]>>;
  readDeck(id: string): Promise<AppResult<Deck>>;
  saveDeck(deck: Deck, expectedRevision: number): Promise<AppResult<Deck>>;
  deleteDeck(id: string, expectedRevision: number): Promise<AppResult<{ deleted: boolean }>>;
  previewDeckImport(input: DeckImportInput): Promise<AppResult<DeckImportPreview>>;
  importDeck(input: DeckImportInput): Promise<AppResult<Deck>>;
  listStarterDecks(): Promise<AppResult<StarterDeck[]>>;
  importStarterDeck(key: string): Promise<AppResult<Deck>>;
  saveDeckBackup(deck: Deck): Promise<AppResult<{ saved: boolean }>>;
  copyDeckText(text: string): Promise<AppResult<{ copied: boolean }>>;
  saveDeckImage(bytes: Uint8Array, name: string): Promise<AppResult<{ saved: boolean }>>;
  soloOpponents(): Promise<AppResult<SoloOpponent[]>>;
  previewSolo(deckId: string, opponentKey: string): Promise<AppResult<SoloPreview>>;
  createSoloSetup(input: SoloSelection): Promise<AppResult<SoloSetup>>;
  readSoloSetup(id: string): Promise<AppResult<SoloSetup>>;
  listSoloSetups(): Promise<AppResult<SoloSetup[]>>;
  readMatch(id: string): Promise<AppResult<LocalMatchView>>;
  submitSetup(id: string, commandId: string, expectedRevision: number, action: SetupCommand): Promise<AppResult<CommandDelivery>>;
  submitMatch(id: string, commandId: string, command: GameCommand): Promise<AppResult<CommandDelivery>>;
  advanceMatchBot(id: string): Promise<AppResult<BotAdvance>>;
  quoteProgram(id: string, input: ProgramQuoteRequest): Promise<AppResult<ProgramQuote>>;
  quoteActivation(id: string, input: ActivationQuoteRequest): Promise<AppResult<ActivationQuote>>;
  onMatchRevision(listener: (notice: MatchRevision | null) => void): () => void;
  listUnfinishedMatches(cursor?: MatchDirectoryCursor): Promise<AppResult<UnfinishedMatchPage>>;
  exportProfileBackup(): Promise<AppResult<{ started: boolean }>>;
  profileBackupStatus(): Promise<AppResult<BackupStatus>>;
  restoreProfileBackup(): Promise<AppResult<{ started:boolean }>>;
  profileRestoreStatus(): Promise<AppResult<RestoreStatus>>;
  openRecoveryBackupFolder(): Promise<boolean>;
}

export type { Deck } from './deckscape/lib/types';
import type { Deck } from './deckscape/lib/types';
import type { Issue } from './deckscape/lib/types';
export type DeckImportInput = { format: 'json'; text: string };
export interface DeckImportPreview {
  content: Pick<Deck, 'name' | 'description' | 'entries'>;
  issues: Issue[];
  unresolvedCardIds: string[];
  addedBasicRam: boolean;
}
export type { StarterPayload as StarterDeck } from './deckscape/lib/starter-decks';
import type { StarterPayload as StarterDeck } from './deckscape/lib/starter-decks';
import type { Card as HostedCard } from './deckscape/lib/types';
export type SoloSupport = { status: 'supported' | 'unsupported' | 'review-required'; reasons: string[] };
export type Card = HostedCard & { source_missing?: boolean; solo_support?: SoloSupport };
export interface SoloOpponent { key: string; name: string; description: string; available?: boolean; unavailableReason?: string; strategyLabel?: string }
export interface SoloDeckReadiness { legal: boolean; supported: boolean; ready: boolean; legalityIssues: string[]; supportIssues: string[] }
export interface SoloPreview { player: SoloDeckReadiness; bot: SoloDeckReadiness; deckRevision: number }
export interface SoloSelection { requestId: string; deckId: string; expectedRevision: number; opponentKey: string }
/** Public metadata only. The setup's random state and opponent hand stay in the service. */
export interface SoloSetup {
  id: string; createdAt: string; phase: 'setup';
  playerDeck: { id: string; name: string; revision: number };
  opponent: SoloOpponent; engineVersion: string; rulesVersion: string;
  definitionVersions: string[]; artworkHashes: string[]; playbookHash: string;
}
import type { SetupCommand } from './deckscape/lib/simulator/setup';
import type { SetupView } from './deckscape/lib/simulator/setup-response';
import type { BattlefieldSnapshot, CommandDelivery } from './deckscape/lib/simulator/match-client-session';
import type { GameCommand } from './deckscape/lib/simulator/commands';
import type { ProgramQuoteRequest, ProgramQuote } from './deckscape/lib/simulator/program-quote-contract';
import type { ActivationQuoteRequest, ActivationQuote } from './deckscape/lib/simulator/activation-quote-contract';
import type { MatchDirectoryCursor, UnfinishedMatchPage } from './deckscape/lib/simulator/match-directory';
export type LocalMatchView = { phase: 'setup'; summary: SoloSetup; setup: SetupView }
  | { phase: 'game'; summary: SoloSetup; snapshot: BattlefieldSnapshot };
export interface BotAdvance { applied: number; waiting: boolean; finished: boolean }
export interface MatchRevision { id: string; revision: number }
export interface BackupStatus {
  running: boolean; phase: 'idle' | 'snapshot' | 'artwork' | 'archive' | 'complete' | 'failed';
  done: number; total: number; message?: string; lastSavedAt?: string;
}
export interface RestoreStatus {
  running:boolean;phase:'idle'|'validating'|'backup'|'activating'|'complete'|'failed';message?:string;
  restartRequired:boolean;recoveryBackupPath?:string;
}
export interface AppReleaseInfo {
  installedVersion:string;configured:boolean;status:'unconfigured'|'idle'|'checking'|'current'|'available'|'ahead'|'invalid'|'unavailable';
  message:string;downloadAvailable:boolean;checkedAt?:string;release?:{version:string;publishedAt:string;notes:string};
}
export interface CatalogQuery { search?: string; type?: string; set?: string; offset?: number }
export interface CatalogView { items: Card[]; total: number; sets: string[]; types: string[] }
export interface CatalogProgress { phase: 'catalog' | 'artwork' | 'activating' | 'complete' | 'failed' | 'canceled' | 'interrupted'; done: number; total: number; message?: string }
export interface CatalogStatus {
  count: number; snapshotId: string | null; lastSyncedAt: string | null; running: boolean;
  progress: CatalogProgress | null; lastResult: { added: number; changed: number; missing: number } | null;
}

declare global {
  interface Window { neuroscape: DesktopApi }
}
