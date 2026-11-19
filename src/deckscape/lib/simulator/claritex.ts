import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { ProgramChoices } from "./program-choices";
import type { CacheAction } from "./priority";
import type { ScriptBehavior } from "./resolve-script";
import type { ProgramPlayVariant } from "./program-play-option";
import { isCurrentActionTarget } from "./action-targets";
import { grantPsychosisImmunity } from "./psychosis-immunity";
export function claritex(effects: {
  characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
  canTarget(s: GameState, source: string, id: string): boolean;
}) {
  const shape = (c: ProgramChoices) => {
    if (
      c.reversed ||
      c.targets.length !== 1 ||
      c.modes.length ||
      c.x !== null ||
      c.playerTarget !== undefined ||
      c.mainframeTarget !== undefined ||
      c.runCharacters !== undefined
    )
      throw Error("Invalid Claritex choices");
  };
  const candidates = (s: GameState, id: string) => {
    const current = effects.characteristics(s);
    return s.arena.filter(
      (target) =>
        current.get(target)?.cardType === "character" &&
        effects.canTarget(s, id, target),
    );
  };
  const legalTargets = (s: GameState, a: CacheAction) => {
    const c = a.programChoices!;
    shape(c);
    return [
      isCurrentActionTarget(s, a, c.targets[0]) &&
        candidates(s, a.sourceId).includes(c.targets[0]),
    ];
  };
  const behavior: ScriptBehavior = {
    hasLegalTargets(s, a) {
      return legalTargets(s, a)[0];
    },
    resolve(s, a) {
      return legalTargets(s, a)[0]
        ? grantPsychosisImmunity(
            s,
            a.sourceId,
            a.programChoices.targets[0],
            a.controller,
          )
        : s;
    },
  };
  return {
    behavior,
    shape,
    legalTargets,
    slotCandidates(s: GameState, a: CacheAction, _slot: number) {
      return new Set(candidates(s, a.sourceId));
    },
    validate(s: GameState, id: string, c: ProgramChoices) {
      shape(c);
      if (!candidates(s, id).includes(c.targets[0]))
        throw Error("Illegal Claritex target");
    },
    variants(
      s: GameState,
      id: string,
      _reverse: boolean,
    ): ProgramPlayVariant[] {
      return [
        {
          key: "normal",
          label: "Grant PSYCHOSIS immunity",
          modes: [],
          x: null,
          reversed: false,
          mainframes: null,
          targets: [
            {
              label: "Target character",
              minimum: 1,
              maximum: 1,
              candidates: candidates(s, id),
            },
          ],
        },
      ];
    },
  };
}
