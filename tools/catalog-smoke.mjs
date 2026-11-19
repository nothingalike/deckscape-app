import {launchDesktop} from './desktop-launch.mjs';
import { expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
const cards = [
  { id: '61045c1b-73b0-46f2-8cc0-4c379c5d31e4', name: 'Basic Ram', card_type: '', card_copies_limit: 4, set_code: 'GENESIS', set_name: 'Genesis' },
  { id: 'e45525aa-735a-4c2d-a442-4b64786c3809', name: 'Controlled runner', card_type: 'character', rules_text: 'Controlled source artwork and rules.', set_code: 'GENESIS', set_name: 'Genesis' },
].map(card => ({ ...card, image_url: 'https://storage.googleapis.com/spicerack_media/cards/neuroscape/controlled.png?signature=fixture-only' }));
let malformed = false;
let holdArtwork = false;
let heldRequests = 0;
let missingRunner = false;
const server = createServer((request, response) => {
  if (request.url.startsWith('/cards')) {
    const offset = Number(new URL(request.url, 'http://127.0.0.1').searchParams.get('offset'));
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ cards: [cards[malformed ? 0 : offset]], total: missingRunner ? 1 : 2, has_more: !missingRunner && offset === 0, offset }));
  } else if (request.url === '/artwork') {
    if (holdArtwork) { heldRequests++; return; }
    response.setHeader('Content-Type', 'image/png'); response.end(png);
  } else { response.writeHead(404); response.end(); }
});
await new Promise(resolveReady => server.listen(0, '127.0.0.1', resolveReady));
const address = server.address();
const origin = `http://127.0.0.1:${address.port}/`;
const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-catalog-ui-'));
const env = { ...process.env, NEUROSCAPE_PROFILE_DIR: profileDirectory, NEUROSCAPE_CATALOG_FIXTURE_ORIGIN: origin };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = resolve(process.env.NEUROSCAPE_EXE ?? 'release/win-unpacked/Neuroscape Local.exe');
await mkdir('.local', { recursive: true });
let desktop;
const errors = [];
try {
  desktop = await launchDesktop({ executablePath, env });
  let page = await desktop.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByRole('status').first()).toContainText('An internet connection is required');
  await page.getByRole('button', { name: 'Update cards', exact: true }).click();
  await expect(page.getByRole('status').first()).toContainText('2 cards on this computer', { timeout: 30000 });
  await page.getByLabel('Search cards').fill('runner');
  await expect(page.getByRole('button', { name: 'View Controlled runner', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Basic Ram', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'View Controlled runner', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Controlled source artwork and rules.');
  await expect.poll(() => page.getByRole('dialog').locator('img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.getByRole('button', { name: 'Close card preview', exact: true }).click();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Preview Controlled runner', exact: true })).toBeVisible();
  await page.getByLabel('Sort cards').selectOption('name');
  malformed = true;
  await page.getByRole('button', { name: 'Update cards', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('last successful catalog is unchanged', { timeout: 30000 });
  await expect(page.getByRole('status').first()).toContainText('2 cards on this computer');
  malformed = false; holdArtwork = true;
  await page.getByRole('button', { name: 'Update cards', exact: true }).click();
  await expect.poll(() => heldRequests).toBe(1);
  await expect(page.getByRole('status').first()).toContainText('Downloading artwork');
  await expect(page.getByRole('button', { name: 'Updating cards…', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel update', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Catalog update canceled');
  await expect(page.getByRole('status').first()).toContainText('2 cards on this computer');
  await page.screenshot({ path: '.local/catalog-cancel.png' });
  await desktop.close();
  desktop = await launchDesktop({ executablePath, env });
  page = await desktop.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByRole('alert')).toContainText('Catalog update canceled');
  holdArtwork = false; missingRunner = true;
  await page.getByRole('button', { name: 'Update cards', exact: true }).click();
  await expect(page.getByRole('status').first()).toContainText('Missing 1');
  await expect(page.getByRole('status').first()).toContainText('2 cards on this computer');
  await expect(page.getByText('Not in latest official catalog', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'View Controlled runner', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Not in latest official catalog');
  await expect.poll(() => page.getByRole('dialog').locator('img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: '.local/catalog-retained.png' });
  await page.getByRole('button', { name: 'Close card preview', exact: true }).click();
  await desktop.close();
  server.closeAllConnections();
  await new Promise(resolveClosed => server.close(resolveClosed));
  desktop = await launchDesktop({ executablePath, env });
  page = await desktop.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByRole('status').first()).toContainText('2 cards on this computer');
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByLabel('Card type').selectOption('ram');
  await expect(page.getByRole('button', { name: 'View Basic Ram', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View Basic Ram', exact: true }).click();
  await expect.poll(() => page.getByRole('dialog').locator('img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: '.local/catalog-offline.png' });
  await page.getByRole('link', { name: 'View card details', exact: true }).click();
  await expect(page).toHaveURL(/#\/cards\/61045c1b-73b0-46f2-8cc0-4c379c5d31e4$/);
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('dialog')).toContainText('Basic Ram');
  await page.getByRole('button', { name: 'Close card preview', exact: true }).click();
  await expect(page.getByLabel('Search cards')).toBeVisible();
  assert.deepEqual(errors, []);
  await writeFile('.local/catalog-smoke.json', JSON.stringify({ freshSetup: true, multiPageSync: true, detailsAndArtwork: true, malformedSyncPreservedCatalog: true, cancellationPersistedAfterRestart: true, retainedMissingCardAndArtwork: true, reopenedWithSourceStopped: true, localFilterAndArtwork: true, pageErrors: errors }, null, 2));
  console.log('PASS: packaged catalog setup, hosted browse, cancel/restart, missing-card retention, and local artwork after source shutdown/restart.');
} catch (error) {
  const page = desktop && (await desktop.windows())[0];
  if (page) { await page.screenshot({ path: '.local/catalog-failure.png' }); console.error(await page.locator('body').innerText()); }
  throw error;
} finally {
  await desktop?.close();
  server.closeAllConnections(); server.close();
}
