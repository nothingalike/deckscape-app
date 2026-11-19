import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const packages = [];
const notices = [];
for (const [directory, metadata] of Object.entries(lock.packages)) {
  if (!directory || metadata.dev) continue;
  let manifest;
  try { manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')); }
  catch (error) { if (metadata.optional && error.code === 'ENOENT') continue; throw error; }
  const licenseFiles = (await readdir(directory)).filter(name => /^(licen[cs]e|copying|notice)(\.|$)/i.test(name));
  packages.push({ name: manifest.name, version: manifest.version, license: manifest.license ?? 'UNDECLARED', licenseFiles });
  for (const file of licenseFiles) {
    notices.push(`${manifest.name} ${manifest.version} — ${file}\n\n${await readFile(join(directory, file), 'utf8')}`);
  }
}
const missing = packages.filter(pkg => !pkg.licenseFiles.length || pkg.license === 'UNDECLARED');
await mkdir('dist', { recursive: true });
await mkdir('.local', { recursive: true });
await writeFile('dist/THIRD_PARTY_NOTICES.txt', notices.join('\n\n--------------------\n\n'));
await writeFile('.local/dependency-inventory.json', JSON.stringify({ packages, missing }, null, 2));
console.log(JSON.stringify({ runtimePackages: packages.length, notices: notices.length, unresolved: missing.map(pkg => pkg.name) }));
if (missing.length) process.exitCode = 1;
