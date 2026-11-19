import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";

export interface CharacterDrawReplacementSpecification {
  handlerId: string;
  handlerVersion: number;
  kind: "extra-draw-outside-own-initialize";
  amount: number;
}

/** Additive contribution for one draw instruction, not for each card moved.
 * User ruling: Ashara changes Draw 2 into Draw 3. The owning resource evaluator
 * still handles prohibitions and any competing replacement choices. */
export function characterDrawReplacements(
  definitions: readonly {
    version: string;
    replacements: readonly CharacterDrawReplacementSpecification[];
  }[],
  engineVersion: string,
  rulesVersion: string,
  effects: {
    characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
    hasAbility(state: GameState, sourceId: string, handler: string): boolean;
  },
) {
  const bindings = new Map(
    definitions.map((definition) => [
      definition.version,
      definition.replacements,
    ]),
  );
  if (
    bindings.size !== definitions.length ||
    definitions.some((definition) =>
      definition.replacements.some(
        (replacement) =>
          replacement.kind !== "extra-draw-outside-own-initialize" ||
          !Number.isSafeInteger(replacement.amount) ||
          replacement.amount < 1,
      ),
    )
  )
    throw new Error("Invalid character draw replacement specification");
  return {
    additionalDraws(
      state: GameState,
      player: Seat,
      onContribution?: (name: string, amount: number) => void,
    ): number {
      if (
        state.engineVersion !== engineVersion ||
        state.rulesVersion !== rulesVersion
      )
        throw new Error("Character draw replacement version mismatch");
      if (player !== 0 && player !== 1)
        throw new Error("Invalid drawing player");
      if (
        state.turn.activePlayer === player &&
        ["system-check", "refresh", "draw-install", "force-quit"].includes(
          state.turn.step,
        )
      )
        return 0;
      const current = effects.characteristics(structuredClone(state));
      let additional = 0;
      for (const sourceId of state.arena) {
        const source = state.objects[sourceId];
        if (source.controller !== player || source.faceDown) continue;
        const replacements = bindings.get(source.definitionVersion);
        if (!replacements?.length) continue;
        const card = current.get(sourceId);
        if (!card)
          throw new Error(
            "Draw replacement source characteristics unavailable",
          );
        if (card.cardType !== "character") continue;
        for (const replacement of replacements) {
          if (
            effects.hasAbility(
              structuredClone(state),
              sourceId,
              replacement.handlerId,
            )
          ) {
            additional += replacement.amount;
            onContribution?.(card.name, replacement.amount);
          }
        }
      }
      if (!Number.isSafeInteger(additional))
        throw new Error("Draw replacement count exceeds supported range");
      return additional;
    },
  };
}
