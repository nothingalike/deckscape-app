import { Button } from './ui/button';
import {useEffect,useState} from 'react';
import type {BackupStatus,RestoreStatus} from '../contract';

export function BackupScreen(){
  const[status,setStatus]=useState<BackupStatus|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
  const[restore,setRestore]=useState<RestoreStatus|null>(null),[restoreBusy,setRestoreBusy]=useState(false),[restoreNotice,setRestoreNotice]=useState(''),[restoreError,setRestoreError]=useState('');
  useEffect(()=>{
    let disposed=false;const read=async()=>{try{const[result,restored]=await Promise.all([window.neuroscape.profileBackupStatus(),window.neuroscape.profileRestoreStatus()]);if(!disposed){if(result.ok)setStatus(result.data);else setError(result.error.message);if(restored.ok)setRestore(restored.data);else setRestoreError(restored.error.message);}}catch{if(!disposed)setError('The backup service is unavailable. Reopen the app and try again.');}};
    void read();const timer=setInterval(read,350);return()=>{disposed=true;clearInterval(timer);};
  },[]);
  async function save(){
    setBusy(true);setNotice('');setError('');
    try{const result=await window.neuroscape.exportProfileBackup();if(!result.ok)setError(result.error.message);else if(!result.data.started)setNotice('Backup canceled.');else{const next=await window.neuroscape.profileBackupStatus();if(next.ok)setStatus(next.data);}}
    catch{setError('The backup could not start. Your profile is unchanged. Reopen the app and retry.');}finally{setBusy(false);}
  }
  async function restoreBackup(){
    setRestoreBusy(true);setRestoreNotice('');setRestoreError('');
    try{const result=await window.neuroscape.restoreProfileBackup();if(!result.ok)setRestoreError(result.error.message);else if(!result.data.started)setRestoreNotice('Restore canceled.');else{const next=await window.neuroscape.profileRestoreStatus();if(next.ok)setRestore(next.data);}}
    catch{setRestoreError('Restore could not start. Reopen the app to recover a complete profile.');}finally{setRestoreBusy(false);}
  }
  const message=notice || (status?.running ? `Creating backup: ${status.phase}${status.total ? ` · ${status.done} of ${status.total}` : ''}` : status?.message);
  return <section className="backup-screen"><h1>Profile backups</h1>
    <p className="intro">Keep a complete copy of your decks, saved matches, downloaded cards and artwork. Backups include committed data; save current edits before backing up.</p>
    <Button onClick={save} disabled={busy || !status || status.running || restoreBusy || restore?.running || restore?.restartRequired}>{busy ? 'Choosing destination…' : status?.running ? 'Creating backup…' : 'Save complete backup'}</Button>
    {!restore?.running && (error ? <p role="alert" className="error-message">{error}</p> : message && <p role={!notice && status?.phase==='failed' ? 'alert' : 'status'} className="save-status">{message}</p>)}
    <p className="muted">The backup is a portable ZIP file. Compatible rules come from the app release used to restore it.</p>
    <section className="restore-panel" aria-label="Restore profile"><h2>Restore a backup</h2>
      <p>Replace this profile with a validated backup and restart the app. A recovery backup keeps your current committed data.</p>
      <Button variant="secondary" onClick={restoreBackup} disabled={!restore || restoreBusy || restore.running || restore.restartRequired || status?.running || busy}>{restoreBusy?'Choosing backup…':restore?.running?'Restoring profile…':'Choose backup to restore'}</Button>
      {(restoreError || restoreNotice || restore?.message) && <p role={restoreError || (!restoreNotice && restore?.phase==='failed')?'alert':'status'} className={restoreError || restore?.phase==='failed'?'error-message':'save-status'}>{restoreError || restoreNotice || restore?.message}</p>}
      {restore?.recoveryBackupPath && <><p className="muted">Recovery backup: {restore.recoveryBackupPath}</p><Button variant="secondary" onClick={()=>{void window.neuroscape.openRecoveryBackupFolder().then(opened=>{if(!opened)setRestoreError('The recovery folder could not be opened. Check folder access.');});}}>Open recovery backup folder</Button></>}
    </section>
  </section>;
}
