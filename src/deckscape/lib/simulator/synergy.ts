import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";

export interface PlayerSynergy {
  persistents: number;
  factions: Record<string, number>;
}

/** CR 105.6/110/700.6: current in-play objects contribute to their controller.
 * Mainframes and the cache are excluded. Effective characteristics must already
 * account for faction changes, copies and face-down characteristics.
 */
export function evaluatePlayerSynergy(
  state: GameState,
  effective: ReadonlyMap<string, CardCharacteristics>,
): [PlayerSynergy, PlayerSynergy] {
  const ids = [
    ...state.arena,
    ...state.environment,
    ...state.players.flatMap((player) => player.zones.ramBank),
  ];
  if (new Set(ids).size !== ids.length)
    throw new Error("Duplicate in-play object in synergy evaluation");
  const totals: [PlayerSynergy, PlayerSynergy] = [
    { persistents: 0, factions: {} },
    { persistents: 0, factions: {} },
  ];
  const factions = [new Map<string, number>(), new Map<string, number>()];
  for (const id of ids) {
    const object = state.objects[id],
      card = effective.get(id);
    if (!object || !card)
      throw new Error("Missing persistent characteristics for synergy");
    if (
      card.cardType === "mainframe" ||
      (card.cardType === "program" && card.subtype === "script")
    )
      throw new Error("Nonpersistent card in an in-play zone");
    totals[object.controller].persistents++;
    for (const faction of new Set(card.factions))
      factions[object.controller].set(
        faction,
        (factions[object.controller].get(faction) ?? 0) + 1,
      );
  }
  for (const seat of [0, 1] as const)
    totals[seat].factions = Object.fromEntries(factions[seat]);
  return totals;
}

/** No positive requirement may be satisfied by a missing, negative or nonfinite count. */
export function meetsFactionRequirements(
  available: Readonly<Record<string, number>>,
  required: Readonly<Record<string, number>>,
): boolean {
  for (const [faction, amount] of Object.entries(required)) {
    const count = Object.hasOwn(available, faction) ? available[faction] : 0;
    if (
      !Number.isSafeInteger(amount) ||
      amount < 0 ||
      !Number.isSafeInteger(count) ||
      count < 0
    )
      throw new Error("Invalid faction requirement or synergy count");
    if (count < amount) return false;
  }
  return true;
}

/** CR 303.9: evaluate each printed threshold. Operators and choices between tiers
 * remain part of the mainframe's ability binding, not this eligibility calculation.
 */
export function mainframeTierRequirements(
  state: GameState,
  mainframeId: string,
  effective: ReadonlyMap<string, CardCharacteristics>,
): boolean[] {
  const seat = state.players.findIndex((player) =>
    player.zones.mainframe.includes(mainframeId),
  );
  const card = effective.get(mainframeId);
  if ((seat !== 0 && seat !== 1) || card?.cardType !== "mainframe")
    throw new Error("Mainframe requirements unavailable");
  const totals = evaluatePlayerSynergy(state, effective)[seat];
  // CR v1.1 208.6 / 303.9a: the numeric mainframe threshold excludes RAM.
  // Keep faction synergy separate and preserve previously pinned v1.0 matches.
  const persistents =
    state.rulesVersion === "1.1"
      ? [...state.arena, ...state.environment].filter(
          (id) =>
            state.objects[id].controller === seat &&
            effective.get(id)?.cardType !== "ram",
        ).length
      : totals.persistents;
  return card.tiers.map(
    (tier) =>
      persistents >= tier.persistents &&
      meetsFactionRequirements(totals.factions, tier.factions),
  );
}
