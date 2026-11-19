import {launchDesktop} from './desktop-launch.mjs';
import { expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

const fixture = JSON.parse(await readFile('.local/solo-ui-profile.json', 'utf8'));
const development = process.argv.includes('--development');
const env = { ...process.env, NEUROSCAPE_PROFILE_DIR: fixture.profileDirectory };
delete env.ELECTRON_RUN_AS_NODE; delete env.NEUROSCAPE_CATALOG_FIXTURE_ORIGIN;
const executablePath = resolve(development ? 'node_modules/electron/dist/electron.exe' : process.env.NEUROSCAPE_EXE ?? 'release/win-unpacked/Neuroscape Local.exe');
const launch = () => launchDesktop({ executablePath, args: development ? ['.'] : [], env });
let desktop; let setupId; const errors = [];
const originals = new Map();
function changeCard(id, change) {
  const db = new DatabaseSync(join(fixture.profileDirectory, 'profile.sqlite'));
  try {
    const row = db.prepare('SELECT c.payload,c.snapshot_id FROM catalog_cards c JOIN catalog_active a ON a.snapshot_id=c.snapshot_id WHERE c.id=?').get(id);
    if (!originals.has(id)) originals.set(id, row);
    if (change === null) db.prepare('DELETE FROM catalog_cards WHERE snapshot_id=? AND id=?').run(row.snapshot_id, id);
    else { const card = JSON.parse(row.payload); change(card); db.prepare('UPDATE catalog_cards SET payload=? WHERE snapshot_id=? AND id=?').run(JSON.stringify(card), row.snapshot_id, id); }
  } finally { db.close(); }
}
function restoreCards() {
  const db = new DatabaseSync(join(fixture.profileDirectory, 'profile.sqlite'));
  try { for (const [id, row] of originals) db.prepare('INSERT OR REPLACE INTO catalog_cards VALUES(?,?,?)').run(row.snapshot_id, id, row.payload); }
  finally { db.close(); }
}
async function offline() {
  assert.equal(await desktop.evaluate(async ({ session, net }) => {
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }));
    try { await net.fetch('https://www.neuroscapetcg.com/', { cache: 'no-store' }); return false; } catch { return true; }
  }), true);
}
async function choose(page, id) {
  await page.evaluate(id => { location.hash = '/solo/' + id; }, id);
  await expect(page.getByLabel('Your deck', { exact: true })).toHaveValue(id);
  await expect(page.getByRole('region', { name: 'Player deck checks' })).toBeVisible();
}
try {
  desktop = await launch(); await offline(); let page = await desktop.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await choose(page, fixture.invalidId);
  await expect(page.getByRole('region', { name: 'Player deck checks' })).toContainText('Choose exactly one mainframe');
  await expect(page.getByRole('region', { name: 'Player deck checks' })).toContainText('Solo support: supported');
  await expect(page.getByRole('button', { name: 'Create match setup' })).toBeDisabled();
  await choose(page, fixture.unsupportedId);
  await expect(page.getByRole('region', { name: 'Player deck checks' })).toContainText('Deck legality: legal');
  await expect(page.getByRole('region', { name: 'Player deck checks' })).toContainText('UI NEW UNSUPPORTED CARD');
  await expect(page.getByRole('button', { name: 'Create match setup' })).toBeDisabled();
  await page.screenshot({ path: '.local/solo-unsupported.png' });
  await page.evaluate(id => { location.hash = '/decks/' + id; }, fixture.unsupportedId);
  await expect(page.getByText('Valid constructed deck', { exact: true })).toBeVisible();
  await expect(page.getByText('Solo card support: needs attention', { exact: true })).toBeVisible();
  await page.evaluate(id => { location.hash = '/cards/' + id; }, fixture.newCardId);
  await expect(page.getByRole('dialog', { name: 'UI NEW UNSUPPORTED CARD', exact: true })).toContainText('Solo: unsupported');
  await page.getByRole('button', { name: 'Close card preview', exact: true }).click();
  await choose(page, fixture.supportedId);
  await expect(page.getByRole('button', { name: 'Create match setup' })).toBeEnabled();
  await page.screenshot({ path: '.local/solo-supported.png' });
  await page.getByRole('button', { name: 'Create match setup' }).click();
  await expect(page.getByRole('heading', { name: 'Saved match setup', exact: true })).toBeVisible();
  setupId = page.url().split('/').at(-1);
  const saved = await page.evaluate(id => window.neuroscape.readSoloSetup(id), setupId); assert.equal(saved.ok, true);
  assert.equal(saved.data.engineVersion, 'expanded-v6'); assert.ok(saved.data.definitionVersions.length > 10);
  await page.screenshot({ path: '.local/solo-pinned.png' });
  await desktop.close(); desktop = await launch(); await offline(); page = await desktop.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('link', { name: 'Fight a bot', exact: true }).click();
  await page.getByRole('region', { name: 'Resume matches' }).getByRole('link', { name: 'Resume game ' + setupId.slice(0, 8), exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Game setup', exact: true })).toBeVisible();
  assert.deepEqual(await page.evaluate(id => window.neuroscape.readSoloSetup(id), setupId), saved);
  changeCard(fixture.playerCardId, card => { card.raw.rules_text += ' UI changed mechanics.'; card.rules_text += ' UI changed mechanics.'; });
  await choose(page, fixture.supportedId);
  await expect(page.getByRole('region', { name: 'Player deck checks' })).toContainText('mechanics changed');
  await expect(page.getByRole('region', { name: 'Bot deck checks' })).toContainText('Solo support: supported');
  await expect(page.getByRole('button', { name: 'Create match setup' })).toBeDisabled();
  restoreCards(); changeCard(fixture.botCardId, card => { card.image_hash = 'f'.repeat(64); });
  await page.getByRole('button', { name: 'Refresh checks' }).click();
  await expect(page.getByRole('region', { name: 'Bot deck checks' })).toContainText('artwork changed');
  await expect(page.getByRole('region', { name: 'Player deck checks' })).toContainText('Solo support: supported');
  await expect(page.getByRole('button', { name: 'Create match setup' })).toBeDisabled();
  await page.screenshot({ path: '.local/solo-review-required.png' });
  restoreCards(); changeCard(fixture.botCardId, null);
  await page.getByRole('button', { name: 'Refresh checks' }).click();
  await expect(page.getByRole('region', { name: 'Bot deck checks' })).toContainText('Deck legality: needs attention');
  await expect(page.getByRole('region', { name: 'Bot deck checks' })).toContainText('not downloaded or unresolved');
  await expect(page.getByRole('button', { name: 'Create match setup' })).toBeDisabled();
  assert.deepEqual(await page.evaluate(id => window.neuroscape.readSoloSetup(id), setupId), saved);
  assert.deepEqual(errors, []);
  await writeFile('.local/solo-ui.json', JSON.stringify({ development, supportedSetup: true, invalidPlayer: true, invalidBot: true,
    unsupportedDraftAndCardPreview: true, mechanicsAndArtworkInvalidation: true, separatedLegality: true,
    offlineRestart: true, pinnedSetup: saved.data, pageErrors: errors }, null, 2));
  console.log('PASS: supported and blocked matchups, separate legality/support, fingerprint invalidation, pinned setup and offline restart.');
} catch (error) { if (desktop) { const page = (await desktop.windows())[0]; if (page) await page.screenshot({ path: '.local/solo-failure.png' }); } throw error; }
finally { restoreCards(); if (desktop) { await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy())).catch(() => {}); await desktop.close(); } }
