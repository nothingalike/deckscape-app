import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { ActivatedBehavior } from "./resolve-ability";
import type { AbilityChoices } from "./activate-ability";
import {
  activatedDamage,
  type ActivatedDamageEffects,
} from "./activated-damage";
import { applyHealthChanges } from "./health";

export const isMoonPath = (id: string) =>
  id === "path-of-darkness" || id === "path-of-light";

/** BQ-001: double the amount, not the number of damage/health instructions. */
export function moonPath(
  id: string,
  source: CardCharacteristics,
  effects: ActivatedDamageEffects,
) {
  if (!isMoonPath(id)) throw Error("Unknown moon path");
  const dark = id === "path-of-darkness";
  const damage = (amount: number) =>
    activatedDamage(
      { recipient: "player", minimum: 1, maximum: 1, channel: "MF", amount },
      source,
      effects,
    );
  const shape = (choices: AbilityChoices) => {
    if (
      choices.targets.length ||
      choices.modes.length ||
      choices.x !== null ||
      (!dark && choices.playerTarget !== undefined)
    )
      throw Error("Invalid moon path choices");
  };
  const behavior: ActivatedBehavior = {
    hasLegalTargets(s, a) {
      shape(a.activatedAbility.choices);
      return !dark || damage(0).behavior.hasLegalTargets(s, a);
    },
    resolve(s, a, resources) {
      shape(a.activatedAbility.choices);
      const current = effects.characteristics(s);
      const count = s.players[a.controller].zones.recycleBin.filter(
        (cardId) => {
          const card = current.get(cardId);
          return card?.cardType === "program" && card.tags.includes("TAROT");
        },
      ).length;
      const partner = dark ? "LUNA, THE SACRED MOON" : "LILITH, THE DARK MOON";
      const paired = s.arena.some((cardId) => {
        const card = current.get(cardId),
          object = s.objects[cardId];
        return (
          object.controller === a.controller &&
          !object.faceDown &&
          card?.cardType === "character" &&
          card.name.toUpperCase() === partner
        );
      });
      const amount = count * (paired ? 2 : 1);
      if (dark) return damage(amount).behavior.resolve(s, a, resources);
      return applyHealthChanges(
        s,
        a.sourceId,
        (["MF", "BF"] as const).map((channel) => ({
          player: a.controller,
          channel,
          amount,
          operation: "gain",
          cause: "effect",
        })),
      );
    },
  };
  return {
    behavior,
    validate(s: GameState, sourceId: string, choices: AbilityChoices) {
      shape(choices);
      if (dark) damage(0).validate(s, sourceId, choices);
    },
    variants(s: GameState, sourceId: string) {
      return dark
        ? [damage(0).variant(s, sourceId)]
        : [
            {
              key: "normal",
              label: "Gain MF and BF health",
              modes: [],
              x: null,
              targets: [],
            },
          ];
    },
  };
}

export function moonSistersAllowReversal(
  s: GameState,
  id: string,
  versions: ReadonlySet<string>,
  current: ReadonlyMap<string, CardCharacteristics>,
  hasAbility: (s: GameState, id: string) => boolean,
) {
  const card = current.get(id),
    player = s.objects[id]?.controller;
  if (
    player === undefined ||
    card?.cardType !== "program" ||
    !card.tags.includes("TAROT")
  )
    return false;
  return s.arena.some(
    (sourceId) =>
      versions.has(s.objects[sourceId].definitionVersion) &&
      s.objects[sourceId].controller === player &&
      current.get(sourceId)?.cardType === "character" &&
      hasAbility(s, sourceId),
  );
}
