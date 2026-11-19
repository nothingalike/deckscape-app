import type { AbilityChoices } from "./activate-ability";
import {
  activatedDamage,
  type ActivatedDamageEffects,
} from "./activated-damage";
import type { CardCharacteristics } from "./characteristics";
import type { GameState } from "./game-state";
import { applyHealthChanges } from "./health";
import type { ActivatedAction, ActivatedBehavior } from "./resolve-ability";
import type { ActivationVariant } from "./activation-option";

export const isChannelAbility = (id: string) =>
  ["virtue", "healing-waters", "malice"].includes(id);

/** Retain the chosen channel on the cache; conditional health amounts are evaluated at resolution. */
export function channelCharacterAbility(
  id: string,
  source: CardCharacteristics,
  effects: ActivatedDamageEffects,
) {
  if (!isChannelAbility(id)) throw Error("Unknown channel ability");
  function channel(choices: AbilityChoices): "MF" | "BF" {
    if (
      choices.modes.length !== 1 ||
      ![0, 1].includes(choices.modes[0]) ||
      choices.x !== null ||
      choices.targets.length ||
      (id !== "malice" && choices.playerTarget !== undefined)
    )
      throw Error("Invalid health/damage choices");
    return choices.modes[0] === 0 ? "MF" : "BF";
  }
  const damage = (selected: "MF" | "BF") =>
    activatedDamage(
      {
        recipient: "player",
        minimum: 1,
        maximum: 1,
        amount: 2,
        channel: selected,
      },
      source,
      effects,
    );
  const withoutMode = (action: ActivatedAction): ActivatedAction => ({
    ...action,
    activatedAbility: {
      ...action.activatedAbility,
      choices: { ...action.activatedAbility.choices, modes: [] },
    },
  });
  const behavior: ActivatedBehavior = {
    hasLegalTargets(state, action) {
      const selected = channel(action.activatedAbility.choices);
      return (
        id !== "malice" ||
        damage(selected).behavior.hasLegalTargets(state, withoutMode(action))
      );
    },
    resolve(state, action, resources) {
      const selected = channel(action.activatedAbility.choices);
      if (id === "malice")
        return damage(selected).behavior.resolve(
          state,
          withoutMode(action),
          resources,
        );
      const current = effects.characteristics(state);
      const amrita = state.environment.some(
        (objectId) =>
          !state.objects[objectId].faceDown &&
          current.get(objectId)?.name.toUpperCase() === "THE AMRITA",
      );
      const amount = id === "virtue" ? 2 : amrita ? 5 : 3;
      return applyHealthChanges(state, action.sourceId, [
        {
          player: action.controller,
          channel: selected,
          amount,
          operation: "gain",
          cause: "effect",
        },
      ]);
    },
  };
  return {
    behavior,
    validate(state: GameState, sourceId: string, choices: AbilityChoices) {
      const selected = channel(choices);
      if (id === "malice")
        damage(selected).validate(state, sourceId, { ...choices, modes: [] });
    },
    variants(state: GameState, sourceId: string): ActivationVariant[] {
      return (["MF", "BF"] as const).map((selected) => ({
        ...(id === "malice"
          ? damage(selected).variant(state, sourceId)
          : { x: null, targets: [] }),
        key: selected,
        label: `${id === "malice" ? "Deal damage" : "Gain health"}: ${selected}`,
        modes: [selected === "MF" ? 0 : 1],
      }));
    },
  };
}
