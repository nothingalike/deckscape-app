import { lstatSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

// Only this app's UUID-named run directories are disposable. Artwork is kept
// independently because an older snapshot or saved match may still reference it.
const runIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function catalogStaging(profileDirectory: string) {
  const root = resolve(profileDirectory, 'staging');
  function checkRoot() {
    const info = lstatSync(root, { throwIfNoEntry: false });
    if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error('Invalid catalog staging directory.');
    return Boolean(info);
  }
  function path(runId: string) {
    if (!runIdPattern.test(runId)) throw new Error('Invalid catalog run.');
    const target = join(root, runId);
    if (dirname(target) !== root) throw new Error('Invalid catalog staging path.');
    return target;
  }
  function discard(runId: string) {
    if (checkRoot()) rmSync(path(runId), { recursive: true, force: true });
  }
  return {
    path,
    discard,
    recover() {
      if (!checkRoot()) return;
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (entry.isDirectory() && runIdPattern.test(entry.name)) discard(entry.name);
      }
    },
  };
}
