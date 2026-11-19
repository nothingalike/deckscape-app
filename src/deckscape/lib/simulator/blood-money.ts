import type { GameState } from "./game-state";
import type { AbilityChoices, ActivationEvaluation } from "./activate-ability";
import type { ActivatedBehavior } from "./resolve-ability";
import type { ActivationVariant } from "./activation-option";
import type { CardCharacteristics } from "./characteristics";
import type { ActivatedDamageEffects } from "./activated-damage";

export interface BloodMoneyEffects extends ActivatedDamageEffects {
  destroyRam(
    state: GameState,
    sourceId: string,
    ids: readonly string[],
  ): GameState;
}

/** User-supplied Pitta clarification: RAM run for the base cost may also be
 * destroyed for X. Sacrifices are payment choices, never ability targets. */
export function bloodMoney(
  source: CardCharacteristics,
  effects: BloodMoneyEffects,
) {
  const candidates = (state: GameState, id: string) => {
    const current = effects.characteristics(structuredClone(state));
    return state.players[state.objects[id].controller].zones.ramBank.filter(
      (ram) =>
        current.get(ram)?.cardType === "ram" &&
        !state.objects[ram].attachments.some((link) => link.kind === "ram"),
    );
  };
  const shape = (choices: AbilityChoices) => {
    if (
      choices.targets.length ||
      choices.modes.length ||
      choices.x === null ||
      !Number.isSafeInteger(choices.x) ||
      choices.x < 0 ||
      (choices.playerTarget !== 0 && choices.playerTarget !== 1) ||
      !choices.sacrificeRam ||
      choices.sacrificeRam.length !== choices.x ||
      new Set(choices.sacrificeRam).size !== choices.sacrificeRam.length
    )
      throw new Error("Invalid BLOOD MONEY choices");
  };
  const legalPlayer = (
    state: GameState,
    id: string,
    choices: AbilityChoices,
  ) => {
    shape(choices);
    return effects.canTargetPlayer(state, id, choices.playerTarget!, source);
  };
  const validate = (state: GameState, id: string, choices: AbilityChoices) => {
    if (
      !legalPlayer(state, id, choices) ||
      choices.sacrificeRam!.some((ram) => !candidates(state, id).includes(ram))
    )
      throw new Error("Illegal BLOOD MONEY payment or target");
  };
  const behavior: ActivatedBehavior = {
    hasLegalTargets: (state, action) =>
      legalPlayer(state, action.sourceId, action.activatedAbility.choices),
    resolve(state, action) {
      const choices = action.activatedAbility.choices;
      if (!legalPlayer(state, action.sourceId, choices)) return state;
      return effects.damage(
        state,
        [
          {
            sourceId: action.sourceId,
            recipient: "player",
            player: choices.playerTarget!,
            amount: choices.x!,
            channel: "BF",
          },
        ],
        source,
      );
    },
  };
  return {
    validate,
    behavior,
    cost(id: string): NonNullable<ActivationEvaluation["additionalCost"]> {
      return {
        validate: (state, choices) => validate(state, id, choices),
        pay: (state, choices) =>
          effects.destroyRam(state, id, choices.sacrificeRam!),
      };
    },
    variant(state: GameState, id: string): ActivationVariant {
      const ram = candidates(state, id);
      return {
        key: "normal",
        label: "BLOOD MONEY",
        modes: [],
        x: { minimum: 0, maximum: ram.length },
        targets: [
          {
            label: "RAM to destroy (choose X)",
            purpose: "sacrifice-ram",
            minimum: 0,
            maximum: ram.length,
            candidates: ram,
          },
        ],
        playerTargets: ([0, 1] as const)
          .filter((player) =>
            effects.canTargetPlayer(state, id, player, source),
          )
          .map((player) => ({
            player,
            label: player === state.objects[id].controller ? "You" : "Opponent",
          })),
      };
    },
  };
}
