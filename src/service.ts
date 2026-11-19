import { startApplication,ProfileUpgradeError } from './startup';
import { controlledCatalogSource, officialCatalogSource } from './catalog';
import { net } from 'electron';

const parent = process.parentPort;
if (!parent) throw new Error('The local service requires its application host.');
async function start(){
let progress='Opening the local profile…';const heartbeat=setInterval(()=>parent!.postMessage({type:'startup-progress',message:progress}),1000);
try{
const application = await startApplication({ profileDirectory: process.argv[2],onUpgradeProgress:message=>{progress=message;parent!.postMessage({type:'startup-progress',message});},
  catalogSource: process.env.NEUROSCAPE_CATALOG_FIXTURE_ORIGIN
    ? controlledCatalogSource(process.env.NEUROSCAPE_CATALOG_FIXTURE_ORIGIN, (url, init) => net.fetch(url, init))
    : officialCatalogSource((url, init) => net.fetch(url, init)) });
application.onMatchRevision(notice => parent!.postMessage({ type: 'match-revision', ...notice }));
application.onProfileRestart(()=>parent!.postMessage({type:'profile-restart'}));
parent!.on('message', async ({ data }) => {
  if (data?.type === 'shutdown') {
    await application.close();
    process.exit(0);
  }
  if (!Number.isSafeInteger(data?.id)) return;
  const result = await application.execute(data.request);
  parent!.postMessage({ id: data.id, result });
});
parent!.postMessage({ type: 'ready' });
}catch(error){parent!.postMessage({type:'startup-failed',message:error instanceof ProfileUpgradeError?error.message:'The local profile could not be opened. Existing data is preserved. Keep the profile folder and use a compatible app release or restore a recovery ZIP.'});setTimeout(()=>process.exit(1),50);}
finally{clearInterval(heartbeat);}
}
void start();
