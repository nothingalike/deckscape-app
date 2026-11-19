import {readdir,readFile,mkdir,copyFile,writeFile,rename,rm,open} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {ZipFile} from 'yazl';

const repo=resolve('.'),id=randomUUID(),stage=join(repo,'.local/qualification-staging',id),output=join(repo,'release/mac-qualification-source.zip'),temporary=output+'.'+id+'.tmp';
const files=[];
async function digest(path){const hash=createHash('sha256');let size=0;for await(const bytes of createReadStream(path)){size+=bytes.length;hash.update(bytes);}return {size,sha256:hash.digest('hex')};}
async function copy(relative){const source=join(repo,relative),info=await import('node:fs/promises').then(fs=>fs.lstat(source));if(info.isSymbolicLink())throw new Error('Qualification source includes an unexpected link: '+relative);
  if(info.isDirectory()){for(const entry of await readdir(source))await copy(relative+'/'+entry);return;}
  if(!info.isFile())throw new Error('Unsupported qualification source: '+relative);const target=join(stage,relative);await mkdir(dirname(target),{recursive:true});await copyFile(source,target);files.push({path:relative,...await digest(target)});
}
try{
  await mkdir(stage,{recursive:true});
  for(const path of ['src','tests','tools','docs','build','.scratch','package.json','package-lock.json','tsconfig.json','electron-builder.distribution.cjs','AGENTS.md','GLOSSARY.md','README.md','.local/portability-fixtures'])await copy(path);
  const packageInfo=JSON.parse(await readFile('package.json','utf8'));
  await writeFile(join(stage,'qualification-source.json'),JSON.stringify({version:1,appVersion:packageInfo.version,createdAt:new Date().toISOString(),privateFixture:true,files},null,2));
  await mkdir(dirname(output),{recursive:true});const zip=new ZipFile(),stream=createWriteStream(temporary,{flags:'wx'});zip.on('error',error=>stream.destroy(error));for(const file of files)zip.addFile(join(stage,file.path),'neuroscape-app/'+file.path,{compress:!file.path.endsWith('.zip')});zip.addFile(join(stage,'qualification-source.json'),'neuroscape-app/qualification-source.json');const written=pipeline(zip.outputStream,stream);zip.end();await written;const handle=await open(temporary,'r+');try{await handle.sync();}finally{await handle.close();}await rename(temporary,output);
  const result={path:output,...await digest(output),files:files.length,appVersion:packageInfo.version,privateFixture:true};await writeFile('.local/mac-qualification-bundle.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{
  if(dirname(stage)!==join(repo,'.local/qualification-staging'))throw new Error('Invalid qualification staging path.');await rm(stage,{recursive:true,force:true});await rm(temporary,{force:true});
}
