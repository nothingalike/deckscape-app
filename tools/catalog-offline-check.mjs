import {launchDesktop} from './desktop-launch.mjs';
import { expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const live = JSON.parse(await readFile('.local/catalog-live.json', 'utf8'));
const env = { ...process.env, NEUROSCAPE_PROFILE_DIR: live.profileDirectory };
delete env.ELECTRON_RUN_AS_NODE;
delete env.NEUROSCAPE_CATALOG_FIXTURE_ORIGIN;
const desktop = await launchDesktop({ executablePath: resolve(process.env.NEUROSCAPE_EXE ?? 'release/win-unpacked/Neuroscape Local.exe'), env });
try {
  const blocked = await desktop.evaluate(async ({ session, net }) => {
    globalThis.neuroscapeOfflineRequests = [];
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*','https://*/*'] }, (details, callback) => {
      globalThis.neuroscapeOfflineRequests.push(new URL(details.url).hostname);
      callback({ cancel: true });
    });
    try { await net.fetch('https://www.neuroscapetcg.com/', { cache: 'no-store' }); return false; }
    catch { return true; }
  });
  assert.equal(blocked, true);
  const page = await desktop.firstWindow();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByRole('status').first()).toContainText(`${live.status.count} cards on this computer`);
  await page.getByRole('button', { name: 'Update cards', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('last successful catalog is unchanged', { timeout: 35000 });
  await page.getByLabel('Search cards').fill('Basic Ram');
  await page.getByRole('button', { name: /^View Basic Ram$/i }).click();
  await expect.poll(() => page.getByRole('dialog').locator('img').first().evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.getByRole('button', { name: /^Enlarge Basic Ram image$/i }).click();
  await expect(page.getByRole('dialog')).toHaveCount(2);
  await page.screenshot({ path: '.local/catalog-network-denied.png' });
  const requests = await desktop.evaluate(() => globalThis.neuroscapeOfflineRequests);
  assert.ok(requests.includes('www.neuroscapetcg.com'));
  assert.ok(requests.includes('api.v2.cloudflare.prod.carde.io'));
  assert.deepEqual(errors, []);
  await writeFile('.local/catalog-network-denied.json', JSON.stringify({ method:'HTTP/HTTPS denial in the shared Electron network session used by renderer, main and utility processes', mainRequestBlocked:blocked, utilitySyncRequestBlocked:true, blockedHosts:requests, catalogCount:live.status.count, localSearchArtworkAndEnlargement:true, pageErrors:errors }, null, 2));
  console.log('PASS: main and utility HTTP/HTTPS denied by shared network-session enforcement; local catalog, search, artwork and enlargement remain usable.');
} finally { await desktop.close(); }
