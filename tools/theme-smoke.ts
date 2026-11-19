import { backup, DatabaseSync } from 'node:sqlite';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { openApplication } from '../src/application';
import { launchDesktop } from './desktop-launch.mjs';

// Real downloaded artwork and a disposable SQLite profile; no player data is changed.
async function main() {
const before = process.argv.includes('--before');
const live = JSON.parse(await readFile('.local/catalog-live.json', 'utf8'));
const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-theme-'));
const source = new DatabaseSync(join(live.profileDirectory, 'profile.sqlite'), { readOnly: true });
try { await backup(source, join(profileDirectory, 'profile.sqlite')); } finally { source.close(); }
await cp(join(live.profileDirectory, 'artwork'), join(profileDirectory, 'artwork'), { recursive: true });
const local = openApplication({ profileDirectory });
const starters = await local.execute({ type: 'deck.starters' });
if (!starters.ok) throw new Error(starters.error.message);
const imported = await local.execute({ type: 'deck.importStarter', key: starters.data[0].key });
if (!imported.ok) throw new Error(imported.error.message);
local.close();
const output = `.local/neon-${before ? 'before' : 'after'}`;
await mkdir(output, { recursive: true });
const env = { ...process.env, NEUROSCAPE_PROFILE_DIR: profileDirectory };
delete env.ELECTRON_RUN_AS_NODE;
const desktop = await launchDesktop({
  executablePath: resolve(before ? 'release/win-unpacked/Neuroscape Local.exe' : process.env.NEUROSCAPE_EXE ?? 'node_modules/electron/dist/electron.exe'),
  args: before || process.env.NEUROSCAPE_EXE ? [] : ['.'], env,
});
const errors: string[] = [], measurements: object[] = [];
const failedResources: string[] = [];
try {
  const page = await desktop.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().startsWith('neuroscape://app/') && !response.ok()) failedResources.push(`${response.status()} ${response.url()}`); });
  await expect(page.getByRole('textbox', { name: 'Search cards', exact: true })).toBeVisible();
  if (!before) await expect.poll(() => page.locator('.app').evaluate(element => getComputedStyle(element).display)).toBe('grid');
  const sizes = before ? [[1280, 860]] : [[740, 600], [1000, 700], [1280, 860], [1920, 1080]];
  for (const [width, height] of sizes) {
    await desktop.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size.width, size.height), { width, height });
    const routes = before ? [['cards', '/cards']] : [['cards', '/cards'], ['decks', '/decks'], ['editor', '/decks/' + imported.data.id], ['solo', '/solo'], ['backups', '/backups'], ['app', '/app'], ['rules', '/rules']];
    for (const [name, route] of routes) {
      await page.evaluate(route => { window.location.hash = route; }, route);
      await expect(page.locator(name === 'editor' ? '.editor-page' : name === 'cards' ? '.card-grid' : 'main h1').first()).toBeVisible();
      await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
      const measured = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, mainWidth: document.querySelector('main')!.getBoundingClientRect().width }));
      measurements.push({ name, ...measured });
      if (!before) assert.ok(measured.scrollWidth <= measured.width + 1, `${name} at ${width}: overflow ${JSON.stringify(measured)}`);
      if (name === 'cards' || name === 'editor' || name === 'solo') await page.screenshot({ path: `${output}/${name}-${width}.png` });
      if (name === 'cards' && !before) {
        await page.getByRole('button', { name: 'Filters', exact: true }).click();
        await expect(page.locator('.filters select').first()).toBeVisible();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Expanded filters fit');
        await page.getByRole('button', { name: 'Filters', exact: true }).click();
        await page.locator('.art-button').first().click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        assert.equal(await page.getByRole('link', { name: /ebay/i }).count(), 0);
        const bounds = await dialog.boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'Card preview fits the window');
        await page.screenshot({ path: `${output}/preview-${width}.png` });
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
      }
      if (name === 'decks' && !before) {
        await page.getByRole('button', { name: 'Import Deck', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Import Deck', exact: true });
        await expect(dialog).toBeVisible();
        assert.ok(await dialog.evaluate(element => { const bounds = element.getBoundingClientRect(); return bounds.left >= 0 && bounds.right <= innerWidth; }), 'Deck import fits');
        await page.getByRole('button', { name: 'Close import', exact: true }).click();
      }
    }
  }
  if (!before) {
    const originalHash = await page.evaluate(() => location.hash);
    await page.getByRole('button', { name: 'Skip to workspace', exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => location.hash), originalHash);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'workspace');
    const nav = page.getByRole('link', { name: 'My decks', exact: true });
    await nav.focus();
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle !== 'none'));
    // Intercept only OS browser launch; exercise the actual renderer/main link boundary.
    await desktop.evaluate(({ shell }) => { (globalThis as any).__openedLinks = []; shell.openExternal = async url => { (globalThis as any).__openedLinks.push(url); }; });
    await page.evaluate(() => { window.open('https://www.ebay.com/sch/i.html', '_blank'); window.open('https://www.neuroscapetcg.com/', '_blank'); });
    await expect.poll(() => desktop.evaluate(() => (globalThis as any).__openedLinks)).toEqual(['https://www.neuroscapetcg.com/']);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(failedResources, []);
  await writeFile(`${output}/result.json`, JSON.stringify({ before, profileDirectory, measurements, rendererErrors: errors, noEbay: !before }, null, 2));
  console.log(`PASS: ${measurements.length} desktop route/size checks; screenshots in ${output}.`);
} finally { await desktop.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
