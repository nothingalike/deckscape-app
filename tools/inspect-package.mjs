import * as asar from '@electron/asar';
import {writeFile,mkdir,access} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import assert from 'node:assert/strict';

const archive=resolve(process.env.NEUROSCAPE_PACKAGE_ASAR??'release/win-unpacked/resources/app.asar');
const files=[],findings=[];
const privateName=/(^|\/)(?:\.env(?:\.|$)|\.aws(?:\/|$)|\.headquarters(?:\/|$)|\.git(?:\/|$)|\.local(?:\/|$)|profile\.sqlite(?:-|$)|credentials(?:\.|\/|$))/i;
const patterns=[['private-key',/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],['github-token',/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/],['aws-access-key',/\bAKIA[A-Z0-9]{16}\b/],['openai-project-key',/\bsk-proj-[A-Za-z0-9_-]{20,}/]];
for(const entry of asar.listPackage(archive)){
  const path=entry.replaceAll('\\','/').replace(/^\//,'');
  const archivePath=entry.replace(/^[\\/]/,'');
  const info=asar.statFile(archive,archivePath,false);
  if('files' in info)continue;
  if('link' in info){findings.push({path,kind:'unexpected-link'});continue;}
  files.push({path,bytes:info.size});
  if(privateName.test(path))findings.push({path,kind:'private-operational-path'});
  if(/\.(?:js|cjs|mjs|json|map|txt|css|html)$/i.test(path)){
    const text=asar.extractFile(archive,archivePath).toString('utf8');
    for(const [kind,pattern] of patterns)if(pattern.test(text))findings.push({path,kind});
  }
}
const metadata=JSON.parse(asar.extractFile(archive,'package.json').toString('utf8'));
assert.ok(files.some(file=>file.path==='dist/THIRD_PARTY_NOTICES.txt'),'Production notices must ship.');
const runtime=dirname(dirname(archive));
for(const file of ['LICENSE.electron.txt','LICENSES.chromium.html'])await access(join(runtime,file));
const hash=createHash('sha256');for await(const bytes of createReadStream(archive))hash.update(bytes);
let sourceImage=null;
if(process.env.NEUROSCAPE_SOURCE_IMAGE){const path=resolve(process.env.NEUROSCAPE_SOURCE_IMAGE),imageHash=createHash('sha256');for await(const bytes of createReadStream(path))imageHash.update(bytes);sourceImage={path,sha256:imageHash.digest('hex')};}
const result={archive,sha256:hash.digest('hex'),sourceImage,version:metadata.version,sourceLicense:metadata.license??null,files:files.length,inventory:files,findings,productionNoticesPresent:true,electronAndChromiumNoticesPresent:true,scope:'Actual application archive inventory and named credential-pattern scan. This does not establish source/artwork permission or exhaustively prove that every possible secret is absent.'};
await mkdir('.local',{recursive:true});await writeFile('.local/package-content-'+process.platform+'.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({archive,files:files.length,findings,noticesPresent:true}));assert.equal(findings.length,0,'Package content needs review.');
