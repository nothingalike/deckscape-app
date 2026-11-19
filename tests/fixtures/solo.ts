import { createHash } from 'node:crypto';
import { bundledSoloContent } from '../../src/solo-content';
import baseline from '../../src/deckscape/data/simulator/catalog-baseline.json';
import { versionDefinition } from '../../src/deckscape/lib/simulator/definition-version';
import { png } from './catalog';
import { openApplication } from '../../src/application';

/** Synthetic artwork is reviewed only in this injected test content, never in the app release. */
export function soloFixture() {
  const content = bundledSoloContent();
  const hash = createHash('sha256').update(png).digest('hex');
  content.release.definitions = new Map([...content.release.definitions].map(([id, pin]) => [id,
    versionDefinition({ ...pin.definition, artwork: { sha256: hash, path: `${id}/${hash}.png` } }, content.release.engine)]));
  const cards = baseline.cards.map(card => ({ id: card.id, name: card.name, card_type: card.type,
    subtype: card.subtype, rules_text: card.rulesText, factions: card.factions, ram_cost: card.ramCost,
    attack: card.attack, defence: card.defence, attack_type: card.attackType, iconic: card.iconic,
    card_copies_limit: card.copiesLimit, set_code: card.setCode,
    image_url: 'https://storage.googleapis.com/spicerack_media/cards/neuroscape/test.png' }));
  return { content, cards, hash, png };
}
export async function syncSolo(app: ReturnType<typeof openApplication>) {
  const start = await app.execute({ type: 'catalog.sync' });
  if (!start.ok) throw new Error(start.error.message);
  for (let count = 0; count < 1000; count++) {
    const result = await app.execute({ type: 'catalog.status' });
    if (!result.ok) throw new Error(result.error.message);
    if (!result.data.running) {
      if (result.data.progress?.phase !== 'complete') throw new Error(result.data.progress?.message);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Controlled sync did not finish.');
}
