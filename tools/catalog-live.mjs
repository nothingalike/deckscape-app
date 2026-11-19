import {launchDesktop} from './desktop-launch.mjs';
import { expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-live-catalog-'));
const env = { ...process.env, NEUROSCAPE_PROFILE_DIR: profileDirectory };
delete env.ELECTRON_RUN_AS_NODE;
delete env.NEUROSCAPE_CATALOG_FIXTURE_ORIGIN;
const executablePath = resolve(process.env.NEUROSCAPE_EXE ?? 'release/win-unpacked/Neuroscape Local.exe');
await mkdir('.local', { recursive: true });
const desktop = await launchDesktop({ executablePath, env });
try {
  const page = await desktop.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'Update cards', exact: true }).click();
  let status;
  const started = Date.now();
  while (Date.now() - started < 300000) {
    const result = await page.evaluate(() => window.neuroscape.catalogStatus());
    if (!result.ok) throw new Error(result.error.message);
    status = result.data;
    console.log(JSON.stringify({ phase: status.progress?.phase, done: status.progress?.done, total: status.progress?.total, running: status.running }));
    if (!status.running) break;
    await new Promise(resolveWait => setTimeout(resolveWait, 5000));
  }
  if (!status || status.running || !status.count || status.progress?.phase !== 'complete') {
    throw new Error(status?.progress?.message ?? 'Official-source rehearsal did not complete');
  }
  await expect(page.getByRole('button', { name: /^View / }).first()).toBeVisible();
  await page.getByRole('button', { name: /^View / }).first().click();
  await expect.poll(() => page.getByRole('dialog').locator('img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: '.local/catalog-live.png' });
  const report = { date: new Date().toISOString(), profileDirectory, status, durationMs: Date.now() - started, localArtworkDecoded: true, pageErrors: errors };
  await writeFile('.local/catalog-live.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ count: status.count, localArtworkDecoded: true, pageErrors: errors.length, durationMs: report.durationMs }));
} finally { await desktop.close(); }
