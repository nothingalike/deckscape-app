import { Button } from './ui/button';
import {useEffect,useState} from 'react';
import type {AppReleaseInfo,CatalogStatus} from '../contract';

export function AppReleaseScreen(){
  const[info,setInfo]=useState<AppReleaseInfo|null>(null),[catalog,setCatalog]=useState<CatalogStatus|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  useEffect(()=>{let disposed=false;void Promise.all([window.neuroscape.appReleaseInfo(),window.neuroscape.catalogStatus()]).then(([release,cards])=>{if(disposed)return;if(release.ok)setInfo(release.data);else setError(release.error.message);if(cards.ok)setCatalog(cards.data);}).catch(()=>{if(!disposed)setError('App information is unavailable. Reopen the app and retry.');});return()=>{disposed=true;};},[]);
  async function check(){setBusy(true);setError('');setNotice('');try{const result=await window.neuroscape.checkAppRelease();if(result.ok)setInfo(result.data);else setError(result.error.message);}catch{setError('Release checking is unavailable. Local games remain usable. Retry when you choose.');}finally{setBusy(false);}}
  async function download(){setNotice('');try{setNotice(await window.neuroscape.openAppDownload()?'Opened the release download page in your browser. Install the release when you choose.':'The download page could not be opened. Check release information and retry.');}catch{setNotice('The download page could not be opened. Retry when you choose.');}}
  return <section className="app-release-screen"><h1>App &amp; updates</h1>
    <p className="intro">App releases supply the game rules and bot support included with the program. You choose when to download and install a release.</p>
    <section aria-label="App releases"><h2>Installed app</h2><p>Version <strong>{info?.installedVersion??'…'}</strong></p>
      <Button onClick={check} disabled={busy||!info?.configured}>{busy?'Checking releases…':'Check app releases'}</Button>
      {(error||info?.message)&&<p role={error||['invalid','unavailable'].includes(info?.status??'')?'alert':'status'} className={error?'error-message':'release-message'}>{error||info?.message}</p>}
      {info?.release&&<div className="release-details"><h3>Latest listed release: {info.release.version}</h3><p className="muted">Published {new Date(info.release.publishedAt).toLocaleDateString()}</p><p className="release-notes">{info.release.notes}</p></div>}
      {info?.downloadAvailable&&<Button variant="secondary" disabled={busy} onClick={download}>Open download page</Button>}
      {notice&&<p role="status" className="release-message">{notice}</p>}
    </section>
    <section className="card-update-summary" aria-label="Card updates"><h2>Downloaded cards</h2><p>Card updates refresh your catalog and artwork. New playable mechanics arrive in app releases.</p>
      {catalog&&<><p>{catalog.count} cards on this device</p><p>Last successful card update: {catalog.lastSyncedAt?new Date(catalog.lastSyncedAt).toLocaleString():'No successful download yet'}</p></>}
      <a href="#/cards">Manage card updates</a>
    </section>
  </section>;
}
