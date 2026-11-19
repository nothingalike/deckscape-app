import { assertGameZones, type GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";
import type { CounterPlacement } from "./put-counters";
import { advanceObjectIncarnation } from "./object-incarnation";
import { captureEventObservation } from "./event-observation";

export interface RecycleCharacterEntryEffects {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  putCounters(
    state: GameState,
    sourceId: string,
    counters: readonly CounterPlacement[],
  ): GameState;
  prepareEntry?(state: GameState, id: string): GameState;
}

export interface RecycledSpiritEntry {
  player: Seat;
  id: string;
}
export interface IconicSpiritEntryChoice {
  player: Seat;
  name: string;
  candidates: string[];
}

/** CR 613.8/613.8b. Determine replacements before moving any simultaneous
 * entrants. Existing iconic objects prohibit entry; simultaneous duplicates
 * require a choice within their destination controller's group. */
export function planRecycledSpiritEntries(
  state: GameState,
  entries: readonly RecycledSpiritEntry[],
  effects: Pick<RecycleCharacterEntryEffects, "characteristics">,
): { eligible: RecycledSpiritEntry[]; choices: IconicSpiritEntryChoice[] } {
  if (
    state.outcome ||
    new Set(entries.map((e) => e.id)).size !== entries.length
  )
    throw Error("Invalid simultaneous recycled entries");
  const current = effects.characteristics(state);
  const inPlay = [
    ...state.arena,
    ...state.environment,
    ...state.players.flatMap((p) => p.zones.ramBank),
  ];
  const eligible: RecycledSpiritEntry[] = [];
  const groups = new Map<string, IconicSpiritEntryChoice>();
  for (const entry of entries) {
    const { id, player } = entry,
      object = state.objects[id],
      card = current.get(id);
    if (
      (player !== 0 && player !== 1) ||
      !object ||
      object.token ||
      object.owner !== player ||
      !state.players[player].zones.recycleBin.includes(id) ||
      card?.cardType !== "character"
    )
      throw Error("Recycled character entry unavailable");
    if (
      card.iconic &&
      inPlay.some(
        (other) =>
          state.objects[other].controller === player &&
          current.get(other)?.iconic &&
          current.get(other)?.name === card.name,
      )
    )
      continue;
    eligible.push({ ...entry });
    if (card.iconic) {
      const key = JSON.stringify([player, card.name]);
      const group = groups.get(key) ?? {
        player,
        name: card.name,
        candidates: [],
      };
      group.candidates.push(id);
      groups.set(key, group);
    }
  }
  return {
    eligible,
    choices: [...groups.values()].filter((g) => g.candidates.length > 1),
  };
}

/** Put a simultaneous batch into play, with all iconic selections validated
 * before any mutation. Unchosen duplicates already in the bin stay there.
 * All entrants and SPIRIT counters are present before entry is observed; the
 * caller settles once after the complete effect, never between these entries. */
export function returnCharactersWithSpirit(
  state: GameState,
  sourceId: string,
  entries: readonly RecycledSpiritEntry[],
  chosenIconics: readonly string[],
  effects: RecycleCharacterEntryEffects,
): GameState {
  if (!state.objects[sourceId])
    throw Error("Recycled entry source unavailable");
  const plan = planRecycledSpiritEntries(state, entries, effects);
  if (
    chosenIconics.length !== plan.choices.length ||
    new Set(chosenIconics).size !== chosenIconics.length ||
    plan.choices.some(
      (g) =>
        g.candidates.filter((id) => chosenIconics.includes(id)).length !== 1,
    ) ||
    chosenIconics.some(
      (id) => !plan.choices.some((g) => g.candidates.includes(id)),
    )
  )
    throw Error("Choose one character from each simultaneous iconic group");
  const grouped = new Set(plan.choices.flatMap((g) => g.candidates));
  const entering = plan.eligible.filter(
    (e) => !grouped.has(e.id) || chosenIconics.includes(e.id),
  );
  if (!entering.length) return state;
  let next = structuredClone(state);
  for (const { id, player } of entering) {
    next.players[player].zones.recycleBin = next.players[
      player
    ].zones.recycleBin.filter((other) => other !== id);
    next.arena.push(id);
    advanceObjectIncarnation(next, id);
    Object.assign(next.objects[id], {
      controller: player,
      running: false,
      abilitySpent: false,
      faceDown: false,
      attachments: [],
    });
  }
  next = effects.putCounters(
    next,
    sourceId,
    entering.map((e) => ({ instanceId: e.id, counter: "SPIRIT", amount: 1 })),
  );
  if (effects.prepareEntry)
    for (const { id } of entering) next = effects.prepareEntry(next, id);
  const current = effects.characteristics(next);
  const observation = captureEventObservation(next);
  for (const { id, player } of entering) {
    const card = current.get(id);
    if (card?.cardType !== "character")
      throw Error("Entry preparation changed character type");
    next.pendingRuleEvents.push({
      type: "character-entered",
      ...structuredClone(observation),
      player,
      instanceId: id,
      factions: [...card.factions],
    });
  }
  assertGameZones(next);
  return next;
}

/** Single-entry counterpart used by RECOMPILE. It follows the same replacements
 * and observation boundary without needing a simultaneous iconic selection. */
export function returnCharacterWithSpirit(
  state: GameState,
  player: Seat,
  sourceId: string,
  id: string,
  effects: RecycleCharacterEntryEffects,
): GameState {
  return returnCharactersWithSpirit(
    state,
    sourceId,
    [{ player, id }],
    [],
    effects,
  );
}
