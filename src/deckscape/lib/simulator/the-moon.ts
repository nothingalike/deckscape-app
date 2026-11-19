import type { GameState } from "./game-state";
import type { ProgramChoices } from "./program-choices";
import type { CacheAction } from "./priority";
import type { ScriptBehavior } from "./resolve-script";
import type { ProgramPlayVariant } from "./program-play-option";
import type { CharacterTargetEvaluation } from "./character-status-effects";
import {
  changePersistentStatus,
  type StatusEvaluation,
} from "./persistent-status";
import { isCurrentActionTarget } from "./action-targets";

export function theMoon(e: CharacterTargetEvaluation & StatusEvaluation) {
  const count = (s: GameState, reversed: boolean) => {
    if (s.cardPlayHistory == null)
      throw Error("The Moon requires complete card-play history");
    return s.cardPlayHistory.filter(
      (p) => p.turn === s.turn.number && (reversed || p.tags.includes("TAROT")),
    ).length;
  };
  const shape = (c: ProgramChoices) => {
    if (
      c.x === null ||
      !Number.isSafeInteger(c.x) ||
      c.x < 1 ||
      c.targets.length !== c.x ||
      new Set(c.targets).size !== c.targets.length ||
      c.modes.length ||
      c.playerTarget !== undefined ||
      c.mainframeTarget !== undefined ||
      c.runCharacters !== undefined ||
      c.cacheActionId !== undefined
    )
      throw Error("Invalid Moon choices");
  };
  const candidates = (s: GameState, id: string) => {
    const current = e.characteristics(s);
    return s.arena.filter(
      (target) =>
        current.get(target)?.cardType === "character" &&
        e.canTarget(s, id, target),
    );
  };
  const legalTargets = (s: GameState, a: CacheAction) => {
    const c = a.programChoices!;
    shape(c);
    const legal = new Set(candidates(s, a.sourceId));
    return c.targets.map(
      (id) => isCurrentActionTarget(s, a, id) && legal.has(id),
    );
  };
  const behavior: ScriptBehavior = {
    hasLegalTargets: (s, a) => legalTargets(s, a).some(Boolean),
    resolve(s, a) {
      const legal = legalTargets(s, a);
      return changePersistentStatus(
        s,
        a.sourceId,
        a.programChoices.targets
          .filter((_, i) => legal[i])
          .map((instanceId) => ({ instanceId, operation: "run" })),
        e,
      );
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
      // BQ-002: announcement fixes X before this play is recorded. Resolution
      // and explicit retargeting retain X rather than recounting later plays.
      const legal = new Set(candidates(s, id));
      if (c.x !== count(s, c.reversed) || c.targets.some((t) => !legal.has(t)))
        throw Error("Illegal Moon count or target");
    },
    variants(s: GameState, id: string, reverse: boolean): ProgramPlayVariant[] {
      if (s.cardPlayHistory == null) return [];
      const targets = candidates(s, id);
      return (reverse ? [false, true] : [false]).flatMap((reversed) => {
        const x = count(s, reversed);
        if (x < 1 || x > targets.length) return [];
        return [
          {
            key: reversed ? "reversed" : "normal",
            label: reversed ? "Count all cards played" : "Count tarots played",
            reversed,
            x: { minimum: x, maximum: x },
            modes: [],
            mainframes: null,
            targets: [
              {
                label: `Run ${x} characters`,
                minimum: x,
                maximum: x,
                candidates: targets,
              },
            ],
          },
        ];
      });
    },
  };
}
