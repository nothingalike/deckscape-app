import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { AbilityChoices } from "./activate-ability";
import type { ActivatedBehavior } from "./resolve-ability";
import type { ActivationVariant } from "./activation-option";
import type { CounterPlacement } from "./put-counters";
import { isCurrentActionTarget } from "./action-targets";

export interface CharacterCounterSpecification {
  counter: string;
  amount: number;
  another?: boolean;
  faction?: string;
}
export interface CharacterCounterEffects {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  canTarget(state: GameState, sourceId: string, targetId: string): boolean;
  /** Evaluate replacements/prohibitions before applying the counter batch. */
  putCounters(
    state: GameState,
    sourceId: string,
    placements: readonly CounterPlacement[],
  ): GameState;
}

export function characterCounterAbility(
  spec: CharacterCounterSpecification,
  effects: CharacterCounterEffects,
) {
  if (!spec.counter || !Number.isSafeInteger(spec.amount) || spec.amount < 1)
    throw new Error("Invalid character counter specification");
  const target = (choices: AbilityChoices) => {
    if (
      choices.targets.length !== 1 ||
      choices.modes.length ||
      choices.x !== null ||
      choices.playerTarget !== undefined
    )
      throw new Error("Invalid character counter choices");
    return choices.targets[0];
  };
  const candidates = (state: GameState, sourceId: string) => {
    const current = effects.characteristics(structuredClone(state));
    return state.arena.filter((id) => {
      const card = current.get(id);
      return (
        card?.cardType === "character" &&
        (!spec.another || id !== sourceId) &&
        (!spec.faction || card.factions.includes(spec.faction)) &&
        effects.canTarget(structuredClone(state), sourceId, id)
      );
    });
  };
  const behavior: ActivatedBehavior = {
    hasLegalTargets(state, action) {
      const id = target(action.activatedAbility.choices);
      return (
        isCurrentActionTarget(state, action, id) &&
        candidates(state, action.sourceId).includes(id)
      );
    },
    resolve(state, action) {
      if (!behavior.hasLegalTargets(state, action)) return state;
      return effects.putCounters(state, action.sourceId, [
        {
          instanceId: target(action.activatedAbility.choices),
          counter: spec.counter,
          amount: spec.amount,
        },
      ]);
    },
  };
  return {
    behavior,
    validate(state: GameState, sourceId: string, choices: AbilityChoices) {
      if (!candidates(state, sourceId).includes(target(choices)))
        throw new Error("Illegal character counter target");
    },
    variant(state: GameState, sourceId: string): ActivationVariant {
      return {
        key: "normal",
        label: "Normal",
        modes: [],
        x: null,
        targets: [
          {
            label: spec.faction
              ? `Target ${spec.another ? "another " : ""}${spec.faction} character`
              : "Target character",
            minimum: 1,
            maximum: 1,
            candidates: candidates(state, sourceId),
          },
        ],
      };
    },
  };
}
