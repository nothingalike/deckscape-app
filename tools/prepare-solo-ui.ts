import { DatabaseSync, backup } from 'node:sqlite';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { openApplication } from '../src/application';
import { normalizeCard } from '../src/deckscape/lib/catalog-import';
import corrections from '../src/deckscape/data/corrections.json';

// Read-only original catalog; every UI mutation belongs to this disposable copy.
async function main() {
const live = JSON.parse(await readFile('.local/catalog-live.json', 'utf8'));
const profileDirectory = await mkdtemp(join(tmpdir(), 'neuroscape-solo-ui-'));
const source = new DatabaseSync(join(live.profileDirectory, 'profile.sqlite'), { readOnly: true });
try { await backup(source, join(profileDirectory, 'profile.sqlite')); } finally { source.close(); }
await cp(join(live.profileDirectory, 'artwork'), join(profileDirectory, 'artwork'), { recursive: true });
const app = openApplication({ profileDirectory });
try {
  const starters = await app.execute({ type: 'deck.starters' }); if (!starters.ok) throw new Error(starters.error.message);
  const opponents = await app.execute({ type: 'solo.opponents' }); if (!opponents.ok) throw new Error(opponents.error.message);
  const other = starters.data.find(deck => deck.key !== opponents.data[0].key)!;
  const supported = await app.execute({ type: 'deck.importStarter', key: other.key }); if (!supported.ok) throw new Error(supported.error.message);
  const invalid = await app.execute({ type: 'deck.create', name: 'UI incomplete draft' }); if (!invalid.ok) throw new Error(invalid.error.message);
  const cards = await app.execute({ type: 'catalog.list' }); if (!cards.ok) throw new Error(cards.error.message);
  const original = cards.data.items.find(card => card.card_type === 'character')!;
  const raw = { ...original.raw, id: randomUUID(), name: 'UI NEW UNSUPPORTED CARD' };
  const newCard = { ...normalizeCard(raw, corrections.basic_ram.id), image_hash: original.image_hash, image_path: original.image_path };
  const db = new DatabaseSync(join(profileDirectory, 'profile.sqlite'));
  try { db.prepare('INSERT INTO catalog_cards(snapshot_id,id,payload) SELECT snapshot_id,?,? FROM catalog_active WHERE id=1').run(newCard.id, JSON.stringify(newCard)); }
  finally { db.close(); }
  const unsupported = await app.execute({ type: 'deck.import', input: { format: 'json', text: JSON.stringify({ format: 'deckscape-backup', version: 1,
    deck: { name: 'UI unsupported draft', description: '', entries: [...supported.data.entries, { card_id: newCard.id, section: 'sideboard', quantity: 1 }] } }) } });
  if (!unsupported.ok) throw new Error(unsupported.error.message);
  const bot = starters.data.find(deck => deck.key === opponents.data[0].key)!;
  const playerCardId = supported.data.entries.find(entry => !bot.entries.some(other => other.card_id === entry.card_id))!.card_id;
  const botCardId = bot.entries.find(entry => !supported.data.entries.some(other => other.card_id === entry.card_id))!.card_id;
  const result = { profileDirectory, supportedId: supported.data.id, supportedName: supported.data.name,
    invalidId: invalid.data.id, unsupportedId: unsupported.data.id, newCardId: newCard.id, playerCardId, botCardId };
  await writeFile('.local/solo-ui-profile.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await app.close(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
