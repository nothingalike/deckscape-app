import type {EventEmitter} from 'node:events';

/** Bound initial responsiveness, then allow acknowledged backup/validation to finish or fail. */
export function waitForProfileService(service:EventEmitter):Promise<void>{
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>finish(new Error('The local service did not start. Existing data is preserved.')),15000);
    function finish(error?:Error){clearTimeout(timer);service.removeListener('message',message);service.removeListener('exit',exited);error?reject(error):resolve();}
    function message(value:any){
      if(value?.type==='startup-progress'){clearTimeout(timer);return;}
      if(value?.type==='ready')finish();
      else if(value?.type==='startup-failed')finish(new Error(typeof value.message==='string'?value.message:'The local profile could not open. Existing data is preserved.'));
    }
    function exited(){finish(new Error('The local service stopped before it became available. Existing data is preserved.'));}
    service.on('message',message);service.on('exit',exited);
  });
}
