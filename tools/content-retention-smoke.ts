import {launchDesktop} from './desktop-launch.mjs';
import {expect, type ElectronApplication} from '@playwright/test';
import {readFile,writeFile,access,mkdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {join,resolve} from 'node:path';
import {createServer} from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {png} from '../tests/fixtures/catalog';

async function main(){
  const fixture=JSON.parse(await readFile('.local/solo-ui-profile.json','utf8'));
  const checkpoints=JSON.parse(await readFile('.local/resume-ui-profile.json','utf8'));
  assert.equal(fixture.profileDirectory,checkpoints.profileDirectory);
  const saved=checkpoints.cases.find((item:{kind:string})=>item.kind==='player');
  const db=new DatabaseSync(join(fixture.profileDirectory,'profile.sqlite'),{readOnly:true});
  let cards;
  try{cards=db.prepare('SELECT c.payload FROM catalog_cards c JOIN catalog_active a ON a.snapshot_id=c.snapshot_id').all().map(row=>JSON.parse(String(row.payload)));}finally{db.close();}
  const removed=cards.find(card=>card.id===fixture.playerCardId)!;
  const incoming=cards.filter(card=>card.id!==removed.id).map(card=>structuredClone(card.raw));
  const changed=incoming.find(card=>card.card_type==='program')!;changed.rules_text+=' Changed source mechanics.';
  const server=createServer((request,response)=>{
    if(request.url?.startsWith('/cards')){
      const offset=Number(new URL(request.url,'http://127.0.0.1').searchParams.get('offset'));
      response.setHeader('Content-Type','application/json');response.end(JSON.stringify({cards:incoming.slice(offset,offset+100),total:incoming.length,has_more:offset+100<incoming.length,offset}));
    }else if(request.url==='/artwork'){response.setHeader('Content-Type','image/png');response.end(png);}
    else {response.writeHead(404);response.end();}
  });
  await new Promise<void>(ready=>server.listen(0,'127.0.0.1',ready));
  const address=server.address();assert.ok(address && typeof address!=='string');
  const development=process.argv.includes('--development'),executablePath=resolve(development?'node_modules/electron/dist/electron.exe':process.env.NEUROSCAPE_EXE??'release/win-unpacked/Neuroscape Local.exe');
  const env={...process.env,NEUROSCAPE_PROFILE_DIR:fixture.profileDirectory,NEUROSCAPE_CATALOG_FIXTURE_ORIGIN:`http://127.0.0.1:${address.port}/`};delete env.ELECTRON_RUN_AS_NODE;
  let desktop:ElectronApplication|undefined;const errors:string[]=[];let confirmations=0;
  async function launch(){desktop=await launchDesktop({executablePath,args:development?['.']:[],env});const page=await desktop.firstWindow();page.on('pageerror',error=>errors.push(error.message));return page;}
  try{
    let page=await launch();
    const origin=await page.evaluate(id=>window.neuroscape.readDeck(id),fixture.supportedId);assert.ok(origin.ok);
    await page.evaluate(id=>{location.hash='/decks/'+id;},fixture.supportedId);
    await page.getByLabel('Deck name',{exact:true}).fill('Edited after admission');
    await expect(page.getByRole('status').filter({hasText:'Saved on this device only'})).toBeVisible();
    page.once('dialog',async dialog=>{confirmations++;assert.equal(dialog.type(),'confirm');await dialog.dismiss();});
    await page.getByRole('button',{name:'Delete deck',exact:true}).click();
    assert.equal((await page.evaluate(id=>window.neuroscape.readDeck(id),fixture.supportedId)).ok,true);
    assert.equal(confirmations,1);
    page.once('dialog',async dialog=>{confirmations++;await dialog.accept();});
    await page.getByRole('button',{name:'Delete deck',exact:true}).click();
    await expect(page.getByRole('heading',{name:'My decks',exact:true})).toBeVisible();
    assert.equal((await page.evaluate(id=>window.neuroscape.readDeck(id),fixture.supportedId)).ok,false);assert.equal(confirmations,2);
    assert.deepEqual(await page.evaluate(id=>window.neuroscape.readMatch(id),saved.id),saved.before);
    const unknown=randomUUID();
    const repair=await page.evaluate(({deck,unknown})=>window.neuroscape.importDeck({format:'json',text:JSON.stringify({format:'deckscape-backup',version:1,
      deck:{...deck,name:'Repairable retained draft',entries:[...deck.entries,{card_id:unknown,section:'sideboard',quantity:1}]}})}),{deck:origin.data,unknown});assert.ok(repair.ok);
    await page.getByRole('link',{name:'Cards',exact:true}).click();
    await page.getByRole('button',{name:'Update cards',exact:true}).click();
    await expect.poll(async()=>{const status=await page.evaluate(()=>window.neuroscape.catalogStatus());return status.ok && !status.data.running ? status.data.progress?.phase : '';},{timeout:60000}).toBe('complete');
    const current=await page.evaluate(name=>window.neuroscape.listCards({search:name}),removed.name);assert.ok(current.ok);assert.equal(current.data.items.find(card=>card.id===removed.id)?.source_missing,true);
    assert.deepEqual(await page.evaluate(id=>window.neuroscape.readMatch(id),saved.id),saved.before);
    await page.evaluate(id=>{location.hash='/cards/'+id;},removed.id);
    await expect(page.getByRole('dialog')).toContainText('Not in latest official catalog');
    await page.screenshot({path:'.local/retention-missing-card.png'});
    await page.getByRole('button',{name:'Close card preview',exact:true}).click();
    await page.evaluate(id=>{location.hash='/decks/'+id;},repair.data.id);
    await expect(page.getByText('Unknown card (1)',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Remove unknown card',exact:true}).click();
    await expect.poll(async()=>{const deck=await page.evaluate(id=>window.neuroscape.readDeck(id),repair.data.id);return deck.ok && !deck.data.entries.some(entry=>entry.card_id===unknown);}).toBe(true);
    await page.evaluate(id=>{location.hash='/solo/'+id;},repair.data.id);
    await expect(page.getByRole('region',{name:'Player deck checks'})).toContainText('artwork changed');
    await expect(page.getByRole('button',{name:'Create match setup',exact:true})).toBeDisabled();
    await expect(page.getByRole('region',{name:'Resume matches'})).toContainText('Saved matches keep their original cards and rules');
    await page.screenshot({path:'.local/retention-new-admission.png'});
    await desktop!.close();desktop=undefined;
    const stage=join(fixture.profileDirectory,'staging',randomUUID());await mkdir(stage,{recursive:true});await writeFile(join(stage,'partial'),'abandoned');
    page=await launch();
    assert.equal(await desktop!.evaluate(async({session,net})=>{session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true}));try{await net.fetch('https://www.neuroscapetcg.com/');return false;}catch{return true;}}),true);
    await assert.rejects(access(stage));
    assert.deepEqual(await page.evaluate(id=>window.neuroscape.readMatch(id),saved.id),saved.before);
    assert.equal(createHash('sha256').update(await readFile(join(fixture.profileDirectory,'artwork',removed.image_path))).digest('hex'),removed.image_hash);
    await page.getByRole('link',{name:'Fight a bot',exact:true}).click();
    await page.getByRole('link',{name:'Resume game '+saved.id.slice(0,8),exact:true}).click();
    await expect(page.getByRole('button',{name:'Install 1 RAM',exact:true})).toBeEnabled();
    const image=Object.values(saved.before.data.snapshot.presentations).find((item:any)=>item.artworkUrl) as {artworkUrl:string};assert.ok(image);
    assert.equal(await page.evaluate(async url=>{const response=await fetch(url);const image=await createImageBitmap(await response.blob());const valid=image.width>1;image.close();return response.ok && valid;},image.artworkUrl),true);
    await page.getByRole('button',{name:'Install 1 RAM',exact:true}).click();
    await expect.poll(async()=>{const match=await page.evaluate(id=>window.neuroscape.readMatch(id),saved.id);return match.ok && match.data.phase==='game' ? match.data.snapshot.view.revision : -1;}).toBeGreaterThan(saved.before.data.snapshot.view.revision);
    await page.screenshot({path:'.local/retention-resumed.png'});
    assert.deepEqual(errors,[]);
    await writeFile('.local/content-retention-ui.json',JSON.stringify({development,executablePath,profileDirectory:fixture.profileDirectory,confirmationCancelAndAccept:true,deckDeleted:true,changedCatalogActivated:true,retainedCardVisible:true,unresolvedRepair:true,newAdmissionBlocked:true,originalMatchUnchanged:true,stagingCleaned:true,oldArtworkDecoded:true,offlineReopenAndAction:true,pageErrors:errors},null,2));
    console.log('PASS: confirmed deletion, changed catalog, retained/repairable drafts and unchanged offline saved match with original artwork.');
  }finally{if(desktop){await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(window=>window.destroy())).catch(()=>{});await desktop.close();}server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
