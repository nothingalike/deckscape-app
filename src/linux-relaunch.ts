import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {access} from 'node:fs/promises';
import {constants} from 'node:fs';
import {isAbsolute} from 'node:path';

// Keep executable/arguments as positional parameters, including paths with spaces.
const waitForParent='parent="$1"; shift; attempts=0; while kill -0 "$parent" 2>/dev/null; do attempts=$((attempts + 1)); [ "$attempts" -lt 300 ] || exit 1; sleep 0.1; done; exec "$@"';

/** The AppImage launcher remounts its runtime after the old process releases its profile. */
export async function scheduleLinuxRelaunch(executable:string,args:string[],parentPid:number){
  if(!isAbsolute(executable)||!Number.isSafeInteger(parentPid)||parentPid<=0)throw new Error('Invalid restart target.');
  await access(executable,constants.X_OK);
  const child=spawn('/bin/sh',['-c',waitForParent,'neuroscape-restart',String(parentPid),executable,...args],{detached:true,stdio:'ignore'});
  await once(child,'spawn');
  child.unref();
}
