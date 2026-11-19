import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppReleases} from '../src/app-releases';
const source={metadataUrl:'https://updates.example.test/neuroscape.json',downloadUrl:'https://downloads.example.test/neuroscape'};
const feed=(version='0.2.1')=>({format:'neuroscape-app-release',version:1,release:{version,publishedAt:'2026-11-15T12:00:00.000Z',notes:'A qualified app release.'}});

test('an unconfigured internal build reports its installed version without network or download actions',async()=>{
  const releases=createAppReleases({installedVersion:'0.2.0',source:{metadataUrl:null,downloadUrl:null},fetcher:async()=>{throw new Error('Unconfigured builds cannot fetch.');},opener:async()=>{throw new Error('Unconfigured builds cannot open downloads.');}});
  assert.equal(releases.info().status,'unconfigured');assert.equal((await releases.check()).installedVersion,'0.2.0');assert.equal(await releases.openDownload(),false);
});
for(const[version,status,canDownload]of[['0.2.0','current',true],['0.2.10','available',true],['0.1.9','ahead',false]] as const)test(`release ${version} is ${status} and uses only the configured external location`,async()=>{
  const calls:string[]=[],releases=createAppReleases({installedVersion:'0.2.0',source,fetcher:async(url,init)=>{assert.equal(url,source.metadataUrl);assert.equal(init?.redirect,'error');assert.equal(init?.credentials,'omit');return Response.json(feed(version));},opener:async url=>{calls.push(url);}});
  assert.equal(await releases.openDownload(),false);const info=await releases.check();assert.equal(info.status,status);assert.equal(info.downloadAvailable,canDownload);assert.equal(await releases.openDownload(),canDownload);assert.deepEqual(calls,canDownload?[source.downloadUrl]:[]);
});
for(const invalid of ['file:///profile.sqlite','https://user:secret@updates.example.test/latest','javascript:alert(1)','https://updates.example.test:444/latest'])test(`unsafe release configuration ${invalid.split(':')[0]} is disabled`,async()=>{
  const releases=createAppReleases({installedVersion:'0.2.0',source:{...source,metadataUrl:invalid},fetcher:async()=>{throw new Error('Invalid configuration must not fetch.');},opener:async()=>{throw new Error('Invalid configuration must not open.');}});assert.equal((await releases.check()).status,'invalid');assert.equal(await releases.openDownload(),false);
});
for(const failure of ['malformed','oversized','unavailable','wrong-type','redirect'] as const)test(`release metadata ${failure} leaves a retryable honest state`,async()=>{
  let retry=false;const releases=createAppReleases({installedVersion:'0.2.0',source,fetcher:async()=>{if(retry)return Response.json(feed());if(failure==='unavailable'||failure==='redirect')throw new Error('Controlled network failure');if(failure==='wrong-type')return new Response('<html>wrong response</html>',{headers:{'content-type':'text/html'}});if(failure==='oversized')return new Response(' '.repeat(65537),{headers:{'content-type':'application/json'}});return Response.json({...feed(),release:{...feed().release,version:'not-a-version',downloadUrl:'https://unapproved.example.test/'}});},opener:async()=>{throw new Error('Failed checks must not open a download.');}});
  assert.equal((await releases.check()).status,['unavailable','redirect'].includes(failure)?'unavailable':'invalid');assert.equal(await releases.openDownload(),false);retry=true;assert.equal((await releases.check()).status,'available');
});

test('an unsafe download target or partial configuration cannot enable external opening',async()=>{
  for(const config of [{...source,downloadUrl:'file:///unapproved.exe'},{...source,metadataUrl:null}]){const releases=createAppReleases({installedVersion:'0.2.0',source:config,fetcher:async()=>{throw new Error('Unsafe configuration must not fetch.');},opener:async()=>{throw new Error('Unsafe configuration must not open.');}});assert.equal((await releases.check()).status,'invalid');assert.equal(await releases.openDownload(),false);}
});

test('concurrent checks share one request and disable download until fresh metadata is validated',async()=>{
  let finish:(value:Response)=>void=()=>{},calls=0;const releases=createAppReleases({installedVersion:'0.2.0',source,fetcher:()=>{calls++;return new Promise<Response>(done=>{finish=done;});},opener:async()=>{}});
  const first=releases.check(),second=releases.check();assert.equal(calls,1);assert.equal(releases.info().status,'checking');assert.equal(await releases.openDownload(),false);finish(Response.json(feed()));assert.equal((await first).status,'available');assert.equal((await second).status,'available');
});
