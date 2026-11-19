import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {crc32} from 'node:zlib';
import {mkdir,lstat,open,rm} from 'node:fs/promises';
import {createWriteStream,createReadStream} from 'node:fs';
import {join,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {Transform,Writable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {isDeepStrictEqual} from 'node:util';
import {openPromise} from 'yauzl';
import {z} from 'zod';
import {backupLimits,backupManifestSchema,profileBackupReferences,type BackupManifest} from './profile-backup';
import {initializeProfileDatabase,currentProfileSchemaVersion} from './profile-database';
import {createCatalog} from './catalog';
import {createDecks} from './decks';
import {createSolo} from './solo';
import {createLocalMatches,localMatchCommandSchema,migrateLocalMatchSchema} from './local-matches';
import {bundledSoloContent,type SoloContent} from './solo-content';
import {localDeckSchema} from './deckscape/lib/deck-record';
import {setupStateSchema,validateSetupDecks} from './deckscape/lib/simulator/setup-state-schema';
import {versionDefinition} from './deckscape/lib/simulator/definition-version';
import {botPlaybookSchema} from './deckscape/lib/simulator/bot-playbook';
import {sourceCard,normalizeCard} from './deckscape/lib/catalog-import';
import corrections from './deckscape/data/corrections.json';
import {admitDeck} from './deckscape/lib/simulator/deck-admission';
import {createExpandedRuntimeV6} from './deckscape/lib/simulator/expanded-runtime-v6';
import {sourceMechanicsHash} from './deckscape/lib/simulator/review-integrity';
import {setImmediate as yieldToDesktop} from 'node:timers/promises';

export class ProfileArchiveError extends Error {}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function validateCatalogRecord(value:unknown){
  const record=z.object({raw:sourceCard,image_path:z.string().nullable(),image_hash:z.string().nullable(),source_missing:z.boolean().optional()}).passthrough().parse(value);
  const expected={...normalizeCard(record.raw,corrections.basic_ram.id),image_path:record.image_path,image_hash:record.image_hash,...(record.source_missing===undefined?{}:{source_missing:record.source_missing})};
  if(!isDeepStrictEqual(value,expected))throw new ProfileArchiveError('A catalog record does not match its original normalized source. Your current profile is unchanged.');
  return record;
}
function schemaSignature(db:DatabaseSync){
  return db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name").all().map(row=>({type:row.type,name:row.name,table:row.tbl_name,
    sql:row.sql===null?null:String(row.sql).toLowerCase().replace(/\bif\s+not\s+exists\b/g,'').replace(/[\s"]/g,'').replace(/;$/,'')}));
}
// Supported v1 profiles lacked the single id=1 CHECK; their data is validated separately.
function compatibleSchema(schema:ReturnType<typeof schemaSignature>){return schema.map(row=>row.name==='profile'&&typeof row.sql==='string'?{...row,sql:row.sql.replace('check(id=1)','')}:row);}
const trustedSchemas=new Map<number,ReturnType<typeof schemaSignature>>();
function expectedSchema(version=currentProfileSchemaVersion){
  const cached=trustedSchemas.get(version);if(cached)return cached;
  const db=new DatabaseSync(':memory:'),directory=join(tmpdir(),'neuroscape-schema-reference-'+randomUUID());
  try{
    initializeProfileDatabase(db);
    const catalog=createCatalog(db,directory,{async fetchPage(){throw new Error('No source calls during schema validation.');},async fetchArtwork(){throw new Error('No source calls during schema validation.');}});
    createDecks(db,catalog.allCards);createSolo(db,directory,catalog.allCards);createLocalMatches(db);
    if(version===7)db.exec('ALTER TABLE solo_setups DROP COLUMN updated_at; PRAGMA user_version=7;');
    const schema=schemaSignature(db);trustedSchemas.set(version,schema);return schema;
  }finally{db.close();}
}
function parseRecord(value:unknown){if(typeof value!=='string'||Buffer.byteLength(value)>16*1024**2)throw new ProfileArchiveError('A profile record exceeds the supported size.');return JSON.parse(value);}

/** Read-only validation uses trusted schema definitions and the original pinned runtime contracts. */
interface ArchiveValidation {preserveUnavailableMatches?:boolean}
export async function validateProfileSnapshot(directory:string,manifest:BackupManifest,suppliedContent?:SoloContent,options:ArchiveValidation={}){
  if(manifest.schemaVersion!==currentProfileSchemaVersion)throw new ProfileArchiveError('This backup requires a different profile schema. Keep it and use a compatible app release.');
  const expected=expectedSchema(),db=new DatabaseSync(join(directory,'profile.sqlite'),{readOnly:true,allowExtension:false});
  try{
    db.exec('PRAGMA trusted_schema=OFF; PRAGMA foreign_keys=ON;');
    const actual=schemaSignature(db);
    // The supported v1 predecessor lacked this single CHECK; its data still must contain exactly profile id 1.
    const normalized=compatibleSchema(actual),normalizedExpected=compatibleSchema(expected);
    if(!isDeepStrictEqual(normalized,normalizedExpected))throw new ProfileArchiveError('The backup database structure is unsupported. Existing data is unchanged.');
    if(Number(db.prepare('PRAGMA user_version').get()?.user_version)!==manifest.schemaVersion||db.prepare('PRAGMA quick_check').get()?.quick_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw new ProfileArchiveError('The backup database failed integrity or reference checks.');
    const profiles=db.prepare('SELECT id,draft_name,revision FROM profile').all();
    if(profiles.length!==1||profiles[0].id!==1||typeof profiles[0].draft_name!=='string'||profiles[0].draft_name.length>120||!Number.isSafeInteger(profiles[0].revision)||Number(profiles[0].revision)<0)throw new ProfileArchiveError('The backup profile metadata is invalid.');
    for(const row of db.prepare('SELECT id,revision,payload FROM decks').iterate()){
      const deck=localDeckSchema.parse(parseRecord(row.payload));if(deck.id!==row.id||deck.revision!==row.revision)throw new ProfileArchiveError('A deck identity or revision is inconsistent.');
    }
    for(const row of db.prepare('SELECT id,payload FROM catalog_cards').iterate()){
      await yieldToDesktop();
      const card=validateCatalogRecord(parseRecord(row.payload));
      if(card.id!==row.id||card.raw.id!==row.id)throw new ProfileArchiveError('A catalog record has an inconsistent identity.');
    }
    const resultSchema=z.object({added:z.number().int().nonnegative(),changed:z.number().int().nonnegative(),missing:z.number().int().nonnegative()}).strict();
    for(const row of db.prepare('SELECT result_json FROM catalog_snapshots').iterate())resultSchema.parse(parseRecord(row.result_json));
    const progressSchema=z.object({phase:z.enum(['catalog','artwork','activating','complete','failed','canceled','interrupted']),done:z.number().int().nonnegative(),total:z.number().int().nonnegative(),message:z.string().max(2000).optional()}).strict();
    for(const row of db.prepare('SELECT state,progress_json FROM catalog_runs').iterate()){z.enum(['running','complete','failed','canceled','interrupted']).parse(row.state);progressSchema.parse(parseRecord(row.progress_json));}
    const refs=profileBackupReferences(db),fileMap=new Map(manifest.files.map(file=>[file.path,file]));
    for(const[path,hash]of refs.artwork)if(fileMap.get('artwork/'+path)?.sha256!==hash)throw new ProfileArchiveError('The backup is missing referenced catalog or saved-match artwork.');
    if(!isDeepStrictEqual(refs.matches,manifest.matches))throw new ProfileArchiveError('The backup runtime manifest does not match its saved games.');
    const content=suppliedContent??bundledSoloContent(),matches=createLocalMatches(db,content),runtime=createExpandedRuntimeV6(undefined,content.release).runtime,unavailable=new Set<string>();
    try{
      for(const row of db.prepare('SELECT id,created_at,updated_at,selection,payload FROM solo_setups ORDER BY id').iterate()){
        await yieldToDesktop();
        const saved=parseRecord(row.payload);
        if(saved.summary.id!==row.id)throw new ProfileArchiveError('A saved game identity is inconsistent.');
        const definitionsAvailable=Array.isArray(saved.definitions)&&saved.definitions.every((pin:any)=>content.release.definitions.get(pin.definition?.cardId)?.version===pin.version);
        if(options.preserveUnavailableMatches&&(!definitionsAvailable||saved.summary.engineVersion!==content.release.engine.version||saved.summary.rulesVersion!==content.release.rulesVersion)){unavailable.add(String(row.id));continue;}
        if(saved.summary.engineVersion!==content.release.engine.version||saved.summary.rulesVersion!==content.release.rulesVersion)throw new ProfileArchiveError('A saved game requires an unavailable engine or rules version. Use a compatible app release.');
        const state=setupStateSchema.parse(saved.state);if(state.players[0].userId!=='local-player'||state.players[1].userId!=='local-bot')throw new ProfileArchiveError('A saved game has incompatible participant identities.');
        const versions=[];
        const definitions=new Map();
        for(const raw of saved.definitions){const pin=versionDefinition(raw.definition,content.release.engine);if(pin.version!==raw.version||content.release.definitions.get(pin.definition.cardId)?.version!==pin.version)throw new ProfileArchiveError('A saved game requires unavailable reviewed card definitions.');versions.push(pin.version);definitions.set(pin.definition.cardId,pin);if(pin.definition.artwork&&fileMap.get('artwork/'+basename(pin.definition.artwork.path))?.sha256!==pin.definition.artwork.sha256)throw new ProfileArchiveError('A saved game is missing its original artwork.');}
        if(!isDeepStrictEqual(versions.sort(),saved.summary.definitionVersions))throw new ProfileArchiveError('Saved definition requirements are inconsistent.');
        const player=localDeckSchema.parse(saved.decks[0]),opponent=z.object({key:z.string().min(1).max(100),name:z.string().max(500),entries:localDeckSchema.shape.entries}).parse(saved.decks[1]);
        validateSetupDecks(state,['local-player','local-bot'],[admitDeck(player.entries,definitions,content.release.engine),admitDeck(opponent.entries,definitions,content.release.engine)]);
        if(saved.summary.playerDeck.id!==player.id||saved.summary.playerDeck.name!==player.name||saved.summary.playerDeck.revision!==player.revision||saved.summary.opponent.key!==opponent.key||saved.summary.opponent.name!==opponent.name||row.selection!==JSON.stringify([player.id,player.revision,opponent.key])||row.created_at!==saved.summary.createdAt)throw new ProfileArchiveError('A saved deck or setup identity is inconsistent.');
        z.iso.datetime({offset:true}).parse(row.created_at);z.iso.datetime({offset:true}).parse(row.updated_at);
        for(const card of saved.cards){validateCatalogRecord(card);const source=sourceCard.parse(card.raw),pin=definitions.get(card.id);if(!pin||source.id!==card.id||sourceMechanicsHash(source)!==content.mechanics.get(card.id)||card.image_hash!==pin.definition.artwork?.sha256)throw new ProfileArchiveError('A saved card does not match its reviewed source or artwork.');}
        const playbook=botPlaybookSchema.parse(saved.playbook);if(playbook.deck!==saved.summary.opponent.key||digest(playbook)!==saved.summary.playbookHash)throw new ProfileArchiveError('A saved game has an invalid pinned strategy.');
        const read=await matches.execute({type:'match.read',id:row.id});if(!read.ok)throw new ProfileArchiveError(read.error.message);
      }
      for(const row of db.prepare('SELECT id,revision,engine_version,rules_version,payload FROM matches').iterate()){
        await yieldToDesktop();
        if(unavailable.has(String(row.id))){const saved=parseRecord(db.prepare('SELECT payload FROM solo_setups WHERE id=?').get(row.id)?.payload);if(row.engine_version!==saved.summary.engineVersion||row.rules_version!==saved.summary.rulesVersion||!Number.isSafeInteger(row.revision)||Number(row.revision)<0)throw new ProfileArchiveError('An unavailable saved game has inconsistent runtime metadata.');parseRecord(row.payload);continue;}
        const state=runtime.decodeState(parseRecord(row.payload));if(state.revision!==row.revision||state.engineVersion!==row.engine_version||state.rulesVersion!==row.rules_version)throw new ProfileArchiveError('A saved game revision or runtime header is inconsistent.');
      }
      for(const table of ['match_receipts','setup_receipts']){
        const foreign=table==='match_receipts'?'match_id':'setup_id';
        for(const row of db.prepare(`SELECT ${foreign} AS id,command_id,actor_id,expected_revision,accepted_revision,command_json FROM ${table}`).iterate()){
          await yieldToDesktop();
          if(!['local-player','local-bot'].includes(String(row.actor_id))||!Number.isSafeInteger(row.expected_revision)||!Number.isSafeInteger(row.accepted_revision)||Number(row.expected_revision)<0||Number(row.accepted_revision)<=Number(row.expected_revision))throw new ProfileArchiveError('A saved command receipt is invalid.');
          const command=parseRecord(row.command_json);
          if(!unavailable.has(String(row.id))){if(table==='match_receipts'){localMatchCommandSchema.parse({type:'match.command',id:row.id,commandId:row.command_id,command});if(command.expectedRevision!==row.expected_revision)throw new ProfileArchiveError('A saved receipt command revision is inconsistent.');}
          else localMatchCommandSchema.parse({type:'match.setup',id:row.id,commandId:row.command_id,expectedRevision:row.expected_revision,action:command});}
          const revision=table==='match_receipts'?db.prepare('SELECT revision FROM matches WHERE id=?').get(row.id)?.revision:JSON.parse(String(db.prepare('SELECT payload FROM solo_setups WHERE id=?').get(row.id)?.payload)).state.revision;
          if(Number(row.accepted_revision)>Number(revision))throw new ProfileArchiveError('A command receipt exceeds its committed state.');
        }
      }
    }finally{await matches.close();}
  }finally{db.close();}
}

export interface StagedProfileArchive {id:string;directory:string;manifest:BackupManifest;sourceSchemaVersion:number}
/** ZIP names are a flat allowlist; every byte is bounded, hashed, CRC-checked and written only under owned staging. */
export async function stageProfileArchive(source:string,profileRoot:string,content?:SoloContent,options:ArchiveValidation={}):Promise<StagedProfileArchive>{
  const info=await lstat(source);if(!info.isFile()||info.isSymbolicLink()||info.size>backupLimits.totalBytes)throw new ProfileArchiveError('Choose a regular profile ZIP within the supported 2 GiB limit.');
  const root=join(profileRoot,'restore-staging');await mkdir(root,{recursive:true});const rootInfo=await lstat(root);if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink())throw new ProfileArchiveError('The restore staging folder is unavailable.');
  const id=randomUUID(),directory=join(root,id);await mkdir(directory);await mkdir(join(directory,'artwork'));
  let archive:Awaited<ReturnType<typeof openPromise>>|undefined;
  try{
    archive=await openPromise(source,{lazyEntries:true,strictFileNames:true,validateEntrySizes:true});if(archive.entryCount>backupLimits.files+1)throw new ProfileArchiveError('The backup exceeds the supported file count.');
    let total=0,manifestBytes:Buffer|undefined;const files=new Map<string,{size:number;sha256:string}>();
    for await(const entry of archive.eachEntry()){
      const name=entry.fileName,isManifest=name==='manifest.json';
      if(!isManifest&&name!=='profile.sqlite'&&!/^artwork\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(name))throw new ProfileArchiveError('The backup contains an unsupported or unsafe archive path.');
      const mode=(entry.externalFileAttributes>>>16)&0xf000;
      if((mode!==0&&mode!==0x8000)||entry.isEncrypted()||!entry.canDecodeFileData())throw new ProfileArchiveError('Links, encrypted entries and unsupported archive encodings are not accepted.');
      if(files.has(name)||(isManifest&&manifestBytes))throw new ProfileArchiveError('The backup contains duplicate file names.');
      const limit=isManifest?backupLimits.manifestBytes:name==='profile.sqlite'?backupLimits.databaseBytes:backupLimits.artworkBytes;
      total+=entry.uncompressedSize;if(entry.uncompressedSize>limit||total>backupLimits.totalBytes)throw new ProfileArchiveError('The backup exceeds supported expanded size limits.');
      const stream=await archive.openReadStreamPromise(entry),hash=createHash('sha256'),chunks:Buffer[]=[];let size=0,crc=0;
      const verify=new Transform({transform(chunk,_encoding,callback){size+=chunk.length;if(size>limit)return callback(new ProfileArchiveError('An archive entry exceeds its declared or supported size.'));hash.update(chunk);crc=crc32(chunk,crc);if(isManifest)chunks.push(Buffer.from(chunk));callback(null,isManifest?undefined:chunk);}});
      if(isManifest){await pipeline(stream,verify,new Writable({write(_chunk,_encoding,callback){callback();}}));manifestBytes=Buffer.concat(chunks);}
      else{
        const target=join(directory,name);await pipeline(stream,verify,createWriteStream(target,{flags:'wx',mode:0o600}));const handle=await open(target,'r+');try{await handle.sync();}finally{await handle.close();}
      }
      if(size!==entry.uncompressedSize||crc!==entry.crc32)throw new ProfileArchiveError('An archive entry failed its size or checksum validation.');
      if(!isManifest)files.set(name,{size,sha256:hash.digest('hex')});
    }
    if(!manifestBytes||!files.has('profile.sqlite'))throw new ProfileArchiveError('The backup is missing its manifest or database.');
    let manifest=backupManifestSchema.parse(JSON.parse(manifestBytes.toString('utf8')));
    if(new Set(manifest.files.map(file=>file.path)).size!==manifest.files.length||manifest.files.length!==files.size)throw new ProfileArchiveError('The backup inventory is duplicated or incomplete.');
    for(const file of manifest.files)if(!isDeepStrictEqual(files.get(file.path),{size:file.size,sha256:file.sha256}))throw new ProfileArchiveError('A backup file failed its integrity hash or size check.');
    const sourceSchemaVersion=manifest.schemaVersion;
    if(sourceSchemaVersion===7){
      // The only supported predecessor transition is the existing match-directory timestamp migration.
      // Validate the exact old structure before any write or executable SQL can be reached.
      const path=join(directory,'profile.sqlite'),prior=new DatabaseSync(path,{readOnly:true,allowExtension:false});
      try{prior.exec('PRAGMA trusted_schema=OFF; PRAGMA foreign_keys=ON;');if(Number(prior.prepare('PRAGMA user_version').get()?.user_version)!==7||!isDeepStrictEqual(compatibleSchema(schemaSignature(prior)),compatibleSchema(expectedSchema(7)))||prior.prepare('PRAGMA quick_check').get()?.quick_check!=='ok'||prior.prepare('PRAGMA foreign_key_check').all().length)throw new ProfileArchiveError('The predecessor database structure or integrity is unsupported.');}finally{prior.close();}
      const migrated=new DatabaseSync(path,{allowExtension:false});try{migrated.exec('PRAGMA trusted_schema=OFF; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');migrateLocalMatchSchema(migrated);}finally{migrated.close();}
      const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);const size=(await lstat(path)).size;if(size>backupLimits.databaseBytes)throw new ProfileArchiveError('The migrated database exceeds the supported size.');
      manifest={...manifest,schemaVersion:currentProfileSchemaVersion,files:manifest.files.map(file=>file.path==='profile.sqlite'?{...file,size,sha256:hash.digest('hex')}:file)};
    }
    await validateProfileSnapshot(directory,manifest,content,options);return {id,directory,manifest,sourceSchemaVersion};
  }catch(error){await rm(directory,{recursive:true,force:true}).catch(()=>{});if(error instanceof ProfileArchiveError)throw error;throw new ProfileArchiveError('The backup is malformed, damaged or incompatible. Your current profile is unchanged.');}
  finally{archive?.close();}
}
