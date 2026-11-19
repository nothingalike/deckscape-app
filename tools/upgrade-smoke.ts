import {launchDesktop} from './desktop-launch.mjs';
import {expect,type ElectronApplication} from '@playwright/test';
import {readFile,writeFile,readdir,mkdtemp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {resolveProfileLocation,writeProfileRelease} from '../src/profile-location';
import {stageProfileArchive} from '../src/profile-archive';
import {openApplication} from '../src/application';
function records(directory:string){const db=new DatabaseSync(join(directory,'profile.sqlite'),{readOnly:true});try{return Object.fromEntries(['profile','catalog_snapshots','catalog_cards','catalog_active','catalog_runs','decks','solo_setups','matches','match_receipts','setup_receipts'].map(table=>[table,db.prepare(table==='solo_setups'?'SELECT id,created_at,selection,payload FROM solo_setups ORDER BY id':`SELECT * FROM ${table} ORDER BY rowid`).all()]));}finally{db.close();}}
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
async function main(){
  const fixture=JSON.parse(await readFile('.local/upgrade-ui-profile.json','utf8')),beforeMode=process.argv.includes('--before'),schema7=process.argv.includes('--schema7'),executablePath=resolve(process.env.NEUROSCAPE_EXE??'release/win-unpacked/Neuroscape Local.exe'),env={...process.env,NEUROSCAPE_PROFILE_DIR:fixture.profileDirectory};delete env.ELECTRON_RUN_AS_NODE;
  let desktop:ElectronApplication|undefined;const errors:string[]=[];
  async function launch(){desktop=await launchDesktop({executablePath,env});assert.equal(await desktop.evaluate(async({session,net})=>{session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true}));try{await net.fetch('https://www.neuroscapetcg.com/',{cache:'no-store'});return false;}catch{return true;}}),true);const page=await desktop.firstWindow();page.on('pageerror',error=>errors.push(error.message));return page;}
  async function resume(page:Awaited<ReturnType<typeof launch>>){await page.getByRole('navigation').getByRole('link',{name:'Fight a bot',exact:true}).click();await page.getByRole('link',{name:'Resume game '+fixture.id.slice(0,8),exact:true}).click();await expect(page.getByRole('button',{name:'Install 1 RAM',exact:true})).toBeEnabled();}
  try{
    let page=await launch();assert.equal(await desktop!.evaluate(({app})=>app.getVersion()),beforeMode?'0.1.0':'0.2.0');
    assert.deepEqual(await page.evaluate(()=>window.neuroscape.listDecks()),{ok:true,data:fixture.decks});assert.deepEqual(await page.evaluate(id=>window.neuroscape.readMatch(id),fixture.id),fixture.before);
    if(beforeMode){await resume(page);await page.screenshot({path:'.local/upgrade-before.png'});await desktop!.close();desktop=undefined;
      if(schema7){const db=new DatabaseSync(join(fixture.profileDirectory,'profile.sqlite'));db.exec('ALTER TABLE solo_setups DROP COLUMN updated_at; PRAGMA user_version=7;');db.close();writeProfileRelease(fixture.profileDirectory,'0.1.0',7);}
      await writeFile('.local/upgrade-before.json',JSON.stringify({executablePath,version:'0.1.0',schemaVersion:schema7?7:8,explicitPredecessorFixture:schema7,sha256:sha(await readFile(join(fixture.profileDirectory,'profile.sqlite'))),records:records(fixture.profileDirectory)},null,2));console.log('PASS: actual 0.1.0 artifact opened the original deck and pending game offline.');return;
    }
    const previous=JSON.parse(await readFile('.local/upgrade-before.json','utf8')),location=resolveProfileLocation(fixture.profileDirectory);assert.ok(location.generation);assert.equal(sha(await readFile(join(fixture.profileDirectory,'profile.sqlite'))),previous.sha256);assert.deepEqual(JSON.parse(JSON.stringify(records(location.directory))),previous.records);
    const copies=await readdir(join(fixture.profileDirectory,'recovery-backups'));assert.equal(copies.length,1);const recoveryPath=join(fixture.profileDirectory,'recovery-backups',copies[0]),inspection=await mkdtemp(join(tmpdir(),'neuroscape-upgrade-recovery-')),staged=await stageProfileArchive(recoveryPath,inspection);assert.equal(staged.manifest.appVersion,'0.1.0');assert.equal(staged.sourceSchemaVersion,previous.schemaVersion);
    const recovered=openApplication({profileDirectory:staged.directory});try{assert.deepEqual(await recovered.execute({type:'match.read',id:fixture.id}),fixture.before);}finally{await recovered.close();}
    await page.getByRole('link',{name:'Backups',exact:true}).click();await expect(page.getByRole('region',{name:'Restore profile',exact:true}).getByRole('status')).toContainText('App upgraded.');await page.screenshot({path:'.local/upgrade-complete.png',fullPage:true});
    await resume(page);await page.getByRole('button',{name:'Install 1 RAM',exact:true}).click();await expect.poll(async()=>{const result=await page.evaluate(id=>window.neuroscape.readMatch(id),fixture.id);return result.ok&&result.data.phase==='game'?result.data.snapshot.view.revision:-1;}).toBeGreaterThan(fixture.before.data.snapshot.view.revision);const after=await page.evaluate(id=>window.neuroscape.readMatch(id),fixture.id);await page.screenshot({path:'.local/upgrade-resumed.png'});
    await desktop!.close();desktop=undefined;page=await launch();assert.deepEqual(await page.evaluate(id=>window.neuroscape.readMatch(id),fixture.id),after);assert.deepEqual(await readdir(join(fixture.profileDirectory,'recovery-backups')),copies);assert.deepEqual(errors,[]);
    await writeFile('.local/profile-upgrade-ui.json',JSON.stringify({executablePath,predecessorExecutable:previous.executablePath,fromVersion:'0.1.0',toVersion:'0.2.0',sourceSchemaVersion:previous.schemaVersion,explicitPredecessorFixture:previous.explicitPredecessorFixture,profileDirectory:fixture.profileDirectory,generation:location.generation,previousDatabaseUnchanged:true,allRecordsPreserved:true,recoveryBackupVerified:true,originalMatchResumed:true,reopenedAfterPlayerAction:true,noRepeatedUpgrade:true,httpHttpsDenied:true,pageErrors:errors},null,2));console.log('PASS: packaged 0.1.0 to 0.2.0 upgrade, preserved records/pins, recovery ZIP and offline original match resume/reopen.');
  }catch(error){if(desktop){const page=(await desktop.windows())[0];if(page)await page.screenshot({path:'.local/upgrade-failure.png',timeout:5000}).catch(()=>{});}throw error;}
  finally{await desktop?.close();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
