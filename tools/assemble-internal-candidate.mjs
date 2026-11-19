import {readFile,writeFile,mkdir,copyFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,join,dirname} from 'node:path';
import assert from 'node:assert/strict';

const json=async path=>JSON.parse(await readFile(path,'utf8'));
async function digest(path){const hash=createHash('sha256');for await(const bytes of createReadStream(path))hash.update(bytes);return hash.digest('hex');}
const packageInfo=await json('package.json'),windows=await json('.local/windows-journey-qualified.json'),linux=await json('.local/linux-journey-qualified.json'),reuse=await json('.local/current-reuse-verification.json'),dependencies=await json('.local/dependency-inventory.json'),signature=await json('.local/windows-internal-signature.json'),host=await json('.local/windows-qualification-host.json'),signingConfig=await json('.local/distribution-config-validation.json');
const audits={windows:await json('.local/package-content-win32.json'),linux:await json('.local/package-content-linux.json')};
assert.equal(windows.success,true);assert.equal(linux.success,true);assert.deepEqual(linux.matrix.map(row=>row.display).sort(),['wayland','x11']);assert.ok(linux.matrix.every(row=>row.tests===215&&row.steps===30&&row.appImageSha256===linux.artifact.sha256));assert.equal(reuse.allLocalHashesMatch,true);assert.equal(reuse.allReferenceHashesMatch,true);assert.equal(reuse.referenceUnchanged,true);assert.deepEqual(dependencies.missing,[]);
for(const audit of Object.values(audits)){assert.deepEqual(audit.findings,[]);assert.equal(audit.productionNoticesPresent,true);assert.equal(audit.electronAndChromiumNoticesPresent,true);assert.equal(audit.version,packageInfo.version);}
assert.equal(audits.windows.sha256,windows.artifact.appAsarSha256);
assert.equal(audits.linux.sourceImage?.sha256,linux.artifact.sha256,'The Linux audit must match the collected AppImage.');
assert.equal(audits.linux.sourceImage?.mountedArchiveVerified,true,'Scan the actual mounted AppImage archive.');
const folder=resolve('release/internal-candidates/'+packageInfo.version+'-'+randomUUID().slice(0,8));await mkdir(dirname(folder),{recursive:true});await mkdir(folder);
const files=[];
async function collect(source,relative,expected){const target=join(folder,relative),sha256=await digest(source);if(expected)assert.equal(sha256,expected,source);await mkdir(dirname(target),{recursive:true});await copyFile(source,target);assert.equal(await digest(target),sha256);files.push({path:relative,bytes:(await stat(target)).size,sha256});}
await collect('release/Neuroscape Local Setup '+packageInfo.version+'.exe','windows/Neuroscape Local Setup '+packageInfo.version+'.exe',windows.artifact.installerSha256);
await collect('release/linux/Neuroscape Local-'+packageInfo.version+'.AppImage','linux/Neuroscape Local-'+packageInfo.version+'.AppImage',linux.artifact.sha256);
for(const [source,target] of [['dist/THIRD_PARTY_NOTICES.txt','notices/THIRD_PARTY_NOTICES.txt'],['release/win-unpacked/LICENSE.electron.txt','notices/LICENSE.electron.txt'],['release/win-unpacked/LICENSES.chromium.html','notices/LICENSES.chromium.html'],['docs/distribution-prerequisites.md','records/distribution-prerequisites.md'],['docs/release-candidate.md','records/release-candidate.md'],['docs/reuse-manifest.json','records/reuse-manifest.json'],['.local/dependency-inventory.json','records/dependency-inventory.json'],['.local/package-content-win32.json','records/package-content-win32.json'],['.local/package-content-linux.json','records/package-content-linux.json'],['.local/distribution-config-validation.json','records/distribution-config-validation.json']])await collect(source,target);
const gates=[
 {id:'source-license',state:'unmet',detail:'The intended MIT source license requires source-owner authority for the actually reused files. No source license has been assigned.'},
 {id:'official-integration',state:'unmet',detail:'The user is locating the applicable API/download/caching agreement. No provider contact occurred.'},
 {id:'artwork',state:'unmet',detail:'Record the rights-holder basis for intended artwork and bundled presentation-asset use; attribution is retained.'},
 {id:'mac-arm64',state:'unmet',detail:'Prepared for user execution; no native artifact or qualification result exists.'},
 {id:'mac-x64',state:'unmet',detail:'Prepared for user execution; distinguish native Intel from Rosetta.'},
 {id:'windows-signing',state:signature.status==='Valid'?'needs-publisher-verification':'unmet',detail:'Observed installer signature status: '+signature.status+'. An authorized signing identity and verified final signed artifacts are required.'},
 {id:'mac-signing-notarization',state:'unmet',detail:'Signed/notarized builds, stapling and Gatekeeper acceptance require an authorized native host and credentials. The prepared configuration is schema-validated only.'},
 {id:'linux-native-integration',state:'unmet',detail:'Automated WSLg X11/Wayland journeys pass; native chooser completion, real browser handoff and physical Linux desktop qualification remain open.'},
 {id:'release-delivery',state:'unmet',detail:'App release metadata and download targets remain null. No approved public delivery location or publication is recorded.'},
 {id:'dependency-notices',state:'verified',detail:dependencies.packages.length+' production packages have license declarations/texts; app/Electron/Chromium notices are retained.'},
 {id:'private-inputs',state:'verified-with-limits',detail:'Both actual application archives were inventoried with no detected private operational paths or named credential patterns. The scan scope is recorded; it is not exhaustive secret detection.'},
];
const record={version:1,appVersion:packageInfo.version,created:new Date().toISOString(),status:'internal',publicReleaseReady:false,folder,files,source:{referenceHead:reuse.referenceHead,artifacts:reuse.files,localAndReferenceHashesVerified:true,referenceUnchanged:true,sourceLicense:audits.windows.sourceLicense},platforms:{windows:{host,qualification:windows.run,tests:windows.regressions,expectedLinuxOnlySkip:1,installerSignature:signature.status},linux:{host:linux.artifact.distribution,displayHost:linux.artifact.displayHost,kernel:linux.artifact.kernel,matrix:linux.matrix,linuxToInstalledWindows:true},macArm64:{artifact:null,qualification:null},macX64:{artifact:null,qualification:null}},gates,signingPreparation:signingConfig,evidence:{windows:'http://localhost:4321/f/neuroscape-app/general/reviews/2026-11-15-2225-installed-windows-player-journey',linux:'http://localhost:4321/f/neuroscape-app/general/reviews/2026-11-15-2320-linux-offline-player-journey',macProcedure:'http://localhost:4321/f/neuroscape-app/general/reports/2026-11-15-2130-mac-qualification-procedure'},boundaries:{publicationPerformed:false,providerContactPerformed:false,credentialsAcquired:false,hostedServiceChanged:false,commitsOrPushesPerformed:false}};
await writeFile(join(folder,'manifest.json'),JSON.stringify(record,null,2)+'\n');await writeFile('.local/internal-candidate.json',JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({folder,files:files.length,publicReleaseReady:false,unmetGates:gates.filter(gate=>gate.state==='unmet').map(gate=>gate.id)}));
