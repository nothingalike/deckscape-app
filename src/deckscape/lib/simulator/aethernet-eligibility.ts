import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { CardCharacteristics } from "./characteristics";
import { mainframeTierRequirements } from "./synergy";

export interface AethernetEligibility {
  sourceId: string;
  targetId: string;
  targetIncarnation: number;
  tier: 0 | 1;
}

/** The runtime supplies the admitted source version and applies the approved
 * printed-RAM multiplier separately from additional costs and modifiers.
 * Reevaluate for every announcement; this is not a lasting per-card grant. */
export function aethernetEligibility(
  state: GameState,
  player: Seat,
  targetId: string,
  sourceVersion: string,
  effects: {
    characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
    hasAbility(state: GameState, id: string): boolean;
  },
): AethernetEligibility | null {
  if (
    state.outcome ||
    !state.players[player].zones.recycleBin.includes(targetId)
  )
    return null;
  const target = state.objects[targetId];
  if (!target || target.token || target.faceDown) return null;
  const sourceId = state.players[player].zones.mainframe.find(
    (id) => state.objects[id]?.definitionVersion === sourceVersion,
  );
  if (
    !sourceId ||
    state.objects[sourceId].controller !== player ||
    state.objects[sourceId].faceDown ||
    !effects.hasAbility(state, sourceId)
  )
    return null;
  const cards = effects.characteristics(state),
    card = cards.get(targetId);
  if (
    cards.get(sourceId)?.cardType !== "mainframe" ||
    card?.cardType !== "program" ||
    !(
      card.tags.includes("TAROT") ||
      (card.subtype === "script" && card.factions.includes("HACKER"))
    )
  )
    return null;
  const tiers = mainframeTierRequirements(state, sourceId, cards);
  if (tiers.length !== 2)
    throw Error("Invalid Aethernet eligibility thresholds");
  const tier = tiers[1] ? 1 : tiers[0] ? 0 : null;
  return tier === null
    ? null
    : { sourceId, targetId, targetIncarnation: target.incarnation, tier };
}
