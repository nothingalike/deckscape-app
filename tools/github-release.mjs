import { appendFile, copyFile, mkdir, readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const targets = {
  'windows-x64': { platform: 'win32', arch: 'x64', label: 'Windows', suffix: 'Windows-x64-Setup.exe', flag: '--win', format: 'nsis' },
  'mac-arm64': { platform: 'darwin', arch: 'arm64', label: 'Mac: Apple silicon', suffix: 'macOS-arm64.dmg', flag: '--mac', format: 'dmg' },
  'mac-x64': { platform: 'darwin', arch: 'x64', label: 'Mac: Intel', suffix: 'macOS-x64.dmg', flag: '--mac', format: 'dmg' },
  'linux-x64': { platform: 'linux', arch: 'x64', label: 'Linux', suffix: 'Linux-x64.AppImage', flag: '--linux', format: 'AppImage' },
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function releaseIdentity(tag, version, sha, signed = 'false') {
  if (!/^v(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(tag ?? '') || tag !== `v${version}`) throw new Error('Use an existing vX.Y.Z tag matching package.json version.');
  if (!/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('A full source commit SHA is required.');
  if (!['true', 'false'].includes(signed)) throw new Error('Signing mode must be true or false.');
  return { tag, version, sha, mode: signed === 'true' ? 'signed' : 'unsigned-preview' };
}
export const installerName = (version, target) => {
  if (!targets[target]) throw new Error('Unknown desktop target.');
  return `Neuroscape-Local-${version}-${targets[target].suffix}`;
};
async function identity() {
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const result = releaseIdentity(process.env.RELEASE_TAG, version, sha, process.env.NEUROSCAPE_SIGN_RELEASE ?? 'false');
  const tagged = execFileSync('git', ['rev-parse', `refs/tags/${result.tag}^{commit}`], { encoding: 'utf8' }).trim();
  if (tagged !== sha) throw new Error('The checked-out commit must equal the selected release tag.');
  return result;
}
async function regularFile(path) {
  const entry = await lstat(path);
  if (!entry.isFile() || entry.isSymbolicLink() || entry.size < 1) throw new Error(`Expected a nonempty regular file: ${path}`);
  return { bytes: await readFile(path), size: entry.size };
}
export async function stageInstaller(directory, input, target, release) {
  const file = installerName(release.version, target);
  const { bytes, size } = await regularFile(input);
  await mkdir(directory, { recursive: true });
  await copyFile(input, join(directory, file));
  const record = { ...release, target, file, size, sha256: sha256(bytes), signed: release.mode === 'signed' && targets[target].platform !== 'linux' };
  await writeFile(join(directory, `${target}.json`), JSON.stringify(record, null, 2) + '\n');
  return record;
}
export async function verifyInstallers(directory, release) {
  const expected = Object.keys(targets).flatMap(target => [`${target}.json`, installerName(release.version, target)]).sort();
  const actual = (await readdir(directory)).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('A release requires exactly the four installers and four build records; extra files or missing targets are rejected.');
  const records = [];
  for (const target of Object.keys(targets)) {
    const record = JSON.parse((await regularFile(join(directory, `${target}.json`))).bytes);
    for (const key of ['tag', 'version', 'sha', 'mode']) if (record[key] !== release[key]) throw new Error(`Mixed release ${key}: ${target}`);
    if (record.target !== target || record.file !== installerName(release.version, target)) throw new Error(`Wrong target or installer path: ${target}`);
    if (record.signed !== (release.mode === 'signed' && targets[target].platform !== 'linux')) throw new Error(`Wrong signing record: ${target}`);
    const { bytes, size } = await regularFile(join(directory, record.file));
    if (record.size !== size || record.sha256 !== sha256(bytes)) throw new Error(`Installer checksum mismatch: ${target}`);
    records.push(record);
  }
  return records;
}
export function playerInstructions() {
  return `Choose the download for your computer. You do not need Node.js, Git, or developer tools.\n\nWindows: download the Windows Setup .exe, open it, and follow the installer. Start Neuroscape Local from the Start menu.\n\nMac: choose Apple silicon for a Mac with an Apple chip, or Intel for an Intel Mac. Check Apple menu > About This Mac if unsure. Open the .dmg and drag Neuroscape Local into Applications. Open it from Applications. Requires macOS 13 or later.\n\nLinux: download the .AppImage. In your file manager, open its Properties and allow running the file as a program, then open it. AppImage support depends on your Linux distribution.\n\nFirst launch: choose Update cards while connected to the internet. Once the card download finishes, build decks and play supported bot matches offline. Before updating an existing installation, save a complete backup from Backups. Installing an update preserves the local profile.\n\nIf your computer blocks an installer or reports an unverified developer, stop and ask the maintainer for help. Keep your normal security settings enabled.\n`;
}
export function releaseNotes(repository, release, records) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '')) throw new Error('Invalid GitHub repository.');
  const base = `https://github.com/${repository}/releases/download/${release.tag}/`;
  const downloads = records.map(record => `| ${targets[record.target].label} | [Download](${base}${record.file}) |`).join('\n');
  const notice = release.mode === 'signed'
    ? 'Windows installers are code signed. Mac apps are Developer ID signed and notarized. Your operating system may still perform its own security checks.'
    : '**Preview build:** Windows is unsigned and the Mac apps are not Developer ID signed or notarized. Your computer may block them. These downloads are for testing; wait for a signed release if you need a routine install.';
  return `## Download Neuroscape Local ${release.version}\n\nChoose your computer below. You do not need programming tools or the Source code downloads.\n\n| Your computer | Installer |\n| --- | --- |\n${downloads}\n\n${notice}\n\n## Install and play\n\n${playerInstructions()}\n## Release details\n\nBuilt from commit \`${release.sha}\`. Checksums are in SHA256SUMS.txt.\n`;
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}).`);
}
async function build(target, release) {
  const selected = targets[target];
  if (!selected || selected.platform !== process.platform || selected.arch !== process.arch) throw new Error('Use the matching native host and Node architecture for this target.');
  const env = { ...process.env };
  if (!env.CSC_NAME) delete env.CSC_NAME;
  if (release.mode === 'signed' && process.platform !== 'linux') {
    const required = process.platform === 'win32' ? ['WIN_CSC_LINK'] : ['CSC_LINK', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'];
    if (required.some(key => !env[key])) throw new Error('Signed builds require the configured certificate and notarization secrets.');
  } else {
    for (const key of Object.keys(env)) if (/^(?:WIN_)?CSC_|^APPLE_/.test(key)) delete env[key];
    env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  }
  run(process.execPath, ['tools/build.mjs'], { env });
  run(process.execPath, ['node_modules/electron-builder/cli.js', '--config', 'electron-builder.github.cjs', selected.flag, selected.format, '--' + selected.arch, '--publish', 'never'], { env });
  const installer = resolve('release/github', installerName(release.version, target));
  let executable;
  if (process.platform === 'win32') executable = resolve('release/github/win-unpacked/Neuroscape Local.exe');
  else if (process.platform === 'linux') executable = resolve('release/github/linux-unpacked/neuroscape-app');
  else {
    const app = resolve('release/github', selected.arch === 'arm64' ? 'mac-arm64' : 'mac', 'Neuroscape Local.app');
    executable = join(app, 'Contents/MacOS/Neuroscape Local');
    if (release.mode === 'signed') {
      run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
      run('spctl', ['--assess', '--type', 'execute', '--verbose=4', app]);
      run('xcrun', ['stapler', 'validate', app]);
      run('codesign', ['--verify', '--verbose=2', installer]);
    }
  }
  if (release.mode === 'signed' && process.platform === 'win32') run('pwsh', ['-NoProfile', '-File', 'tools/verify-release-signatures.ps1', '-Installer', installer, '-Application', executable]);
  await regularFile(executable);
  // The smoke test receives the actual staged app, never an older default artifact.
  if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, `NEUROSCAPE_EXE=${executable}\nNEUROSCAPE_INSTALLER=${installer}\n`);
  await stageInstaller('release/github-assets', installer, target, release);
}
async function assemble(release) {
  const records = await verifyInstallers('release/github-assets', release);
  const directory = 'release/github-draft';
  await mkdir(directory, { recursive: true });
  const instructions = playerInstructions();
  await writeFile(join(directory, 'INSTALL.txt'), instructions);
  const sums = [...records.map(record => `${record.sha256}  ${record.file}`), `${sha256(instructions)}  INSTALL.txt`];
  await writeFile(join(directory, 'SHA256SUMS.txt'), sums.join('\n') + '\n');
  await writeFile(join(directory, 'release-notes.md'), releaseNotes(process.env.GITHUB_REPOSITORY, release, records));
  await writeFile(join(directory, 'build-manifest.json'), JSON.stringify({ ...release, installers: records }, null, 2) + '\n');
}
export function validateExistingDraft(existing, release) {
  if (!existing.isDraft) throw new Error('A published release is preserved. Create a new version tag instead.');
  if (existing.targetCommitish !== release.sha) throw new Error('The existing draft belongs to another source revision.');
  if (existing.isPrerelease !== (release.mode === 'unsigned-preview')) throw new Error('The existing draft has another signing/release mode. Use a new version for a mode change.');
}
async function draft(release) {
  // Revalidate the exact input files immediately before the write to GitHub.
  await assemble(release);
  const repository = process.env.GITHUB_REPOSITORY;
  const common = ['--repo', repository];
  const existing = spawnSync('gh', ['release', 'view', release.tag, ...common, '--json', 'isDraft,isPrerelease,targetCommitish'], { encoding: 'utf8' });
  if (existing.error) throw existing.error;
  if (existing.status === 0) {
    validateExistingDraft(JSON.parse(existing.stdout), release);
    // Keep the maintainer's edited release description on a retry.
  } else {
    if (!/HTTP 404|release not found/i.test(existing.stderr)) throw new Error('Could not check the existing release. No release was changed.');
    run('gh', ['release', 'create', release.tag, ...common, '--verify-tag', '--draft', '--target', release.sha, '--title', `Neuroscape Local ${release.version}`, '--notes-file', 'release/github-draft/release-notes.md', ...(release.mode === 'unsigned-preview' ? ['--prerelease'] : [])]);
  }
  const assets = Object.keys(targets).map(target => join('release/github-assets', installerName(release.version, target)));
  assets.push(...['INSTALL.txt', 'SHA256SUMS.txt', 'build-manifest.json'].map(file => join('release/github-draft', file)));
  run('gh', ['release', 'upload', release.tag, ...common, '--clobber', ...assets]);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Player downloads are ready for review\n\n[Open the draft release](https://github.com/${repository}/releases) and review its four installers. Publish the draft when the release prerequisites are satisfied.\n\nSigning mode: ${release.mode}.\n`);
}
async function main() {
  const release = await identity();
  if (process.argv[2] === 'prepare') {
    if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required.');
    await appendFile(process.env.GITHUB_OUTPUT, Object.entries(release).map(([key, value]) => `${key}=${value}`).join('\n') + '\n');
  } else if (process.argv[2] === 'build') await build(process.argv[3], release);
  else if (process.argv[2] === 'assemble') await assemble(release);
  else if (process.argv[2] === 'draft') await draft(release);
  else throw new Error('Choose prepare, build, assemble or draft.');
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().catch(error => { console.error(error.message); process.exitCode = 1; });
