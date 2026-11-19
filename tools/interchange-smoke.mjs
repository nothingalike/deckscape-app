import {launchDesktop} from './desktop-launch.mjs';
import { expect } from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const development=process.argv.includes('--development');
const profileDirectory=await mkdtemp(join(tmpdir(),'neuroscape-interchange-'));
const outputDirectory=await mkdtemp(join(tmpdir(),'neuroscape-deck-exports-'));
const backupPath=join(outputDirectory,'deck.json');
const env={...process.env,NEUROSCAPE_PROFILE_DIR:profileDirectory};delete env.ELECTRON_RUN_AS_NODE;
const executablePath=resolve(development?'node_modules/electron/dist/electron.exe':process.env.NEUROSCAPE_EXE??'release/win-unpacked/Neuroscape Local.exe');
let desktop;
await mkdir('.local',{recursive:true});
try{
  desktop=await launchDesktop({executablePath,args:development?['.']:[],env});
  await desktop.evaluate(({dialog,session,clipboard},backupPath)=>{
    globalThis.exportNavigation=[];
    globalThis.exportDialogs=[];
    dialog.showSaveDialog=async(_window,options)=>{globalThis.exportDialogs.push(options);return {canceled:false,filePath:backupPath};};
    // Suppress the old browser-download path during the initial failing test.
    session.defaultSession.on('will-download',event=>event.preventDefault());
    globalThis.exportedClipboard='';
    clipboard.writeText=async value=>{globalThis.exportedClipboard=value;};
  },backupPath);
  const page=await desktop.firstWindow();
  await desktop.evaluate(({BrowserWindow})=>{
    const contents=BrowserWindow.getAllWindows()[0].webContents;
    contents.on('will-navigate',(event,url)=>globalThis.exportNavigation.push({type:'will-navigate',url:event.url??url,prevented:event.defaultPrevented}));
    contents.on('did-start-navigation',(_event,url)=>globalThis.exportNavigation.push({type:'start',url}));
    contents.on('did-fail-load',(_event,code,description,url)=>globalThis.exportNavigation.push({type:'failed',code,description,url}));
  });
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('link',{name:'My decks',exact:true}).click();
  await page.getByRole('button',{name:'New deck',exact:true}).click();
  await page.getByLabel('Deck name',{exact:true}).fill('Portable draft');
  await expect(page.getByRole('status').filter({hasText:'Saved on this device only'})).toBeVisible();
  await page.locator('.deck-export > summary').click();
  await page.getByRole('button',{name:/^Backup \(\.json\)/}).click();
  await expect.poll(()=>desktop.evaluate(()=>globalThis.exportDialogs.length)).toBe(1);
  await expect.poll(()=>readFile(backupPath,'utf8').then(value=>JSON.parse(value).deck.name,()=>null)).toBe('Portable draft');
  const exported=JSON.parse(await readFile(backupPath,'utf8'));
  assert.equal(exported.format,'deckscape-backup');assert.equal(exported.version,1);
  assert.equal(exported.deck.name,'Portable draft');assert.deepEqual(exported.deck.entries,[]);
  const originalId=exported.deck.id;
  const originalBeforeImport=await page.evaluate(id=>window.neuroscape.readDeck(id),originalId);
  assert.equal(originalBeforeImport.ok,true);
  assert.equal(await page.evaluate(()=>typeof window.neuroscape.copyDeckText),'function');
  await page.locator('.deck-export > summary').click();
  await page.getByRole('button',{name:/^Copy card list/}).click();
  const textDialog=page.getByRole('dialog',{name:'Copy card list',exact:true});
  const expectedText='# Mainframe\n\n# Cyberdeck\n\n# RAM\n\n# Sideboard\n\n# Sideboard Mainframe\n';
  await expect(textDialog.getByLabel('Exported card list')).toHaveValue(expectedText);
  await textDialog.getByRole('button',{name:'Copy card list',exact:true}).click();
  await expect(textDialog.getByRole('button',{name:'Copied',exact:true})).toBeVisible();
  assert.equal(await desktop.evaluate(()=>globalThis.exportedClipboard),expectedText);
  await textDialog.getByRole('button',{name:'Close',exact:true}).click();
  assert.equal(await page.evaluate(()=>typeof window.neuroscape.saveDeckImage),'function');
  const imagePath=join(outputDirectory,'deck.png');
  await desktop.evaluate(({dialog},imagePath)=>{
    dialog.showSaveDialog=async(_window,options)=>{globalThis.exportDialogs.push(options);return {canceled:false,filePath:imagePath};};
  },imagePath);
  await page.locator('.deck-export > summary').click();
  await page.getByRole('button',{name:/^Promotional image \(\.png\)/}).click();
  await expect.poll(()=>readFile(imagePath).then(bytes=>bytes.length,()=>0)).toBeGreaterThan(1000);
  const image=await readFile(imagePath);
  assert.deepEqual([...image.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.equal(image.readUInt32BE(16),1200);assert.equal(image.readUInt32BE(20),630);
  const imageDialog=await desktop.evaluate(()=>globalThis.exportDialogs.at(-1));
  assert.equal(imageDialog.defaultPath,'deckscape-portable-draft.png');
  await page.getByRole('link',{name:'My decks',exact:true}).click();
  await page.getByRole('button',{name:'Import Deck',exact:true}).click();
  let importDialog=page.getByRole('dialog',{name:'Import Deck',exact:true});
  await importDialog.getByLabel('Deck backup file').setInputFiles(backupPath);
  await importDialog.getByRole('button',{name:'Review backup',exact:true}).click();
  await expect(importDialog.getByRole('region',{name:'Import preview'})).toContainText('Cyberdeck: 0');
  await importDialog.getByRole('button',{name:'Paste deck list',exact:true}).click();
  await expect(importDialog.getByRole('region',{name:'Import preview'})).toHaveCount(0);
  await expect(importDialog.getByRole('button',{name:'Review deck list',exact:true})).toBeVisible();
  await importDialog.getByRole('button',{name:'JSON backup',exact:true}).click();
  await expect(importDialog.getByRole('button',{name:'Review backup',exact:true})).toBeVisible();
  await importDialog.getByLabel('Deck backup file').setInputFiles(backupPath);
  await importDialog.getByRole('button',{name:'Review backup',exact:true}).click();
  await importDialog.getByRole('button',{name:'Import as new draft',exact:true}).click();
  await expect(page.getByLabel('Deck name',{exact:true})).toHaveValue('Portable draft');
  const importedId=/\/decks\/([^/]+)$/.exec(new URL(page.url()).hash)[1];
  assert.notEqual(importedId,originalId);
  const originalAfterImport=await page.evaluate(id=>window.neuroscape.readDeck(id),originalId);
  assert.deepEqual(originalAfterImport,originalBeforeImport);
  await page.getByRole('link',{name:'My decks',exact:true}).click();
  const beforeRejected=await page.evaluate(()=>window.neuroscape.listDecks());assert.equal(beforeRejected.ok,true);
  await page.getByRole('button',{name:'Import Deck',exact:true}).click();
  importDialog=page.getByRole('dialog',{name:'Import Deck',exact:true});
  for(const invalid of [
    {name:'malformed.json',text:'{broken',message:'not valid JSON'},
    {name:'unsupported.json',text:JSON.stringify({...exported,version:2}),message:'not a supported'},
    {name:'invalid.json',text:JSON.stringify({...exported,deck:{...exported.deck,entries:[{card_id:originalId,section:'ram',quantity:0}]}}),message:'not a supported'},
    {name:'duplicate.json',text:JSON.stringify({...exported,deck:{...exported.deck,entries:[{card_id:originalId,section:'ram',quantity:1},{card_id:originalId,section:'ram',quantity:2}]}}),message:'duplicate card entries'},
    {name:'oversized.json',text:'x'.repeat(1_000_001),message:'1 MB or smaller'},
  ]){
    const path=join(outputDirectory,invalid.name);await writeFile(path,invalid.text);
    await importDialog.getByLabel('Deck backup file').setInputFiles(path);
    await importDialog.getByRole('button',{name:'Review backup',exact:true}).click();
    await expect(importDialog.getByRole('alert')).toContainText(invalid.message);
    const unchanged=await page.evaluate(()=>window.neuroscape.listDecks());assert.deepEqual(unchanged,beforeRejected);
  }
  const unknownPath=join(outputDirectory,'unresolved.json');
  const unknownId='e45525aa-735a-4c2d-a442-4b64786c3809';
  await writeFile(unknownPath,JSON.stringify({...exported,deck:{...exported.deck,name:'Repair my import',entries:[{card_id:unknownId,section:'cyberdeck',quantity:3}]}}));
  await importDialog.getByLabel('Deck backup file').setInputFiles(unknownPath);
  await importDialog.getByRole('button',{name:'Review backup',exact:true}).click();
  await expect(importDialog.getByRole('region',{name:'Import preview'})).toContainText(unknownId);
  await page.screenshot({path:'.local/interchange-import-preview.png'});
  await importDialog.getByRole('button',{name:'Import as new draft',exact:true}).click();
  await expect(page.getByText('Unknown card (3)',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Remove unknown card',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Saved on this device only'})).toBeVisible();
  const repairedId=/\/decks\/([^/]+)$/.exec(new URL(page.url()).hash)[1];
  await expect.poll(()=>page.evaluate(async id=>{const result=await window.neuroscape.readDeck(id);return result.ok?result.data.entries.length:-1;},repairedId)).toBe(0);
  await desktop.evaluate(({dialog})=>{dialog.showSaveDialog=async()=>({canceled:true});});
  const cancelResult=await page.evaluate(()=>window.neuroscape.readDeck(location.hash.split('/').at(-1)).then(result=>result.ok?window.neuroscape.saveDeckBackup(result.data):result));
  assert.deepEqual(cancelResult,{ok:true,data:{saved:false}});
  assert.deepEqual(JSON.parse(await readFile(backupPath,'utf8')),exported);
  const concurrent=await page.evaluate(async id=>{
    const current=await window.neuroscape.readDeck(id);if(!current.ok)return current;
    return window.neuroscape.saveDeck({...current.data,name:'Newer committed deck'},current.data.revision);
  },repairedId);assert.equal(concurrent.ok,true);
  await page.getByLabel('Deck name',{exact:true}).fill('Conflicting draft edits');
  await expect(page.getByRole('alert')).toContainText('CONFLICT');
  await page.getByRole('button',{name:'Download edits and reload saved deck',exact:true}).click();
  await expect(page.getByLabel('Deck name',{exact:true})).toHaveValue('Conflicting draft edits');
  const recoveryPath=join(outputDirectory,'conflicting-edits.json');
  await desktop.evaluate(({dialog},recoveryPath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:recoveryPath});},recoveryPath);
  await page.getByRole('button',{name:'Download edits and reload saved deck',exact:true}).click();
  await expect.poll(()=>readFile(recoveryPath,'utf8').then(value=>JSON.parse(value).deck.name,()=>null)).toBe('Conflicting draft edits');
  await expect(page.getByLabel('Deck name',{exact:true})).toHaveValue('Newer committed deck');
  await desktop.evaluate(async({dialog},backupPath)=>{
    dialog.showSaveDialog=async()=>({canceled:false,filePath:backupPath});
    const fs=process.getBuiltinModule('node:fs/promises');
    globalThis.originalExportOpen=fs.open;
    fs.open=async(...args)=>{
      const file=await globalThis.originalExportOpen(...args);const write=file.writeFile.bind(file);
      file.writeFile=async bytes=>{await write(bytes.subarray(0,5));throw Object.assign(new Error('controlled write fault'),{code:'ENOSPC'});};
      return file;
    };
  },backupPath);
  try{
    await page.locator('.deck-export > summary').click();
    await page.getByRole('button',{name:/^Backup \(\.json\)/}).click();
    await expect(page.locator('.deck-export').getByRole('alert')).toContainText('file could not be saved');
    await page.screenshot({path:'.local/interchange-export-error.png'});
    assert.deepEqual(JSON.parse(await readFile(backupPath,'utf8')),exported);
  }finally{await desktop.evaluate(async()=>{const fs=process.getBuiltinModule('node:fs/promises');fs.open=globalThis.originalExportOpen;});}
  await page.getByRole('button',{name:/^Backup \(\.json\)/}).click();
  await expect.poll(()=>readFile(backupPath,'utf8').then(value=>JSON.parse(value).deck.name)).toBe('Newer committed deck');
  assert.equal((await readdir(outputDirectory)).some(name=>name.endsWith('.tmp')),false);
  await desktop.evaluate(({clipboard})=>{clipboard.writeText=async()=>{throw new Error('controlled unavailable clipboard');};});
  await page.locator('.deck-export > summary').click();
  await page.getByRole('button',{name:/^Copy card list/}).click();
  const manual=page.getByRole('dialog',{name:'Copy card list',exact:true});
  await manual.getByRole('button',{name:'Copy card list',exact:true}).click();
  await expect(manual.getByRole('alert')).toContainText('copy it manually');
  assert.equal(await manual.getByLabel('Exported card list').evaluate(input=>input.selectionStart===0&&input.selectionEnd===input.value.length),true);
  await manual.getByRole('button',{name:'Close',exact:true}).click();
  const invalidImage=await page.evaluate(()=>window.neuroscape.saveDeckImage(new Uint8Array([1,2,3]),'../invalid.png'));assert.equal(invalidImage.ok,false);
  assert.deepEqual(errors,[]);
  await writeFile('.local/interchange-core.json',JSON.stringify({development,nativeJson:true,nativeClipboardBoundary:true,nativePng:true,jsonRoundTripNewCopy:true,formatSwitchRequiresNewPreview:true,invalidInputsPreserveDecks:true,unresolvedRepair:true,cancelPreservesFile:true,conflictBackupCancelAndReload:true,partialWritePreservesFileAndRetry:true,temporaryWritesCleaned:true,clipboardFailureSelectsText:true,invalidImageRejected:true,pageErrors:errors},null,2));
  console.log('PASS: native deck export, new-copy JSON import/repair, fresh previews, cancel/conflict recovery, partial-write retry and manual-copy fallback.');
}catch(error){const page=desktop&&(await desktop.windows())[0];if(page)await page.screenshot({path:'.local/interchange-failure.png'});if(desktop)console.error(JSON.stringify(await desktop.evaluate(()=>globalThis.exportNavigation)));throw error;}
finally{if(desktop){await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(window=>window.destroy())).catch(()=>{});await desktop.close();}}
