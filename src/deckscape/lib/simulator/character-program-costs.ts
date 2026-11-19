import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";
import { validateProgramHistory } from "./program-history";

export interface CharacterProgramCostSpecification {
  handlerId: string;
  handlerVersion: number;
  kind: "first-hacker-program-or-trojan";
  amount: number;
}

/** A cost contribution, combined with other increases/reductions before clamping the total to zero. */
export function characterProgramCosts(
  definitions: readonly {
    version: string;
    costs: readonly CharacterProgramCostSpecification[];
  }[],
  engineVersion: string,
  rulesVersion: string,
  effects: {
    characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
    hasAbility(state: GameState, sourceId: string, handler: string): boolean;
  },
) {
  const bindings = new Map(
    definitions.map((definition) => [definition.version, definition.costs]),
  );
  if (
    bindings.size !== definitions.length ||
    definitions.some((definition) =>
      definition.costs.some(
        (cost) =>
          cost.kind !== "first-hacker-program-or-trojan" ||
          !Number.isSafeInteger(cost.amount) ||
          cost.amount <= 0,
      ),
    )
  )
    throw new Error("Invalid character program cost specification");
  const qualifies = (card: {
    factions: readonly string[];
    tags: readonly string[];
  }) => card.factions.includes("HACKER") || card.tags.includes("TROJAN");
  return {
    programCostReduction(
      state: GameState,
      player: Seat,
      programId: string,
    ): number {
      if (
        state.engineVersion !== engineVersion ||
        state.rulesVersion !== rulesVersion
      )
        throw new Error("Character program cost version mismatch");
      if (player !== 0 && player !== 1)
        throw new Error("Invalid program player");
      const current = effects.characteristics(structuredClone(state)),
        program = current.get(programId);
      if (!state.objects[programId] || program?.cardType !== "program")
        throw new Error("Program cost characteristics unavailable");
      if (state.turn.activePlayer !== player || !qualifies(program)) return 0;
      const costs = state.arena.flatMap((sourceId) => {
        const source = state.objects[sourceId],
          card = current.get(sourceId);
        return source.controller !== player ||
          source.faceDown ||
          card?.cardType !== "character"
          ? []
          : (bindings.get(source.definitionVersion) ?? []).filter((cost) =>
              effects.hasAbility(
                structuredClone(state),
                sourceId,
                cost.handlerId,
              ),
            );
      });
      if (!costs.length) return 0;
      validateProgramHistory(state);
      if (state.programHistory === null)
        throw new Error(
          "Earlier program plays are unknown for this retained turn",
        );
      if (
        state.programHistory.some(
          (play) =>
            play.turn === state.turn.number &&
            play.player === player &&
            qualifies(play),
        )
      )
        return 0;
      const reduction = costs.reduce((sum, cost) => sum + cost.amount, 0);
      if (!Number.isSafeInteger(reduction))
        throw new Error("Program cost reduction exceeds supported range");
      return reduction;
    },
  };
}
