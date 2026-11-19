import {launchDesktop} from './desktop-launch.mjs';
import { expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const development=process.argv.includes('--development');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
const basic={id:'61045c1b-73b0-46f2-8cc0-4c379c5d31e4',name:'Basic Ram',card_type:'',card_copies_limit:4};
const frames=[{id:'effdb54e-452a-4c86-8b53-616f960afc2f',name:'Mainframe Alpha',card_type:'mainframe'},
  {id:'5239686d-e5b0-49cc-9959-9f40264b820b',name:'Mainframe Beta',card_type:'mainframe'}];
const runners=Array.from({length:13},(_,i)=>({id:`e45525aa-735a-4c2d-a442-${(i+1).toString(16).padStart(12,'0')}`,name:`Runner ${String(i+1).padStart(2,'0')}`,card_type:'character',ram_cost:[String(i%4)]}));
const cards=[basic,...frames,...runners].map(card=>({...card,set_code:'GENESIS',set_name:'Genesis',image_url:'https://storage.googleapis.com/spicerack_media/cards/neuroscape/fixture.png?signature=controlled'}));
const server=createServer((request,response)=>{
  if(request.url.startsWith('/cards')){response.setHeader('Content-Type','application/json');response.end(JSON.stringify({cards,total:cards.length,has_more:false,offset:0}));}
  else{response.setHeader('Content-Type','image/png');response.end(png);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}/`;
const profileDirectory=await mkdtemp(join(tmpdir(),'neuroscape-deck-ui-'));
const env={...process.env,NEUROSCAPE_PROFILE_DIR:profileDirectory,NEUROSCAPE_CATALOG_FIXTURE_ORIGIN:origin};delete env.ELECTRON_RUN_AS_NODE;
const executablePath=resolve(development?'node_modules/electron/dist/electron.exe':process.env.NEUROSCAPE_EXE??'release/win-unpacked/Neuroscape Local.exe');
const launch=()=>launchDesktop({executablePath,args:development?['.']:[],env});
let desktop;
const errors=[];
await mkdir('.local',{recursive:true});
try{
  desktop=await launch();let page=await desktop.firstWindow();
  page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('button',{name:'Update cards',exact:true}).click();
  await expect(page.getByRole('status').first()).toContainText('16 cards on this computer');
  await page.getByRole('link',{name:'My decks',exact:true}).click();
  await page.getByRole('button',{name:'New deck',exact:true}).click();
  await page.getByLabel('Deck name',{exact:true}).fill('Local deck proof');
  await page.getByRole('textbox',{name:'Deck description',exact:true}).fill('My offline plan');
  const deckId=/\/decks\/([^/]+)$/.exec(new URL(page.url()).hash)[1];
  const library=page.getByRole('region',{name:'Card library',exact:true});
  const workspace=page.getByRole('region',{name:'Deck list',exact:true});
  await library.getByRole('button',{name:'Add Mainframe Alpha',exact:true}).click();
  await library.getByRole('button',{name:'Add Mainframe Beta',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Replace mainframe',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Replace mainframe',exact:true}).click();
  await expect(workspace.getByRole('button',{name:'Preview Mainframe Alpha',exact:true})).toHaveCount(0);
  await expect(workspace.getByRole('button',{name:'Preview Mainframe Beta',exact:true})).toBeVisible();
  for(let n=0;n<25;n++)await library.getByRole('button',{name:'Add Basic Ram',exact:true}).click();
  for(let n=0;n<4;n++)await library.getByRole('button',{name:'Add Runner 01',exact:true}).click();
  for(let n=0;n<2;n++)await library.getByRole('button',{name:'Add Runner 02',exact:true}).click();
  await library.getByRole('button',{name:'Add Runner 01 to Sideboard',exact:true}).click();
  await expect(workspace).toContainText('maximum 4');
  await workspace.getByRole('button',{name:'Remove Runner 01 from Sideboard',exact:true}).click();
  await expect(workspace).not.toContainText('maximum 4');
  await workspace.getByRole('button',{name:'Test opening hand',exact:true}).click();
  await expect(workspace).toContainText('5 drawn · 1 remaining · 5 in hand');
  await workspace.getByRole('button',{name:/hand card 1$/}).click();
  await workspace.getByRole('button',{name:'Mulligan selected',exact:true}).click();
  await expect(workspace.getByRole('button',{name:'Mulligan selected',exact:true})).toBeDisabled();
  await expect(workspace).toContainText('6 drawn · 1 remaining · 5 in hand');
  await workspace.getByRole('button',{name:'Draw next',exact:true}).click();
  await expect(workspace).toContainText('7 drawn · 0 remaining · 6 in hand');
  await expect(page.getByRole('status').filter({hasText:'Saved on this device only'})).toBeVisible();
  await page.screenshot({path:'.local/deck-editor.png'});
  await page.getByLabel('Deck name',{exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:'.local/deck-editor-main.png'});
  const injection=new DatabaseSync(join(profileDirectory,'profile.sqlite'));
  try{
    injection.exec("CREATE TRIGGER reject_deck_write BEFORE UPDATE ON decks BEGIN SELECT RAISE(FAIL, 'controlled storage fault'); END;");
    await page.getByLabel('Deck name',{exact:true}).fill('Retained unsaved name');
    await expect(page.getByRole('alert')).toContainText('unsaved edits are still available');
    await expect(page.getByLabel('Deck name',{exact:true})).toHaveValue('Retained unsaved name');
    await desktop.evaluate(({app})=>{app.quit();});
    const afterCanceledQuit=await page.evaluate(id=>window.neuroscape.readDeck(id),deckId);
    assert.equal(afterCanceledQuit.ok,true,'Vetoed Quit must leave the local service available for retry');
    await expect(page.getByLabel('Deck name',{exact:true})).toHaveValue('Retained unsaved name');
    await page.getByRole('link',{name:'My decks',exact:true}).click();
    await expect(page).toHaveURL(new RegExp(deckId+'$'));
    injection.exec('DROP TRIGGER reject_deck_write;');
    await page.getByRole('button',{name:'Retry save',exact:true}).click();
    await expect(page.getByRole('status').filter({hasText:'Saved on this device only'})).toBeVisible();
  }finally{injection.close();}
  // This is a normal native Quit after the earlier veto and successful retry.
  await desktop.close();
  desktop=await launch();page=await desktop.firstWindow();page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('link',{name:'My decks',exact:true}).click();
  await page.getByRole('link').filter({hasText:'Retained unsaved name'}).click();
  await expect(page.getByLabel('Deck name',{exact:true})).toHaveValue('Retained unsaved name');
  await page.getByRole('button',{name:'Drawer',exact:true}).click();
  await page.getByRole('button',{name:/View deck/}).click();
  await expect(page.getByRole('dialog',{name:'Deck list',exact:true})).toContainText('My offline plan');
  await page.getByRole('button',{name:'Close deck',exact:true}).click();
  await page.getByRole('button',{name:'Two columns',exact:true}).click();
  const crashFault=new DatabaseSync(join(profileDirectory,'profile.sqlite'));
  try {
    crashFault.exec("CREATE TRIGGER reject_deck_write BEFORE UPDATE ON decks BEGIN SELECT RAISE(FAIL, 'controlled storage fault'); END;");
    await page.getByRole('textbox',{name:'Deck description',exact:true}).fill('Recovered plan after restart');
    await expect(page.getByRole('alert')).toContainText('unsaved edits are still available');
    await desktop.evaluate(({session})=>session.defaultSession.flushStorageData());
    const ownedPids=await desktop.evaluate(({app})=>app.getAppMetrics().map(metric=>metric.pid));
    const child=desktop.process();
    const exited=new Promise(resolve=>child.once('exit',resolve));
    child.kill('SIGKILL');
    for(const pid of ownedPids.filter(pid=>pid!==child.pid)){
      try{process.kill(pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}
    }
    await exited;desktop=undefined;
    await expect.poll(()=>ownedPids.every(pid=>{try{process.kill(pid,0);return false;}catch(error){if(error.code==='ESRCH')return true;throw error;}})).toBe(true);
    crashFault.exec('DROP TRIGGER reject_deck_write;');
  } finally { crashFault.close(); }
  desktop=await launch();page=await desktop.firstWindow();page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('link',{name:'My decks',exact:true}).click();
  await page.getByRole('link').filter({hasText:'Retained unsaved name'}).click();
  await expect(page.getByRole('textbox',{name:'Deck description',exact:true})).toHaveValue('My offline plan');
  await page.getByRole('button',{name:'Restore recovered edits',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Deck description',exact:true})).toHaveValue('Recovered plan after restart');
  await expect.poll(()=>page.evaluate(async id=>{const result=await window.neuroscape.readDeck(id);return result.ok?result.data.description:null;},deckId)).toBe('Recovered plan after restart');
  await expect(page.getByRole('status').filter({hasText:'Saved on this device only'})).toBeVisible();
  // Use the same public player operation to populate a complete validation fixture.
  const seeded=await page.evaluate(async({deckId,frames,basic,runners})=>{
    const read=await window.neuroscape.readDeck(deckId);if(!read.ok)return read;
    return window.neuroscape.saveDeck({...read.data,entries:[{card_id:frames[1].id,section:'mainframe',quantity:1},{card_id:basic.id,section:'ram',quantity:25},...runners.map((card,index)=>({card_id:card.id,section:'cyberdeck',quantity:index===12?2:4}))]},read.data.revision);
  },{deckId,frames,basic,runners});assert.equal(seeded.ok,true);
  await page.getByRole('link',{name:'My decks',exact:true}).click();
  await page.getByRole('link').filter({hasText:'Retained unsaved name'}).click();
  await expect(page.getByText('Valid constructed deck',{exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Deck statistics'})).toContainText('76');
  await desktop.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  desktop=await launch();page=await desktop.firstWindow();page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('link',{name:'My decks',exact:true}).click();
  await page.getByRole('link').filter({hasText:'Retained unsaved name'}).click();
  await expect(page.getByLabel('Deck name',{exact:true})).toHaveValue('Retained unsaved name');
  await expect(page.getByRole('textbox',{name:'Deck description',exact:true})).toHaveValue('Recovered plan after restart');
  await expect(page.getByText('Valid constructed deck',{exact:true})).toBeVisible();
  await expect.poll(()=>page.locator('.deck-entry img').first().evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
  await page.screenshot({path:'.local/deck-reopened.png'});
  assert.deepEqual(errors,[]);
  await writeFile(`.local/decks-${development?'development':'smoke'}.json`,JSON.stringify({development,hostedEditor:true,mainframeReplacement:true,sectionQuantities:true,copyLimitFeedback:true,statisticsAndOpeningHand:true,storageFailureRetainedEdits:true,retryAndNavigationGuard:true,vetoedNativeQuitKeepsService:true,cleanQuitAfterRetry:true,draftRecoveryAfterProcessTermination:true,drawerLayout:true,validFixture:true,reopenedWithSourceStopped:true,localArtwork:true,pageErrors:errors},null,2));
  console.log('PASS: hosted editor, section/copy rules, stats/hand tester, failed-save recovery, local revision persistence and offline reopen.');
}catch(error){const page=desktop&&(await desktop.windows())[0];if(page){await page.screenshot({path:'.local/deck-failure.png'});console.error(await page.locator('body').innerText());}throw error;}
finally{
  if(desktop){
    await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(window=>window.destroy())).catch(()=>{});
    await desktop.close();
  }
  server.closeAllConnections();server.close();
}
