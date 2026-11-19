import {launchDesktop} from './desktop-launch.mjs';
import { expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const fixture = JSON.parse(await readFile('.local/resume-ui-profile.json', 'utf8'));
const development = process.argv.includes('--development');
const env = { ...process.env, NEUROSCAPE_PROFILE_DIR: fixture.profileDirectory };
delete env.ELECTRON_RUN_AS_NODE; delete env.NEUROSCAPE_CATALOG_FIXTURE_ORIGIN;
const executablePath = resolve(development ? 'node_modules/electron/dist/electron.exe' : process.env.NEUROSCAPE_EXE ?? 'release/win-unpacked/Neuroscape Local.exe');
let desktop; const errors = [];
async function launch() {
  desktop = await launchDesktop({ executablePath, args: development ? ['.'] : [], env });
  assert.equal(await desktop.evaluate(async ({ session, net }) => {
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*','https://*/*'] }, (_details, callback) => callback({ cancel: true }));
    try { await net.fetch('https://www.neuroscapetcg.com/', { cache: 'no-store' }); return false; } catch { return true; }
  }), true);
  const page = await desktop.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByRole('link', { name: 'Fight a bot', exact: true })).toBeVisible();
  return page;
}
async function close() { await desktop.close(); desktop = undefined; }
async function home(page) { await page.getByRole('link', { name: 'Fight a bot', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Resume matches', exact: true })).toBeVisible(); }
try {
  for (const saved of fixture.cases.filter(item => item.kind !== 'incompatible')) {
    let page = await launch();
    assert.deepEqual(await page.evaluate(id => window.neuroscape.readMatch(id), saved.id), saved.before);
    await home(page);
    if (saved.kind === 'bot') {
      // A saved bot turn stays pending in the match list until the player resumes its view.
      await expect(page.getByRole('link', { name: 'Resume game ' + saved.id.slice(0,8), exact: true })).toBeVisible();
    } else {
      await page.getByRole('link', { name: 'Resume game ' + saved.id.slice(0,8), exact: true }).click();
      if (saved.kind === 'setup') await expect(page.getByRole('heading', { name: 'Game setup', exact: true })).toBeVisible();
      else await expect(page.getByRole('button', { name: 'Install 1 RAM', exact: true })).toBeEnabled();
    }
    assert.deepEqual(await page.evaluate(id => window.neuroscape.readMatch(id), saved.id), saved.before);
    await close();
    page = await launch();
    assert.deepEqual(await page.evaluate(id => window.neuroscape.readMatch(id), saved.id), saved.before);
    await home(page);
    await page.getByRole('link', { name: 'Resume game ' + saved.id.slice(0,8), exact: true }).click();
    if (saved.kind === 'setup') {
      await expect(page.getByRole('heading', { name: 'Game setup', exact: true })).toBeVisible();
      await expect(page.locator('[data-canvas-ready="true"]')).toBeVisible();
      assert.deepEqual(await page.evaluate(id => window.neuroscape.readMatch(id), saved.id), saved.before);
    } else if (saved.kind === 'player') {
      await expect(page.getByRole('button', { name: 'Install 1 RAM', exact: true })).toBeEnabled();
      assert.deepEqual(await page.evaluate(id => window.neuroscape.readMatch(id), saved.id), saved.before);
      await page.getByRole('button', { name: 'Install 1 RAM', exact: true }).click();
    }
    if (saved.kind !== 'setup') await expect.poll(async () => {
      const result = await page.evaluate(id => window.neuroscape.readMatch(id), saved.id);
      return result.ok && result.data.phase === 'game' ? result.data.snapshot.view.revision : -1;
    }).toBeGreaterThan(saved.before.data.snapshot.view.revision);
    await page.screenshot({ path: '.local/resume-' + saved.kind + '.png' });
    await close();
  }
  const page = await launch(); await home(page);
  const unavailable = fixture.cases.find(item => item.kind === 'incompatible');
  const row = page.getByRole('listitem').filter({ hasText: 'Game ' + unavailable.id.slice(0,8) });
  await expect(row).toContainText('another app version');
  await expect(row.getByRole('link')).toHaveCount(0);
  const before = await page.evaluate(id => window.neuroscape.readSoloSetup(id), unavailable.id);
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.local/resume-incompatible.png' });
  await page.evaluate(id => { location.hash = '/matches/' + id; }, unavailable.id);
  await expect(page.getByRole('alert')).toContainText('another app version');
  assert.deepEqual(await page.evaluate(id => window.neuroscape.readSoloSetup(id), unavailable.id), before);
  assert.deepEqual(errors, []);
  await writeFile('.local/resume-ui.json', JSON.stringify({ development, executablePath, profileDirectory: fixture.profileDirectory,
    setupRestart: true, playerDecisionRestartAndAction: true, botTurnFromListRestartAndAdvance: true,
    unavailableRuntimeRetained: true, httpHttpsDenied: true, pageErrors: errors }, null, 2));
  console.log('PASS: original resume list, normal setup/player/bot restart, continued work and retained unavailable runtime under HTTP/HTTPS denial.');
} catch (error) {
  console.error(error);
  if (desktop) {
    await desktop.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; if (window?.isMinimized()) window.restore(); }).catch(() => {});
    const page = (await desktop.windows())[0];
    if (page) await page.screenshot({ path: '.local/resume-failure.png', timeout: 5000 }).catch(() => {});
  }
  throw error;
}
finally { if (desktop) { await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy())).catch(() => {}); await desktop.close(); } }
