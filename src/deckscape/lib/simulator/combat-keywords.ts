import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import { activeCombatEffects } from "./timed-combat-effects";

export type CombatKeyword = "STAMINA" | "STEALTH" | "VISION" | "OVERRUN";

/** The owning interpreter supplies printed/other keyword contributions for every
 * character, including explicit empty sets. Saved temporary grants and block
 * restrictions apply here. Tags and prose are not keyword evidence. */
export function combatKeywordRules(
  state: GameState,
  characteristics: ReadonlyMap<string, CardCharacteristics>,
  keywords: ReadonlyMap<string, ReadonlySet<CombatKeyword>>,
) {
  const characters = state.arena.filter(
    (id) => characteristics.get(id)?.cardType === "character",
  );
  const evaluated = new Map(
    characters.map((id) => {
      const values = keywords.get(id);
      if (!values) throw new Error(`Combat keywords unavailable for ${id}`);
      return [id, new Set(values)] as const;
    }),
  );
  const cannotBlock = new Set<string>();
  for (const effect of activeCombatEffects(state)) {
    if (effect.targetId === null) continue;
    if (effect.change.kind === "grant-keyword")
      evaluated.get(effect.targetId)?.add(effect.change.keyword);
    else if (effect.change.kind === "cannot-block")
      cannotBlock.add(effect.targetId);
  }
  const has = (id: string, keyword: CombatKeyword) => {
    const values = evaluated.get(id);
    if (!values) throw new Error(`Combat character unavailable: ${id}`);
    return values.has(keyword);
  };
  return {
    overrun: new Set(characters.filter((id) => has(id, "OVERRUN"))),
    hasStamina: (_snapshot: GameState, id: string) => has(id, "STAMINA"),
    /** Apply at block declaration only: later STEALTH does not remove existing blockers. */
    canBlock: (_snapshot: GameState, blockerId: string, attackerId: string) =>
      !cannotBlock.has(blockerId) &&
      (!has(attackerId, "STEALTH") || has(blockerId, "VISION")),
  };
}
