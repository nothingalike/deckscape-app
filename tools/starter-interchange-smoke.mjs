import {launchDesktop} from './desktop-launch.mjs';
import { expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { redPixelPng } from './png-fixture.mjs';

const development=process.argv.includes('--development');
const baseline=JSON.parse(await readFile('tests/fixtures/catalog-baseline.json','utf8'));
const manifest=JSON.parse(await readFile('src/deckscape/data/starter-decks.json','utf8'));
const sample=await readFile('tests/fixtures/external-corpo-deck.txt','utf8');
const png=redPixelPng();
const cards=baseline.cards.map(card=>({id:card.id,name:card.name,card_type:card.type,set_code:card.setCode,collector_number:card.collectorNumber,
  factions:card.factions,ram_cost:card.ramCost,rules_text:card.rulesText,card_copies_limit:card.copiesLimit,attack:card.attack,defence:card.defence,
  image_url:'https://storage.googleapis.com/spicerack_media/cards/neuroscape/fixture.png'}));
const server=createServer((request,response)=>{
  if(request.url.startsWith('/cards')){
    const offset=Number(new URL(request.url,'http://127.0.0.1').searchParams.get('offset'));
    response.setHeader('Content-Type','application/json');response.end(JSON.stringify({cards:cards.slice(offset,offset+100),total:cards.length,offset,has_more:offset+100<cards.length}));
  }else{response.setHeader('Content-Type','image/png');response.end(png);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const profileDirectory=await mkdtemp(join(tmpdir(),'neuroscape-starter-exchange-'));
const outputDirectory=await mkdtemp(join(tmpdir(),'neuroscape-promotional-export-'));
const imagePath=join(outputDirectory,'preview.png');
const env={...process.env,NEUROSCAPE_PROFILE_DIR:profileDirectory,NEUROSCAPE_CATALOG_FIXTURE_ORIGIN:`http://127.0.0.1:${server.address().port}/`};delete env.ELECTRON_RUN_AS_NODE;
const executablePath=resolve(development?'node_modules/electron/dist/electron.exe':process.env.NEUROSCAPE_EXE??'release/win-unpacked/Neuroscape Local.exe');
const launch=()=>launchDesktop({executablePath,args:development?['.']:[],env});
let desktop;
const errors=[];
await mkdir('.local',{recursive:true});
try{
  desktop=await launch();let page=await desktop.firstWindow();page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&message.text().includes('Content Security Policy'))console.error(message.text());});
  await page.getByRole('button',{name:'Update cards',exact:true}).click();
  await expect(page.getByRole('status').first()).toContainText('256 cards on this computer',{timeout:30000});
  await page.getByRole('link',{name:'My decks',exact:true}).click();
  await page.getByRole('button',{name:'Use a starter',exact:true}).click();
  await expect(page.getByRole('region',{name:'Supplied starters'}).getByRole('button',{name:/^Use /})).toHaveCount(4);
  await page.getByRole('button',{name:'Use '+manifest.decks[0].name,exact:true}).click();
  await expect(page.getByLabel('Deck name',{exact:true})).toHaveValue(manifest.decks[0].name);
  await expect(page.getByText('Valid constructed deck',{exact:true})).toBeVisible();
  const starterId=page.url().split('/').at(-1);
  const starter=await page.evaluate(id=>window.neuroscape.readDeck(id),starterId);assert.equal(starter.ok,true);
  assert.equal(starter.data.entries.reduce((sum,entry)=>sum+entry.quantity,0),76);
  await page.getByRole('link',{name:'My decks',exact:true}).click();
  await page.getByRole('button',{name:'Import Deck',exact:true}).click();
  const importer=page.getByRole('dialog',{name:'Import Deck',exact:true});
  await importer.getByRole('button',{name:'Paste deck list',exact:true}).click();
  await importer.getByRole('textbox',{name:'Deck name',exact:true}).fill('Text import proof');
  await importer.getByRole('textbox',{name:'Deck list',exact:true}).fill('# Mainframe\nNOT A REAL CARD');
  await importer.getByRole('button',{name:'Review deck list',exact:true}).click();
  await expect(importer.getByRole('alert')).toContainText('unknown card');
  const afterRejectedText=await page.evaluate(()=>window.neuroscape.listDecks());assert.equal(afterRejectedText.ok,true);assert.equal(afterRejectedText.data.length,1);
  await importer.getByRole('textbox',{name:'Deck list',exact:true}).fill(sample);
  await importer.getByRole('button',{name:'Review deck list',exact:true}).click();
  await expect(importer.getByRole('region',{name:'Import preview'})).toContainText('25 Basic RAM will be added');
  await importer.getByRole('button',{name:'Import as new draft',exact:true}).click();
  await expect(page.getByLabel('Deck name',{exact:true})).toHaveValue('Text import proof');
  await expect(page.getByText('Valid constructed deck',{exact:true})).toBeVisible();
  const textId=page.url().split('/').at(-1);assert.notEqual(textId,starterId);
  assert.deepEqual(await page.evaluate(id=>window.neuroscape.readDeck(id),starterId),starter);
  await desktop.evaluate(({clipboard,dialog},imagePath)=>{
    globalThis.copiedDeckText='';clipboard.writeText=async text=>{globalThis.copiedDeckText=text;};
    dialog.showSaveDialog=async(_window,options)=>{
      globalThis.pngSaveOptions=options;
      return new Promise(resolve=>{globalThis.finishPngSave=()=>resolve({canceled:false,filePath:imagePath});});
    };
  },imagePath);
  await page.locator('.deck-export > summary').click();
  await page.getByRole('button',{name:/^Copy card list/}).click();
  const textDialog=page.getByRole('dialog',{name:'Copy card list',exact:true});
  const exportedText=await textDialog.getByLabel('Exported card list').inputValue();
  assert.match(exportedText,/# RAM\n25 Basic Ram/i);assert.match(exportedText,/# Sideboard Mainframe/);
  await textDialog.getByRole('button',{name:'Copy card list',exact:true}).click();
  await expect(textDialog.getByRole('button',{name:'Copied',exact:true})).toBeVisible();
  assert.equal(await desktop.evaluate(()=>globalThis.copiedDeckText),exportedText);
  await textDialog.getByRole('button',{name:'Close',exact:true}).click();
  await page.locator('.deck-export > summary').click();
  await page.getByRole('button',{name:/^Promotional image \(\.png\)/}).click();
  await expect.poll(()=>desktop.evaluate(()=>globalThis.pngSaveOptions?.defaultPath)).toBe('deckscape-text-import-proof.png');
  await page.getByLabel('Deck name',{exact:true}).fill('Later deck title');
  await desktop.evaluate(()=>globalThis.finishPngSave());
  await expect.poll(()=>readFile(imagePath).then(bytes=>bytes.length,()=>0)).toBeGreaterThan(1000);
  const bytes=await readFile(imagePath);
  const imageDiagnostic=await page.evaluate(async()=>{
    const result=await window.neuroscape.listCards({type:'mainframe'});if(!result.ok)return result;
    const url='neuroscape://art/'+result.data.items[0].image_path;
    try{const response=await fetch(url);const blob=await response.blob();
      try{const bitmap=await createImageBitmap(blob);const dimensions=[bitmap.width,bitmap.height];bitmap.close();return {status:response.status,mime:blob.type,size:blob.size,dimensions};}
      catch(error){return {status:response.status,mime:blob.type,size:blob.size,error:String(error)};}
    }catch(error){return {error:String(error)};}
  });
  console.log(JSON.stringify({imageDiagnostic}));
  const artworkPixel=await desktop.evaluate(({nativeImage},bytes)=>[...nativeImage.createFromBuffer(Buffer.from(bytes)).crop({x:1100,y:200,width:1,height:1}).toBitmap()],Array.from(bytes));
  console.log(JSON.stringify({artworkPixel}));
  assert.ok(artworkPixel[2]>artworkPixel[1]+20,'Promotional image should contain the downloaded red artwork, not the fallback');
  await writeFile('.local/interchange-promo.png',bytes);
  await expect.poll(()=>page.evaluate(async id=>{const result=await window.neuroscape.readDeck(id);return result.ok?result.data.name:null;},textId)).toBe('Later deck title');
  await page.getByLabel('Deck name',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'.local/interchange-starter-editor.png'});
  await desktop.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  desktop=await launch();page=await desktop.firstWindow();page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('link',{name:'My decks',exact:true}).click();
  await page.getByRole('link').filter({hasText:'Later deck title'}).click();
  await expect(page.getByText('Valid constructed deck',{exact:true})).toBeVisible();
  await expect.poll(()=>page.locator('.deck-entry img').first().evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
  assert.deepEqual(errors,[]);
  await writeFile('.local/interchange-starters.json',JSON.stringify({development,starterChoices:4,starterEditableCopy:true,textPreviewAndImplicitRam:true,unknownTextPreservedDecks:true,clipboardBoundary:true,clickTimeImageName:true,localArtworkInPng:true,artworkPixel,sourceStoppedReopen:true,pageErrors:errors},null,2));
  console.log('PASS: supplied starters, hosted text import/Basic RAM, native clipboard boundary, click-time PNG and local artwork after source shutdown.');
}catch(error){const page=desktop&&(await desktop.windows())[0];if(page)await page.screenshot({path:'.local/interchange-starter-failure.png'});throw error;}
finally{if(desktop){await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(window=>window.destroy())).catch(()=>{});await desktop.close();}server.closeAllConnections();server.close();}
