import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {assembleBotRoster} from '../src/bot-roster';
import {bundledSoloContent} from '../src/solo-content';
import baseline from '../src/deckscape/data/simulator/catalog-baseline.json';
import corrections from '../src/deckscape/data/corrections.json';
import {normalizeCard} from '../src/deckscape/lib/catalog-import';
async function main(){
  const manifest=JSON.parse(await readFile('docs/reuse-manifest.json','utf8'));
  const paths=['data/starter-decks.json','data/simulator/catalog-baseline.json','lib/simulator/bot-playbook.ts'];
  const files=[];
  for(const path of paths){const record=manifest.files.find((item:{source:string})=>item.source===path);if(!record)throw new Error('Missing source provenance: '+path);const actual=createHash('sha256').update(await readFile(record.local)).digest('hex');if(actual.toUpperCase()!==record.sourceSha256)throw new Error('Roster input is not the original source: '+path);files.push({path,sha256:actual});}
  const cards=baseline.cards.map(card=>normalizeCard({id:card.id,name:card.name,card_type:card.type,subtype:card.subtype,rules_text:card.rulesText,factions:card.factions,ram_cost:card.ramCost,attack:card.attack,defence:card.defence,attack_type:card.attackType,iconic:card.iconic,card_copies_limit:card.copiesLimit,set_code:card.setCode},corrections.basic_ram.id));
  const roster=assembleBotRoster(bundledSoloContent().release,cards,{method:'hosted-general-tactics',sourceCommit:manifest.sourceCommit,files});
  await mkdir('src/data',{recursive:true});await writeFile('src/data/bot-roster.json',JSON.stringify(roster,null,2)+'\n');console.log(JSON.stringify({opponents:roster.opponents.map(item=>item.key),sourceCommit:manifest.sourceCommit}));
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
