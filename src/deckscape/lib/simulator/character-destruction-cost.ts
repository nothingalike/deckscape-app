import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { PersistentDeparture } from "./destruction";
export interface CharacterDestructionCostEffects {
  characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
  depart(s: GameState, intents: readonly PersistentDeparture[]): GameState;
}
/** BQ-003: actual destruction is required; ARMOR/SPIRIT do not replace cost destruction. */
export function characterDestructionCost(
  e: CharacterDestructionCostEffects,
  sourceId: string,
  faction?: string,
  another = false,
) {
  const candidates = (s: GameState) => {
    const cards = e.characteristics(s);
    return s.arena.filter((id) => {
      const c = cards.get(id);
      return (
        s.objects[id].controller === s.objects[sourceId].controller &&
        (!another || id !== sourceId) &&
        c?.cardType === "character" &&
        (!faction || c.factions.includes(faction))
      );
    });
  };
  const validate = (s: GameState, c: { sacrificeCharacters?: string[] }) => {
    if (
      c.sacrificeCharacters?.length !== 1 ||
      !candidates(s).includes(c.sacrificeCharacters[0])
    )
      throw Error("Choose one legal character to destroy for the cost");
  };
  return {
    candidates,
    validate,
    pay(s: GameState, c: { sacrificeCharacters?: string[] }) {
      validate(s, c);
      const ids = c.sacrificeCharacters!,
        next = e.depart(
          s,
          ids.map((id) => ({
            id,
            kind: "destroy",
            reason: "cost",
            sourceId,
            destroyedBy: s.objects[sourceId].controller,
          })),
        );
      if (
        next.pendingDecision ||
        ids.some(
          (id) =>
            next.arena.includes(id) ||
            !next.pendingRuleEvents
              .slice(s.pendingRuleEvents.length)
              .some(
                (event) =>
                  event.type === "persistent-destroyed" &&
                  event.instanceId === id,
              ),
        )
      )
        throw Error("Character destruction cost was not paid");
      return next;
    },
  };
}
