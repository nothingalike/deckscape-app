import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { ProgramChoices } from "./program-choices";
import type { CacheAction } from "./priority";
import type { ScriptBehavior } from "./resolve-script";
import type { ProgramPlayVariant } from "./program-play-option";
import { isCurrentActionTarget } from "./action-targets";
import { protectFromDestruction } from "./destruction-protection";
export function temperance(effects: {
  characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
  canTarget(s: GameState, source: string, id: string): boolean;
}) {
  const shape = (c: ProgramChoices) => {
    if (
      c.targets.length !== 1 ||
      c.modes.length ||
      c.x !== null ||
      c.playerTarget !== undefined ||
      c.mainframeTarget !== undefined ||
      c.runCharacters !== undefined
    )
      throw Error("Invalid Temperance choices");
  };
  const candidates = (s: GameState, id: string, reversed: boolean) => {
    const current = effects.characteristics(s);
    return [...s.arena, ...s.environment].filter(
      (target) =>
        current.get(target)?.cardType ===
          (reversed ? "program" : "character") &&
        effects.canTarget(s, id, target),
    );
  };
  const legalTargets = (s: GameState, a: CacheAction) => {
    const c = a.programChoices!;
    shape(c);
    return [
      isCurrentActionTarget(s, a, c.targets[0]) &&
        candidates(s, a.sourceId, c.reversed).includes(c.targets[0]),
    ];
  };
  const behavior: ScriptBehavior = {
    hasLegalTargets(s, a) {
      return legalTargets(s, a)[0];
    },
    resolve(s, a) {
      return legalTargets(s, a)[0]
        ? protectFromDestruction(s, a.sourceId, a.programChoices.targets[0])
        : s;
    },
  };
  return {
    behavior,
    shape,
    legalTargets,
    slotCandidates(s: GameState, a: CacheAction, _slot: number) {
      return new Set(candidates(s, a.sourceId, a.programChoices!.reversed));
    },
    validate(s: GameState, id: string, c: ProgramChoices) {
      shape(c);
      if (!candidates(s, id, c.reversed).includes(c.targets[0]))
        throw Error("Illegal Temperance target");
    },
    variants(s: GameState, id: string, reverse: boolean): ProgramPlayVariant[] {
      return (reverse ? [false, true] : [false]).map((reversed) => ({
        key: reversed ? "reversed" : "normal",
        label: reversed ? "Protect a program" : "Protect a character",
        modes: [],
        x: null,
        reversed,
        mainframes: null,
        targets: [
          {
            label: reversed ? "Target program" : "Target character",
            minimum: 1,
            maximum: 1,
            candidates: candidates(s, id, reversed),
          },
        ],
      }));
    },
  };
}
