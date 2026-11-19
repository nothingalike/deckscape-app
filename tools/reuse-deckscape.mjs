import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, join, dirname, relative, sep } from 'node:path';

const sourceRoot = process.argv[2] && resolve(process.argv[2]);
if (!sourceRoot) throw new Error('Pass the reference Deckscape checkout as the first argument.');
const apply = process.argv.includes('--apply');
const entries = process.argv.slice(3).filter(arg => !arg.startsWith('--'));
if (!entries.length) throw new Error('Pass at least one repository-relative entry module.');
const adapters = new Set(['components/collection-provider.tsx','components/card-details-link.tsx','components/card-purchase-link.tsx','lib/card-artwork.ts',
  'components/collection-page.tsx','components/deck-history.tsx','components/simulator/quick-play.tsx','lib/deck-command.ts',
  'lib/simulator/revision-notifications.ts','lib/simulator/bot-client.ts',
  'lib/achievements/public-flair.ts',
  'components/simulator/match-bug-report.tsx','components/simulator/match-report-share.tsx']);
const closure = new Set(); const packages = new Set();
async function exists(file) { try { await access(file); return true; } catch { return false; } }
async function visit(path) {
  const file = resolve(sourceRoot, path);
  if (!file.startsWith(sourceRoot + sep)) throw new Error('Source dependency escapes the selected checkout.');
  const name = relative(sourceRoot, file).replaceAll('\\','/');
  if (closure.has(name) || adapters.has(name)) return;
  closure.add(name);
  if (!/\.[cm]?[jt]sx?$/.test(name)) return;
  const code = await readFile(file, 'utf8');
  const imports = new Set();
  for (const match of code.matchAll(/^\s*(?:import|export)\s+(?:type\s+)?(?:[^;"']*?\s+from\s*)?["']([^"']+)["']/gm)) imports.add(match[1]);
  for (const match of code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) imports.add(match[1]);
  for (const specifier of imports) {
    if (!specifier.startsWith('.') && !specifier.startsWith('@/')) { packages.add(specifier); continue; }
    const base = specifier.startsWith('@/') ? join(sourceRoot, specifier.slice(2)) : resolve(dirname(file), specifier);
    let found;
    for (const candidate of [base,base+'.ts',base+'.tsx',base+'.json',base+'.css',join(base,'index.ts'),join(base,'index.tsx')]) {
      if (await exists(candidate)) { found = candidate; break; }
    }
    if (!found) throw new Error(`Missing source dependency ${specifier} from ${name}`);
    await visit(found);
  }
}
for (const entry of entries) await visit(entry);
console.log(JSON.stringify({ modules: [...closure].sort(), adaptedBoundaries: [...adapters], externalImports: [...packages].sort() }, null, 2));
if (apply) {
  const manifestPath = 'docs/reuse-manifest.json';
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const commit = execFileSync('git', ['-c',`safe.directory=${sourceRoot.replaceAll('\\','/')}`,'-C',sourceRoot,'rev-parse','HEAD'], { encoding:'utf8' }).trim();
  if (commit !== manifest.sourceCommit) throw new Error('Reference revision changed; reconcile the source manifest before copying.');
  const sha = value => createHash('sha256').update(value).digest('hex').toUpperCase();
  for (const name of closure) {
    const bytes = await readFile(join(sourceRoot, name));
    const destination = 'src/deckscape/'+name;
    if (await exists(destination)) {
      const localHash = sha(await readFile(destination));
      const record = manifest.files.find(entry => entry.local === destination);
      if (localHash !== sha(bytes) && (!record || record.localSha256 !== localHash || record.sourceSha256 !== sha(bytes) || record.adaptation === 'Unmodified copy')) {
        throw new Error(`Existing adapted source requires explicit reconciliation: ${destination}`);
      }
      continue;
    }
    await mkdir(dirname(destination), { recursive:true }); await writeFile(destination, bytes);
    manifest.files.push({ source:name, local:destination, sourceSha256:sha(bytes), localSha256:sha(bytes), adaptation:'Unmodified copy' });
  }
  await writeFile(manifestPath, JSON.stringify(manifest,null,2));
}
