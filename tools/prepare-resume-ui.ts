import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { openApplication } from '../src/application';

async function main() {
  const fixture = JSON.parse(await readFile('.local/solo-ui-profile.json', 'utf8'));
  const app = openApplication({ profileDirectory: fixture.profileDirectory, matchSeed: '0'.repeat(63) + '1' });
  const cases: { kind: string; id: string; before: unknown }[] = [];
  try {
    const deck = await app.execute({ type: 'deck.read', id: fixture.supportedId }); if (!deck.ok) throw new Error(deck.error.message);
    const opponents = await app.execute({ type: 'solo.opponents' }); if (!opponents.ok) throw new Error(opponents.error.message);
    for (const kind of ['setup', 'player', 'bot', 'incompatible']) {
      const created = await app.execute({ type: 'solo.createSetup', requestId: randomUUID(), deckId: deck.data.id,
        expectedRevision: deck.data.revision, opponentKey: opponents.data[0].key });
      if (!created.ok) throw new Error(created.error.message);
      const id = created.data.id;
      if (kind === 'player' || kind === 'bot') {
        let read = await app.execute({ type: 'match.read', id });
        if (!read.ok || read.data.phase !== 'setup' || read.data.setup.decision.type !== 'choose-starter' || read.data.setup.decision.seat !== 0)
          throw new Error('The controlled source seed must choose the player.');
        const startingPlayer = kind === 'bot' ? 1 : 0;
        const chose = await app.execute({ type: 'match.setup', id, commandId: randomUUID(), expectedRevision: 0,
          action: { type: 'choose-starter', startingPlayer } }); if (!chose.ok) throw new Error(chose.error.message);
        if (kind === 'bot') { const tick = await app.execute({ type: 'match.bot', id }); if (!tick.ok) throw new Error(tick.error.message); }
        read = await app.execute({ type: 'match.read', id }); if (!read.ok || read.data.phase !== 'setup') throw new Error('Opening hand unavailable.');
        const kept = await app.execute({ type: 'match.setup', id, commandId: randomUUID(), expectedRevision: read.data.setup.revision,
          action: { type: 'mulligan', bottomOrder: [] } }); if (!kept.ok) throw new Error(kept.error.message);
        if (kind === 'player') { const tick = await app.execute({ type: 'match.bot', id }); if (!tick.ok) throw new Error(tick.error.message); }
      }
      const before = await app.execute({ type: 'match.read', id }); if (!before.ok) throw new Error(before.error.message);
      cases.push({ kind, id, before });
    }
  } finally { await app.close(); }
  const incompatible = cases.find(item => item.kind === 'incompatible')!;
  const db = new DatabaseSync(join(fixture.profileDirectory, 'profile.sqlite'));
  try { db.prepare("UPDATE solo_setups SET payload=json_set(payload,'$.summary.engineVersion','unavailable-engine-v99') WHERE id=?").run(incompatible.id); }
  finally { db.close(); }
  await writeFile('.local/resume-ui-profile.json', JSON.stringify({ profileDirectory: fixture.profileDirectory, cases }, null, 2));
  console.log(JSON.stringify({ profileDirectory: fixture.profileDirectory, cases: cases.map(({ kind, id }) => ({ kind, id })) }));
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
