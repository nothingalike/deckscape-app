import {launchDesktop} from './desktop-launch.mjs';
import { expect, type ElectronApplication } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { botCandidates } from '../src/deckscape/lib/simulator/bot-policy';
import { readBotPlaybook } from '../src/deckscape/lib/simulator/bot-playbook';
import { passPriorityLabel } from '../src/deckscape/lib/simulator/turn-status';
import type { LocalMatchView, AppResult } from '../src/contract';

async function main() {
  const fixture = JSON.parse(await readFile('.local/solo-ui-profile.json', 'utf8'));
  const development = process.argv.includes('--development');
  const env = { ...process.env, NEUROSCAPE_PROFILE_DIR: fixture.profileDirectory };
  delete env.ELECTRON_RUN_AS_NODE; delete env.NEUROSCAPE_CATALOG_FIXTURE_ORIGIN;
  const executablePath = resolve(development ? 'node_modules/electron/dist/electron.exe' : process.env.NEUROSCAPE_EXE ?? 'release/win-unpacked/Neuroscape Local.exe');
  let desktop: ElectronApplication | undefined;
  const errors: string[] = [], consoleErrors: string[] = [];
  try {
    desktop = await launchDesktop({ executablePath, args: development ? ['.'] : [], env });
    assert.equal(await desktop.evaluate(async ({ session, net }) => {
      session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }));
      try { await net.fetch('https://www.neuroscapetcg.com/', { cache: 'no-store' }); return false; } catch { return true; }
    }), true);
    const page = await desktop.firstWindow(); page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') { consoleErrors.push(message.text()); console.error(message.text()); } });
    await expect(page.getByRole('link', { name: 'My decks', exact: true })).toBeVisible();
    const setup = await page.evaluate(async ({ deckId, requestId }) => {
      const deck = await window.neuroscape.readDeck(deckId); if (!deck.ok) throw new Error(deck.error.message);
      const opponents = await window.neuroscape.soloOpponents(); if (!opponents.ok) throw new Error(opponents.error.message);
      return window.neuroscape.createSoloSetup({ requestId, deckId, expectedRevision: deck.data.revision, opponentKey: opponents.data[0].key });
    }, { deckId: fixture.supportedId, requestId: randomUUID() });
    assert.ok(setup.ok, JSON.stringify(setup.ok ? {} : setup.error));
    await page.evaluate(id => { location.hash = '/solo/setup/' + id; }, setup.data.id);
    await page.getByRole('link', { name: 'Enter match', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Game setup', exact: true })).toBeVisible();
    for (let count = 0; count < 100; count++) {
      if (await page.getByRole('region', { name: 'Neuroscape battlefield', exact: true }).count()) break;
      const skip = page.getByRole('button', { name: 'Skip reveal', exact: true }); if (await skip.isVisible()) await skip.click();
      const first = page.getByRole('button', { name: 'Play first', exact: true }); if (await first.isVisible() && await first.isEnabled()) await first.click();
      const keep = page.getByRole('button', { name: 'Keep all five cards', exact: true });
      if (await keep.isVisible() && await keep.isEnabled()) {
        await expect(page.locator('[data-canvas-ready="true"]')).toBeVisible();
        await page.screenshot({ path: '.local/game-setup.png' }); await keep.click();
      }
      await page.waitForTimeout(100);
    }
    await expect(page.getByRole('region', { name: 'Neuroscape battlefield', exact: true })).toBeVisible();
    await expect.poll(() => page.locator('canvas').count()).toBeGreaterThan(0);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '.local/game-battlefield.png' });
    const texture = await page.evaluate(async () => {
      const response = await fetch('neuroscape://simulator/obsidian-material-v1.webp');
      const bitmap = await createImageBitmap(await response.blob()); const size = [bitmap.width, bitmap.height]; bitmap.close(); return { status: response.status, size };
    });
    assert.equal(texture.status, 200); assert.ok(texture.size[0] > 1);
    let completed = false, uiActions = 0, serviceDecisions = 0, finalView: LocalMatchView | undefined;
    for (let count = 0; count < 2000; count++) {
      const result: AppResult<LocalMatchView> = await page.evaluate(id => window.neuroscape.readMatch(id), setup.data.id); assert.ok(result.ok, JSON.stringify(result.ok ? {} : result.error));
      assert.equal(result.data.phase, 'game'); if (result.data.phase !== 'game') throw new Error('Setup regressed after the match started.');
      const snapshot = result.data.snapshot;
      if (snapshot.view.outcome) {
        assert.ok(snapshot.view.outcome.type === 'win'); assert.equal(snapshot.view.outcome.reason, 'health');
        finalView = result.data; completed = true; break;
      }
      const candidates = botCandidates(snapshot, readBotPlaybook(null, 'passive-ui-player'));
      const choice = candidates.find(candidate => candidate.action.type === 'pass') ?? candidates[0];
      if (choice) {
        await expect(page.getByRole('region', { name: 'Local match', exact: true })).toHaveAttribute('data-match-revision', String(snapshot.view.revision));
        const action = choice.action;
        const label = action.type === 'pass' ? passPriorityLabel(snapshot.view)
          : action.type === 'draw-install' ? action.choice === 'install' ? 'Install 1 RAM' : 'Draw 1 card'
          : action.type === 'force-quit' && !action.ids.length ? 'Continue without force quitting'
          : action.type === 'attack' && !action.ids.length ? 'No Attackers'
          : action.type === 'block' && !action.assignments.length ? 'Declare Blockers (0)' : null;
        if (label) {
          const button = page.getByRole('button', { name: label, exact: true });
          await expect(button).toBeEnabled(); await button.click(); uiActions++;
          await expect.poll(async () => {
            const read = await page.evaluate(id => window.neuroscape.readMatch(id), setup.data.id);
            return read.ok && read.data.phase === 'game' ? read.data.snapshot.view.revision : -1;
          }).toBeGreaterThan(snapshot.view.revision);
        } else {
          const sent = await page.evaluate(({ id, commandId, command }) => window.neuroscape.submitMatch(id, commandId, command),
            { id: setup.data.id, commandId: randomUUID(), command: { expectedRevision: snapshot.view.revision, action } });
          assert.ok(sent.ok, JSON.stringify(sent.ok ? {} : sent.error)); serviceDecisions++;
        }
      }
      const advanced = await page.evaluate(id => window.neuroscape.advanceMatchBot(id), setup.data.id);
      assert.ok(advanced.ok, JSON.stringify(advanced.ok ? {} : advanced.error));
      if (count % 30 === 0) console.log(JSON.stringify({ step: count, turn: snapshot.view.turn.number, uiActions, serviceDecisions }));
    }
    assert.equal(completed, true); assert.ok(uiActions > 10);
    await expect(page.getByText(/^(Opponent won|You won)\.$/).first()).toBeVisible();
    await page.screenshot({ path: '.local/game-outcome.png' });
    await page.getByRole('dialog', { name: 'Game result', exact: true }).getByRole('link', { name: 'Back to matchups', exact: true }).click();
    await expect(page).toHaveURL(/#\/solo$/);
    await page.evaluate(id => { location.hash = '/matches/' + id; }, setup.data.id);
    await page.getByRole('button', { name: 'Review board and log', exact: true }).click();
    await page.locator('summary[aria-label="Options"]').click();
    await page.getByRole('link', { name: 'Leave match view', exact: true }).click();
    await expect(page).toHaveURL(/#\/solo$/);
    assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []);
    await writeFile('.local/game-ui.json', JSON.stringify({ development, executablePath, setupControls: true, battlefield: true, texture,
      healthOutcome: true, outcomeReturnLink: true, leaveMatchViewLink: true, uiActions, serviceDecisions, finalView, matchId: setup.data.id,
      pageErrors: errors, consoleErrors }, null, 2));
    console.log('PASS: hosted setup, React/Pixi battlefield, real UI actions and a health-based outcome with HTTP/HTTPS denied.');
  } catch (error) {
    if (desktop) { const page = (await desktop.windows())[0]; if (page) { await page.screenshot({ path: '.local/game-failure.png' }); console.error((await page.locator('body').innerText()).slice(0,5000)); } }
    throw error;
  } finally { if (desktop) { await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy())).catch(() => {}); await desktop.close(); } }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
