import {launchDesktop} from './desktop-launch.mjs';
import { expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const live=JSON.parse(await readFile('.local/catalog-live.json','utf8'));
const env={...process.env,NEUROSCAPE_PROFILE_DIR:live.profileDirectory};
delete env.ELECTRON_RUN_AS_NODE;delete env.NEUROSCAPE_CATALOG_FIXTURE_ORIGIN;
const executablePath=resolve(process.env.NEUROSCAPE_EXE??'release/win-unpacked/Neuroscape Local.exe');
let desktop;let id;
const errors=[];
async function denyNetwork(){
  return desktop.evaluate(async({session,net})=>{
    globalThis.offlineRequests=[];
    session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(details,callback)=>{
      globalThis.offlineRequests.push(new URL(details.url).hostname);callback({cancel:true});
    });
    try{await net.fetch('https://www.neuroscapetcg.com/',{cache:'no-store'});return false;}catch{return true;}
  });
}
try{
  desktop=await launchDesktop({executablePath,env});assert.equal(await denyNetwork(),true);
  let page=await desktop.firstWindow();page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('button',{name:'Update cards',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('last successful catalog is unchanged',{timeout:35000});
  const created=await page.evaluate(async()=>{
    const cards=[];
    for(let offset=0;;offset=cards.length){const page=await window.neuroscape.listCards({offset});if(!page.ok)throw Error('Catalog unavailable');cards.push(...page.data.items);if(cards.length>=page.data.total)break;}
    const ram=cards.find(card=>card.is_basic_ram);
    const frame=cards.find(card=>card.card_type==='mainframe'&&!card.source_missing);
    if(!ram||!frame)throw Error('Required official cards unavailable');
    const names=new Set();const entries=[{card_id:frame.id,section:'mainframe',quantity:1},{card_id:ram.id,section:'ram',quantity:25}];
    let remaining=50;
    for(const card of cards){
      if(!['character','program','gear'].includes(card.card_type)||card.source_missing||names.has(card.normalized_name)||(card.copies_limit??4)<1)continue;
      names.add(card.normalized_name);const quantity=Math.min(remaining,card.copies_limit??4,4);
      entries.push({card_id:card.id,section:'cyberdeck',quantity});remaining-=quantity;if(!remaining)break;
    }
    if(remaining)throw Error('Not enough cards for the controlled valid build');
    const created=await window.neuroscape.createDeck('Official catalog offline proof');if(!created.ok)throw Error(created.error.message);
    const saved=await window.neuroscape.saveDeck({...created.data,entries},created.data.revision);if(!saved.ok)throw Error(saved.error.message);
    return {id:saved.data.id,frameName:frame.name,cardCount:cards.length};
  });
  id=created.id;
  await page.getByRole('link',{name:'My decks',exact:true}).click();
  await page.getByRole('link').filter({hasText:'Official catalog offline proof'}).click();
  await expect(page.getByText('Valid constructed deck',{exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'Deck description',exact:true}).fill('Saved with HTTP and HTTPS denied.');
  await expect.poll(()=>page.evaluate(async id=>{const result=await window.neuroscape.readDeck(id);return result.ok?result.data.description:null;},id)).toBe('Saved with HTTP and HTTPS denied.');
  await page.getByRole('status').filter({hasText:'Saved on this device only'}).waitFor();
  await page.getByLabel('Deck name',{exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:'.local/decks-network-denied.png'});
  const blockedHosts=await desktop.evaluate(()=>globalThis.offlineRequests);
  assert.ok(blockedHosts.includes('api.v2.cloudflare.prod.carde.io'));
  await desktop.close();desktop=await launchDesktop({executablePath,env});assert.equal(await denyNetwork(),true);
  page=await desktop.firstWindow();page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('link',{name:'My decks',exact:true}).click();
  await page.getByRole('link').filter({hasText:'Official catalog offline proof'}).click();
  await expect(page.getByRole('textbox',{name:'Deck description',exact:true})).toHaveValue('Saved with HTTP and HTTPS denied.');
  await page.getByRole('button',{name:'Preview '+created.frameName,exact:true}).click();
  await expect.poll(()=>page.getByRole('dialog').locator('img').first().evaluate(image=>image.complete&&image.naturalWidth>1)).toBe(true);
  await page.screenshot({path:'.local/decks-offline-preview.png'});
  await page.getByRole('button',{name:'Close card preview',exact:true}).click();
  const promotionalPath=resolve('.local/decks-offline-promo.png');
  await desktop.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},promotionalPath);
  await page.locator('.deck-export > summary').click();
  await page.getByRole('button',{name:/^Promotional image \(\.png\)/}).click();
  await expect.poll(()=>readFile(promotionalPath).then(bytes=>bytes.length,()=>0)).toBeGreaterThan(1000);
  const promotional=await readFile(promotionalPath);
  assert.equal(promotional.readUInt32BE(16),1200);assert.equal(promotional.readUInt32BE(20),630);
  const cleanup=await page.evaluate(async id=>{const deck=await window.neuroscape.readDeck(id);return deck.ok?window.neuroscape.deleteDeck(id,deck.data.revision):deck;},id);
  assert.equal(cleanup.ok,true);id=undefined;
  assert.deepEqual(errors,[]);
  await writeFile('.local/decks-network-denied.json',JSON.stringify({method:'HTTP/HTTPS denied in the shared application network session',catalogCount:created.cardCount,blockedHosts,validOfficialDeck:true,autosaveAndReopen:true,localArtworkDecoded:true,nativePromotionalExport:true,temporaryDeckRemoved:true,pageErrors:errors},null,2));
  console.log('PASS: official-catalog deck editor, autosave, restart and artwork with main/utility HTTP/HTTPS positive controls denied.');
}finally{
  if(desktop){await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(window=>window.destroy())).catch(()=>{});await desktop.close();}
}
