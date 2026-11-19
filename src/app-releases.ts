import {z} from 'zod';
import type {AppReleaseInfo} from './contract';

const version=z.string().regex(/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/);
const https=z.string().max(2048).transform(value=>new URL(value)).refine(url=>url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.search&&!url.hash).transform(url=>url.href);
const sourceSchema=z.object({metadataUrl:https.nullable(),downloadUrl:https.nullable()}).strict().refine(value=>(value.metadataUrl===null)===(value.downloadUrl===null));
const metadata=z.object({format:z.literal('neuroscape-app-release'),version:z.literal(1),release:z.object({version,publishedAt:z.iso.datetime(),notes:z.string().max(8000)}).strict()}).strict();
class InvalidMetadata extends Error {}
function compare(left:string,right:string){const a=left.split('.').map(Number),b=right.split('.').map(Number);for(let i=0;i<3;i++)if(a[i]!==b[i])return Math.sign(a[i]-b[i]);return 0;}
async function readMetadata(response:Response){
  if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'')){await response.body?.cancel();throw new InvalidMetadata();}
  const reader=response.body?.getReader();if(!reader)throw new InvalidMetadata();const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const result=await reader.read();if(result.done)break;size+=result.value.byteLength;if(size>65536){await reader.cancel();throw new InvalidMetadata();}chunks.push(result.value);}}
  finally{reader.releaseLock();}
  try{return metadata.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))));}catch{throw new InvalidMetadata();}
}
interface ReleaseOptions {
  installedVersion:string;source:unknown;fixtureOrigin?:string;
  fetcher:(url:string,init?:RequestInit)=>Promise<Response>;
  opener:(url:string)=>Promise<void>;
}

/** Release checks are read-only network work. The approved download URL is owned by configuration. */
export function createAppReleases(options:ReleaseOptions){
  version.parse(options.installedVersion);let source:z.infer<typeof sourceSchema>|undefined,configurationFailed=false;
  try{
    source=sourceSchema.parse(options.source);
    if(options.fixtureOrigin){const origin=new URL(options.fixtureOrigin);if(origin.protocol!=='http:'||origin.hostname!=='127.0.0.1'||!origin.port||origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password)throw new Error('Invalid controlled release origin.');source={metadataUrl:new URL('release.json',origin).href,downloadUrl:'https://releases.example.test/neuroscape'};}
  }catch{source=undefined;configurationFailed=true;}
  let state:AppReleaseInfo={installedVersion:options.installedVersion,configured:Boolean(source?.metadataUrl),status:configurationFailed?'invalid':source?.metadataUrl?'idle':'unconfigured',downloadAvailable:false,message:configurationFailed?'Release checking is unavailable in this build. Local cards and games remain usable.':source?.metadataUrl?'Check for app releases when you choose.':'Release delivery is not configured for this internal build. Local cards and games remain usable.'};
  let task:Promise<AppReleaseInfo>|null=null;
  function info():AppReleaseInfo{return {...state,...(state.release?{release:{...state.release}}:{})};}
  async function check(){
    if(task)return task;if(!source?.metadataUrl)return info();
    state={...state,status:'checking',downloadAvailable:false,message:'Checking app release information…'};
    task=(async()=>{
      try{
        const response=await options.fetcher(source!.metadataUrl!,{redirect:'error',credentials:'omit',cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
        if(!response.ok){await response.body?.cancel();throw new Error('Release source unavailable.');}
        const result=await readMetadata(response),relative=compare(result.release.version,options.installedVersion);
        state={installedVersion:options.installedVersion,configured:true,status:relative>0?'available':relative===0?'current':'ahead',release:result.release,checkedAt:new Date().toISOString(),downloadAvailable:relative>=0,message:relative>0?'A newer app release is available. Download and install it when you choose.':relative===0?'You have the latest listed app release.':'Your installed build is newer than the listed release.'};
      }catch(error){state={installedVersion:options.installedVersion,configured:true,status:error instanceof InvalidMetadata?'invalid':'unavailable',downloadAvailable:false,message:error instanceof InvalidMetadata?'The release information could not be validated. Retry later or check with the maintainer. Your local games are unchanged.':'The release source could not be reached. Check your connection and retry when you choose. Your local games are unchanged.'};}
      return info();
    })().finally(()=>{task=null;});return task;
  }
  return {info,check,async openDownload(){if(!source?.downloadUrl||!state.downloadAvailable||!['available','current'].includes(state.status))return false;try{await options.opener(source.downloadUrl);return true;}catch{return false;}}};
}
