import { assertGameZones, type GameState } from "./game-state";
import type { Seat } from "./setup";
import type { CardCharacteristics } from "./characteristics";
import type { ActivatedAction, ActivatedBehavior } from "./resolve-ability";
import { beginDeckSearch, revealSearchedCard } from "./deck-search";
import { shuffle } from "./random";
import {
  advanceObjectIncarnation,
  isCurrentIncarnation,
} from "./object-incarnation";

export const pastLifeHandler = "nova/past-life-v1";
export interface CharacterSearchSpecification {
  criteria:
    | { kind: "factions" | "tags"; values: string[] }
    | { kind: "name"; value: string };
  purgeSource: boolean;
}
export const pastLifeSpecification: CharacterSearchSpecification = {
  criteria: { kind: "factions", values: ["HACKER", "WONDERLAND"] },
  purgeSource: true,
};
export interface PastLifeEffects {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  canSearch(state: GameState, player: Seat): boolean;
  moveToHand(state: GameState, player: Seat, id: string): GameState;
  shuffleDeck(state: GameState, player: Seat): GameState;
  purgeSource(state: GameState, id: string): GameState;
}
export function characterSearchCandidates(
  state: GameState,
  player: Seat,
  effective: ReadonlyMap<string, CardCharacteristics>,
  spec: CharacterSearchSpecification,
): string[] {
  return state.players[player].zones.cyberdeck.filter((id) => {
    const card = effective.get(id);
    if (!card) throw new Error("Search card characteristics unavailable");
    if (state.objects[id].token) return false;
    const criteria = spec.criteria;
    return criteria.kind === "name"
      ? card.name === criteria.value
      : card[criteria.kind].some((value) => criteria.values.includes(value));
  });
}
export function finishCharacterSearch(
  state: GameState,
  action: ActivatedAction,
  selected: string | null,
  effects: PastLifeEffects,
  spec: CharacterSearchSpecification,
): GameState {
  let next = structuredClone(state);
  if (selected !== null) {
    const effective = effects.characteristics(structuredClone(next));
    if (
      !characterSearchCandidates(
        next,
        action.controller,
        effective,
        spec,
      ).includes(selected)
    )
      throw new Error("Invalid character search selection");
    next = revealSearchedCard(next, action.controller, selected, effective);
    next = effects.moveToHand(next, action.controller, selected);
  }
  if (next.outcome) return next;
  next = effects.shuffleDeck(next, action.controller);
  if (next.outcome) return next;
  // Once its source has left play it is no longer the object this instruction names.
  if (
    spec.purgeSource &&
    [
      ...next.arena,
      ...next.environment,
      ...next.players.flatMap((p) => p.zones.ramBank),
    ].includes(action.sourceId) &&
    isCurrentIncarnation(next, action.activatedAbility.source)
  )
    next = effects.purgeSource(next, action.sourceId);
  return next;
}
export function characterDeckSearch(
  effects: PastLifeEffects,
  handler: string,
  spec: CharacterSearchSpecification,
): ActivatedBehavior {
  return {
    hasLegalTargets(_state, action) {
      const choices = action.activatedAbility.choices;
      if (
        choices.targets.length ||
        choices.modes.length ||
        choices.x !== null ||
        choices.playerTarget !== undefined
      )
        throw new Error(
          "Character searches on resolution, not at announcement",
        );
      return true;
    },
    resolve(state, action) {
      if (!effects.canSearch(structuredClone(state), action.controller))
        return finishCharacterSearch(state, action, null, effects, spec);
      return beginDeckSearch(
        state,
        action,
        handler,
        characterSearchCandidates(
          state,
          action.controller,
          effects.characteristics(structuredClone(state)),
          spec,
        ),
        true,
      );
    },
  };
}

export const pastLifeCandidates = (
  state: GameState,
  player: Seat,
  effective: ReadonlyMap<string, CardCharacteristics>,
) => characterSearchCandidates(state, player, effective, pastLifeSpecification);
export const finishPastLife = (
  state: GameState,
  action: ActivatedAction,
  selected: string | null,
  effects: PastLifeEffects,
) =>
  finishCharacterSearch(
    state,
    action,
    selected,
    effects,
    pastLifeSpecification,
  );
export const novaPastLife = (effects: PastLifeEffects): ActivatedBehavior =>
  characterDeckSearch(effects, pastLifeHandler, pastLifeSpecification);

/** Base movement/shuffle primitives for an interpreter after replacement checks. */
export function moveSearchedCardToHand(
  state: GameState,
  player: Seat,
  id: string,
): GameState {
  if (!state.players[player].zones.cyberdeck.includes(id))
    throw new Error("Searched card is not in the cyberdeck");
  const next = structuredClone(state);
  next.players[player].zones.cyberdeck = next.players[
    player
  ].zones.cyberdeck.filter((value) => value !== id);
  next.players[player].zones.hand.push(id);
  advanceObjectIncarnation(next, id);
  assertGameZones(next);
  return next;
}
export function shuffleCyberdeck(state: GameState, player: Seat): GameState {
  const next = structuredClone(state);
  const shuffled = shuffle(next.players[player].zones.cyberdeck, next.random);
  next.players[player].zones.cyberdeck = shuffled.items;
  next.random = shuffled.state;
  return next;
}
