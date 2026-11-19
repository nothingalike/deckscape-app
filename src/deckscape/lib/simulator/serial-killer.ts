import type { GameState } from "./game-state";
import type { AbilityChoices } from "./ability-choices";
import type { ActivatedBehavior } from "./resolve-ability";
import type { ActivationVariant } from "./activation-option";

function choice(c: AbilityChoices) {
  if (
    !c.cacheActionId ||
    c.targets.length ||
    c.modes.length ||
    c.x !== null ||
    c.playerTarget !== undefined ||
    c.sacrificeRam !== undefined ||
    c.sacrificeCharacters !== undefined
  )
    throw Error("Invalid Rewrite choices");
  return c.cacheActionId;
}
export const serialKiller = {
  validate(s: GameState, c: AbilityChoices) {
    if (!s.priorityWindow?.stack.some((a) => a.id === choice(c)))
      throw Error("Rewrite target is no longer on the cache");
  },
  variants(s: GameState): ActivationVariant[] {
    return (s.priorityWindow?.stack ?? []).map((a, i) => ({
      key: a.id,
      cacheActionId: a.id,
      label: `Move action ${i + 1} (${a.kind}, Player ${a.controller + 1}) to top`,
      modes: [],
      x: null,
      targets: [],
    }));
  },
  behavior: {
    hasLegalTargets(s, a) {
      return !!s.priorityWindow?.stack.some(
        (t) => t.id === choice(a.activatedAbility.choices),
      );
    },
    resolve(s, a) {
      const id = choice(a.activatedAbility.choices);
      const next = structuredClone(s),
        stack = next.priorityWindow!.stack;
      const index = stack.findIndex((t) => t.id === id);
      if (index >= 0) stack.push(...stack.splice(index, 1));
      // Preserve the action itself: no repayment, replay, retargeting or new incarnation.
      return next;
    },
  } satisfies ActivatedBehavior,
};
