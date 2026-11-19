import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import { activeCombatEffects } from "./timed-combat-effects";

/** CR 702.11a.1/700.8: sum retained instances, with immunity removing all of them.
 * The owning ability evaluator supplies other applicable contributions (explicit []
 * for none), enabled temporary grant IDs after ability loss, and current immunity.
 * Total-changing effects such as doubling must be applied by their own binding afterward.
 */
export function psychosisValues(
  state: GameState,
  current: ReadonlyMap<string, CardCharacteristics>,
  evaluated: {
    contributions: ReadonlyMap<string, readonly number[]>;
    enabledGrants: ReadonlySet<string>;
    immune: ReadonlySet<string>;
  },
): ReadonlyMap<string, number> {
  const grants = activeCombatEffects(state).filter(
    (effect) => effect.change.kind === "grant-psychosis",
  );
  const totals = new Map<string, number>();
  for (const id of state.arena) {
    const card = current.get(id);
    if (!card) throw new Error("Psychosis characteristics unavailable");
    if (card.cardType !== "character") continue;
    const contributions = evaluated.contributions.get(id);
    if (!contributions) throw new Error("Psychosis contributions unavailable");
    const amounts = [...contributions];
    for (const grant of grants)
      if (
        grant.targetId === id &&
        grant.change.kind === "grant-psychosis" &&
        evaluated.enabledGrants.has(grant.id)
      )
        amounts.push(grant.change.amount);
    let total = 0;
    for (const amount of amounts) {
      if (
        !Number.isSafeInteger(amount) ||
        !Number.isSafeInteger(total + amount)
      )
        throw new Error("Psychosis total exceeds supported integer range");
      total += amount;
    }
    totals.set(id, evaluated.immune.has(id) ? 0 : total);
  }
  return totals;
}
