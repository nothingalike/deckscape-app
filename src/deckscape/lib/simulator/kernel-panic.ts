import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { AbilityChoices } from "./activate-ability";
import type { ActivatedBehavior } from "./resolve-ability";
import type { ActivationVariant } from "./activation-option";
import type { CharacterCounterEffects } from "./character-counter-abilities";
import { isCurrentActionTarget } from "./action-targets";

/** BLACK HAT targets an opponent's mainframe object, not the opponent as a player target. */
export function kernelPanic(effects: CharacterCounterEffects) {
  const target = (choices: AbilityChoices) => {
    if (
      choices.targets.length !== 1 ||
      choices.modes.length ||
      choices.x !== null ||
      choices.playerTarget !== undefined
    )
      throw new Error("Invalid Kernel Panic choices");
    return choices.targets[0];
  };
  const candidates = (state: GameState, sourceId: string, controller: Seat) => {
    const current = effects.characteristics(structuredClone(state));
    return state.players[controller === 0 ? 1 : 0].zones.mainframe.filter(
      (id) =>
        current.get(id)?.cardType === "mainframe" &&
        state.objects[id].owner !== controller &&
        effects.canTarget(structuredClone(state), sourceId, id),
    );
  };
  const behavior: ActivatedBehavior = {
    hasLegalTargets(state, action) {
      const id = target(action.activatedAbility.choices);
      return (
        isCurrentActionTarget(state, action, id) &&
        candidates(state, action.sourceId, action.controller).includes(id)
      );
    },
    resolve(state, action) {
      if (!behavior.hasLegalTargets(state, action)) return state;
      return effects.putCounters(state, action.sourceId, [
        {
          instanceId: target(action.activatedAbility.choices),
          counter: "CORRUPTION",
          amount: 1,
        },
      ]);
    },
  };
  return {
    behavior,
    validate(state: GameState, sourceId: string, choices: AbilityChoices) {
      if (
        !candidates(
          state,
          sourceId,
          state.objects[sourceId].controller,
        ).includes(target(choices))
      )
        throw new Error("Illegal Kernel Panic target");
    },
    variant(
      state: GameState,
      sourceId: string,
      controller = state.objects[sourceId].controller,
    ): ActivationVariant {
      return {
        key: "normal",
        label: "Normal",
        modes: [],
        x: null,
        targets: [
          {
            label: "Target opponent's mainframe",
            minimum: 1,
            maximum: 1,
            candidates: candidates(state, sourceId, controller),
          },
        ],
      };
    },
  };
}
