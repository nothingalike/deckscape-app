import type { GameState } from "./game-state";
import type { ProgramChoices } from "./program-choices";
import type { ScriptBehavior } from "./resolve-script";
import type { ProgramPlayVariant } from "./program-play-option";
export function dejaVu() {
  const shape = (c: ProgramChoices) => {
    if (
      c.targets.length ||
      c.modes.length ||
      c.x !== null ||
      c.reversed ||
      c.playerTarget !== undefined ||
      c.mainframeTarget !== undefined ||
      c.runCharacters !== undefined
    )
      throw Error("Invalid Deja Vu choices");
  };
  const behavior: ScriptBehavior = {
    hasLegalTargets: () => true,
    resolve(s, a) {
      shape(a.programChoices);
      const next = structuredClone(s);
      next.extraTurns.push(a.controller);
      return next;
    },
  };
  return {
    behavior,
    shape,
    legalTargets: () => [],
    slotCandidates: () => new Set<string>(),
    validate(_s: GameState, _id: string, c: ProgramChoices) {
      shape(c);
    },
    variants(): ProgramPlayVariant[] {
      return [
        {
          key: "normal",
          label: "Pay 3 MF and 3 BF health; take an extra turn",
          modes: [],
          x: null,
          reversed: false,
          targets: [],
          mainframes: null,
        },
      ];
    },
  };
}
