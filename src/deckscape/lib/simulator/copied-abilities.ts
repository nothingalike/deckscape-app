import { z } from "zod";
import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";

/** Retain an executable ability binding, not a donor object or its continuous effects. */
export const copiedAbilitySchema = z
  .object({
    kind: z.enum(["character", "gear", "ctrl-c"]),
    definitionVersion: z.string().regex(/^[a-f0-9]{64}$/),
    abilityId: z.string().min(1),
  })
  .strict();
export type CopiedAbility = z.infer<typeof copiedAbilitySchema>;

export function applyCopiedAbilities(
  state: GameState,
  cards: ReadonlyMap<string, CardCharacteristics>,
  describe: (copy: CopiedAbility) => {
    name: string;
    ramCost: number;
    run: boolean;
    additionalCostText?: string;
  },
): Map<string, CardCharacteristics> {
  const result = new Map(cards);
  for (const id of state.arena) {
    const card = cards.get(id),
      copy = state.objects[id].copiedAbility;
    if (copy && card?.cardType === "character") {
      const ability = describe(copy);
      result.set(id, { ...card, activatedAbilities: [ability] });
    }
  }
  return result;
}
