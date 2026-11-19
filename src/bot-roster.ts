import {z} from 'zod';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import type {Card,Entry} from './deckscape/lib/types';
import {localDeckSchema} from './deckscape/lib/deck-record';
import {resolveStarters} from './deckscape/lib/starter-decks';
import starters from './deckscape/data/starter-decks.json';
import {botPlaybookSchema,readBotPlaybook} from './deckscape/lib/simulator/bot-playbook';
import {assessDeckReadiness} from './deckscape/lib/simulator/deck-readiness';
import type {expandedDefinitionsV6} from './deckscape/lib/simulator/expanded-definitions-v6';
import type {SoloOpponent} from './contract';

type Release=ReturnType<typeof expandedDefinitionsV6>;
export type RosterOpponent=SoloOpponent & {entries:Entry[];playbook:unknown;engineVersion?:string;rulesVersion?:string};
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const provenanceSchema=z.object({method:z.literal('hosted-general-tactics'),sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),
  files:z.array(z.object({path:z.string().min(1),sha256:digest}).strict()).min(1)}).strict();
const opponentSchema=z.object({key:z.string().min(1),name:z.string().min(1),description:z.string(),entries:localDeckSchema.shape.entries,
  playbook:botPlaybookSchema,playbookSha256:digest,definitionVersions:z.array(z.string()),
  artwork:z.array(z.object({cardId:z.uuid(),path:z.string(),sha256:digest}).strict())}).strict();
const rosterSchema=z.object({version:z.literal(1),engineVersion:z.string(),rulesVersion:z.string(),provenance:provenanceSchema,opponents:z.array(z.unknown()).min(1).max(16)}).strict();
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function requirements(entries:Entry[],release:Release){
  const pins=[...new Set(entries.map(entry=>entry.card_id))].sort().map(id=>{const pin=release.definitions.get(id);if(!pin?.definition.artwork)throw new Error('Required reviewed card or artwork is unavailable.');return pin;});
  return {definitionVersions:pins.map(pin=>pin.version).sort(),artwork:pins.map(pin=>({cardId:pin.definition.cardId,...pin.definition.artwork!}))};
}
/** Reproducible release data from the original reviewed starters and original general tactics. */
export function assembleBotRoster(release:Release,cards:Card[],provenance:unknown){
  return {version:1,engineVersion:release.engine.version,rulesVersion:release.rulesVersion,provenance:provenanceSchema.parse(provenance),
    opponents:resolveStarters(starters,cards).map(starter=>{
      const ready=assessDeckReadiness(starter.entries,cards,release);if(!ready.ready)throw new Error(starter.name+': '+ready.issues.join(' '));
      const playbook=botPlaybookSchema.parse(readBotPlaybook(null,starter.key));
      return {...starter,playbook,playbookSha256:hash(playbook),...requirements(starter.entries,release)};
    })};
}
/** Invalid packaged entries remain explainable but cannot be selected or admitted. */
export function loadBotRoster(input:unknown,release:Release):RosterOpponent[]{
  const parsedRoster=rosterSchema.safeParse(input);
  if(!parsedRoster.success)return [{key:'unavailable-roster',name:'Bot opponents',description:'',entries:[],playbook:null,available:false,unavailableReason:'Packaged opponent roster failed validation. Reinstall a compatible app release.'}];
  const roster=parsedRoster.data;
  const keys=new Map<string,number>();
  for(const raw of roster.opponents){const parsed=opponentSchema.safeParse(raw);if(parsed.success)keys.set(parsed.data.key,(keys.get(parsed.data.key)??0)+1);}
  return roster.opponents.map((raw,index)=>{
    const parsed=opponentSchema.safeParse(raw);
    if(!parsed.success){const label=z.object({key:z.string(),name:z.string()}).safeParse(raw);return {key:label.success?label.data.key:'unavailable-'+index,name:label.success?label.data.name:'Unavailable opponent '+(index+1),description:'',entries:[],playbook:null,available:false,unavailableReason:'Packaged deck or strategy failed validation.'};}
    const record=parsed.data;let reason='';
    try{
      if(roster.engineVersion!==release.engine.version || roster.rulesVersion!==release.rulesVersion)throw new Error('This opponent requires another engine or rules version.');
      if(keys.get(record.key)!==1)throw new Error('This opponent has a duplicate identity.');
      if(record.playbook.deck!==record.key || hash(record.playbook)!==record.playbookSha256)throw new Error('Packaged strategy does not match this opponent.');
      const required=requirements(record.entries,release);
      if(!isDeepStrictEqual(required.definitionVersions,record.definitionVersions) || !isDeepStrictEqual(required.artwork,record.artwork))throw new Error('Packaged card or artwork requirements do not match this release.');
      const checked=assessDeckReadiness(record.entries,[],release);if(!checked.ready)throw new Error(checked.issues.join(' '));
    }catch(error){reason=error instanceof Error?error.message:'Packaged opponent is unavailable.';}
    return {key:record.key,name:record.name,description:record.description,entries:record.entries,playbook:record.playbook,
      engineVersion:roster.engineVersion,rulesVersion:roster.rulesVersion,strategyLabel:'Hosted general tactics',available:!reason,...(reason?{unavailableReason:reason}:{})};
  });
}
