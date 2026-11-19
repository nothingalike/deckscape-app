import {launchDesktop} from './desktop-launch.mjs';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';

assert.equal(process.platform,'linux');assert.ok(process.env.NEUROSCAPE_EXE,'Select the actual AppImage with NEUROSCAPE_EXE.');
const executable=resolve(process.env.NEUROSCAPE_EXE),profile=await mkdtemp(join(tmpdir(),'neuroscape-image-audit-'));
async function digest(path){const hash=createHash('sha256');for await(const bytes of createReadStream(path))hash.update(bytes);return hash.digest('hex');}
const imageHash=await digest(executable),env={...process.env,NEUROSCAPE_PROFILE_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
const desktop=await launchDesktop({executablePath:executable,env});
try{
 await desktop.firstWindow();
 const runtime=await desktop.evaluate(()=>({image:process.env.APPIMAGE,executable:process.execPath,resources:process.resourcesPath}));
 assert.equal(resolve(runtime.image),executable);assert.equal(basename(runtime.executable),'neuroscape-app');assert.equal(runtime.resources,join(dirname(runtime.executable),'resources'));
 const archive=join(runtime.resources,'app.asar');
 await new Promise((done,reject)=>{const child=spawn(process.execPath,['tools/inspect-package.mjs'],{env:{...process.env,NEUROSCAPE_PACKAGE_ASAR:archive,NEUROSCAPE_SOURCE_IMAGE:executable},stdio:'inherit'});child.once('error',reject);child.once('close',code=>code===0?done():reject(new Error('Mounted image audit failed: '+code)));});
 const audit=JSON.parse(await readFile('.local/package-content-linux.json','utf8'));
 assert.equal(audit.sourceImage.sha256,imageHash);assert.equal(audit.sha256,await digest(archive));assert.equal(await digest(executable),imageHash);
 audit.sourceImage.mountedArchiveVerified=true;await writeFile('.local/package-content-linux.json',JSON.stringify(audit,null,2)+'\n');
 console.log('PASS: mounted application archive audit is bound to the selected AppImage SHA256.');
}finally{await desktop.close();}
