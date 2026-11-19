import {spawnSync,execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {release} from 'node:os';

if(process.platform!=='darwin'){
  console.error('Mac packaging requires a macOS build host. No packaging was run.');process.exit(1);
}
const productVersion=execFileSync('sw_vers',['-productVersion'],{encoding:'utf8'}).trim();
if(Number(productVersion.split('.')[0])<13||!['arm64','x64'].includes(process.arch))throw new Error('Use a supported macOS 13+ Intel or Apple Silicon build host.');
const selected=process.argv.find(value=>value.startsWith('--arch='))?.slice(7)??process.arch;
if(!['arm64','x64','both'].includes(selected))throw new Error('Choose --arch=arm64, --arch=x64 or --arch=both.');
let translated=false;try{translated=execFileSync('sysctl',['-in','sysctl.proc_translated'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()==='1';}catch{}
const buildEnvironment={...process.env,CSC_IDENTITY_AUTO_DISCOVERY:'false'};
for(const key of ['CSC_LINK','CSC_KEY_PASSWORD','CSC_NAME','CSC_KEYCHAIN','APPLE_ID','APPLE_APP_SPECIFIC_PASSWORD','APPLE_TEAM_ID','APPLE_API_KEY','APPLE_API_KEY_ID','APPLE_API_ISSUER'])delete buildEnvironment[key];
const run=args=>{const result=spawnSync(process.execPath,args,{stdio:'inherit',env:buildEnvironment});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);};
run(['tools/build.mjs']);
run(['node_modules/electron-builder/cli.js','--mac','dmg',...(selected==='both'?['--arm64','--x64']:['--'+selected]),'--publish','never','-c.mac.identity=-','-c.mac.hardenedRuntime=false','-c.mac.notarize=false','-c.mac.minimumSystemVersion=13.0']);
await mkdir('.local',{recursive:true});
await writeFile('.local/mac-build.json',JSON.stringify({platform:process.platform,buildArchitecture:process.arch,selectedArchitecture:selected,macOS:productVersion,kernel:release(),translated,signing:'ad-hoc internal build; not notarized',published:false,output:resolve('release'),builtAt:new Date().toISOString()},null,2));
console.log('Built internal Mac artifact(s). Run the installed profile/rendering qualification on each target architecture before claiming acceptance.');
