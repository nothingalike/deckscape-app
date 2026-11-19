import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { ActivatedBehavior } from "./resolve-ability";
import type { TriggerBehavior } from "./resolve-trigger";
import { scheduleTurnEndSourcePurge } from "./delayed-triggers";

export interface JudgmentDayEffects {
  characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
  destroy(s: GameState, sourceId: string, ids: readonly string[]): GameState;
  purge(s: GameState, sourceId: string, id: string): GameState;
}

/** JUDGMENT DAY is untargeted. Resolve the simultaneous destruction before
 * scheduling the source's later purge; ordinary destruction replacements apply. */
export function archangelJudgmentDay(
  version: string,
  handler: string,
  effects: JudgmentDayEffects,
) {
  const activated: ActivatedBehavior = {
    hasLegalTargets(_s, a) {
      const c = a.activatedAbility.choices;
      if (
        c.targets.length ||
        c.modes.length ||
        c.x !== null ||
        c.playerTarget !== undefined
      )
        throw Error("Invalid Judgment Day choices");
      return true;
    },
    resolve(s, a) {
      activated.hasLegalTargets(s, a);
      const current = effects.characteristics(s);
      const ids = [...s.arena, ...s.environment].filter(
        (id) =>
          id !== a.sourceId &&
          ["character", "program"].includes(current.get(id)?.cardType ?? ""),
      );
      const next = effects.destroy(s, a.sourceId, ids);
      return scheduleTurnEndSourcePurge(next, a);
    },
  };
  const triggered: TriggerBehavior = {
    resolve(s, t) {
      const d = t.delayed;
      if (
        !d ||
        d.kind !== "next-turn-end-purge-source" ||
        t.event.type !== "turn-ending" ||
        d.sourceDefinitionVersion !== version ||
        t.handler !== handler ||
        d.handler !== handler ||
        t.sourceId !== d.sourceId ||
        t.controller !== d.controller ||
        d.targetId !== d.sourceId
      )
        throw Error("Invalid Judgment Day purge trigger");
      if (
        !s.arena.includes(d.targetId) ||
        s.objects[d.targetId]?.incarnation !== d.targetIncarnation
      )
        return s;
      return effects.purge(s, d.sourceId, d.targetId);
    },
  };
  return { activated, triggered };
}
