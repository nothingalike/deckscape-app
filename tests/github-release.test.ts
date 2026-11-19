import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
// Maintainer tooling is ESM while the application uses NodeNext/CJS.
// @ts-expect-error JavaScript release tooling is exercised directly without application declarations.
import { installerName, releaseIdentity, releaseNotes, stageInstaller, targets, validateExistingDraft, verifyInstallers } from '../tools/github-release.mjs';

const sha = 'a'.repeat(40);
const release = releaseIdentity('v0.2.0', '0.2.0', sha, 'false');
test('release tags bind exact supported versions and commits without accepting shell-like input', () => {
  for (const tag of ['main', 'v0.2.1', 'v0.2.0-beta', 'v01.2.0', 'v0.2.0\nsha=bad', 'v0.2.0;echo unsafe']) assert.throws(() => releaseIdentity(tag, '0.2.0', sha, 'false'));
  assert.throws(() => releaseIdentity('v0.2.0', '0.2.0', 'main', 'false'));
  assert.throws(() => releaseIdentity('v0.2.0', '0.2.0', sha, 'yes'));
  assert.equal(release.mode, 'unsigned-preview');
});
test('release assembly accepts the complete matching set and rejects missing, altered, mixed and extra data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'neuroscape-release-'));
  try {
    const directory = join(root, 'assets'), source = join(root, 'fixture.exe');
    await writeFile(source, 'controlled installer bytes');
    for (const target of Object.keys(targets)) await stageInstaller(directory, source, target, release);
    const records = await verifyInstallers(directory, release);
    assert.equal(records.length, 4);
    const windows = join(directory, installerName('0.2.0', 'windows-x64'));
    await writeFile(windows, 'damaged');
    await assert.rejects(verifyInstallers(directory, release), /checksum/);
    await stageInstaller(directory, source, 'windows-x64', release);
    await stageInstaller(directory, source, 'mac-arm64', { ...release, sha: 'b'.repeat(40) });
    await assert.rejects(verifyInstallers(directory, release), /Mixed release sha/);
    await stageInstaller(directory, source, 'mac-arm64', release);
    const recordPath = join(directory, 'linux-x64.json');
    const record = JSON.parse(await readFile(recordPath, 'utf8'));
    await writeFile(recordPath, JSON.stringify({ ...record, file: '../../private.zip' }));
    await assert.rejects(verifyInstallers(directory, release), /Wrong target/);
    await writeFile(recordPath, JSON.stringify(record));
    await writeFile(join(directory, 'private-profile.zip'), 'unrelated');
    await assert.rejects(verifyInstallers(directory, release), /extra files/);
    await rm(join(directory, 'private-profile.zip'));
    await rm(windows);
    await assert.rejects(verifyInstallers(directory, release), /four installers/);
  } finally {
    assert.equal(dirname(root), resolve(tmpdir()));
    assert.match(basename(root), /^neuroscape-release-/);
    await rm(root, { recursive: true, force: true });
  }
});
test('player notes provide ordinary downloads and honest signing status', () => {
  const records = Object.keys(targets).map(target => ({ target, file: installerName('0.2.0', target) }));
  const notes = releaseNotes('nothingalike/deckscape-app', release, records);
  assert.match(notes, /releases\/download\/v0\.2\.0\/Neuroscape-Local-0\.2\.0-Windows-x64-Setup\.exe/);
  assert.match(notes, /Apple silicon/); assert.match(notes, /Intel/); assert.match(notes, /not.*notarized/);
  assert.match(notes, /do not need Node\.js/); assert.match(notes, /Update cards/);
  assert.throws(() => releaseNotes('owner/repo\nmalformed', release, records));
});
test('draft retries preserve published versions and reject another source revision', () => {
  assert.throws(() => validateExistingDraft({ isDraft: false, targetCommitish: sha }, release), /published release/);
  assert.throws(() => validateExistingDraft({ isDraft: true, targetCommitish: 'main' }, release), /another source/);
  assert.throws(() => validateExistingDraft({ isDraft: true, targetCommitish: sha, isPrerelease: false }, release), /another signing/);
  validateExistingDraft({ isDraft: true, targetCommitish: sha, isPrerelease: true }, release);
});
