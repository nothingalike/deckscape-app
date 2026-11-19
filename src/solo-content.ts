import { expandedDefinitionsV6 } from './deckscape/lib/simulator/expanded-definitions-v6';
import { sourceMechanicsHash } from './deckscape/lib/simulator/review-integrity';
import type { SourceCard } from './deckscape/lib/catalog-import';
import baseline from './deckscape/data/simulator/catalog-baseline.json';
import roster from './data/bot-roster.json';
import { loadBotRoster, type RosterOpponent } from './bot-roster';

export interface SoloContent {
  release: ReturnType<typeof expandedDefinitionsV6>;
  mechanics: ReadonlyMap<string, string>;
  opponents: RosterOpponent[];
}

/** Reviewed, bundled data. Downloads never supply definitions, handlers, or strategies. */
export function bundledSoloContent(): SoloContent {
  const sources: SourceCard[] = baseline.cards.map(card => ({
    id: card.id, name: card.name, card_type: card.type, subtype: card.subtype,
    rules_text: card.rulesText, factions: card.factions, ram_cost: card.ramCost,
    attack: card.attack, defence: card.defence, attack_type: card.attackType,
    iconic: card.iconic, card_copies_limit: card.copiesLimit, set_code: card.setCode,
  }));
  const release = expandedDefinitionsV6();
  return {
    release,
    mechanics: new Map(sources.map(card => [card.id, sourceMechanicsHash(card)])),
    opponents: loadBotRoster(roster, release),
  };
}
