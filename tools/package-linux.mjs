import {spawnSync} from 'node:child_process';
if(process.platform!=='linux'||process.arch!=='x64'){
  console.error('Linux packaging requires a Linux x64 build host. No packaging was run.');process.exit(1);
}
const run=args=>{const result=spawnSync(process.execPath,args,{stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);};
run(['tools/build.mjs']);
run(['node_modules/electron-builder/cli.js','--linux','AppImage','--x64','--publish','never']);
