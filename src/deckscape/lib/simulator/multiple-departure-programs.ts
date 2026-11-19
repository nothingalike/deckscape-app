import type { GameState } from "./game-state";
import type { ProgramChoices } from "./program-choices";
import type { CacheAction } from "./priority";
import type { CardCharacteristics } from "./characteristics";
import type { ScriptBehavior } from "./resolve-script";
import type { ProgramPlayVariant } from "./program-play-option";
import { isCurrentActionTarget } from "./action-targets";

export function multipleDepartureProgram(
  kind: "dust-to-dust" | "the-emperor",
  effects: {
    characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
    canTarget(state: GameState, sourceId: string, id: string): boolean;
    destroy(state: GameState, sourceId: string, ids: string[]): GameState;
    bounce(state: GameState, ids: string[]): GameState;
  },
) {
  const shape = (c: ProgramChoices) => {
    if (
      c.modes.length ||
      c.x !== null ||
      c.playerTarget !== undefined ||
      c.mainframeTarget !== undefined ||
      c.runCharacters !== undefined ||
      new Set(c.targets).size !== c.targets.length ||
      (kind === "dust-to-dust"
        ? c.targets.length !== 2 || c.reversed
        : c.targets.length > 2)
    )
      throw Error("Invalid multiple-target departure choices");
  };
  const candidates = (
    s: GameState,
    sourceId: string,
    reversed: boolean,
    slot: number,
  ) => {
    const current = effects.characteristics(s);
    const type =
      kind === "dust-to-dust"
        ? slot === 0
          ? "ram"
          : "character"
        : reversed
          ? "program"
          : "character";
    return [
      ...s.arena,
      ...s.environment,
      ...s.players.flatMap((p) => p.zones.ramBank),
    ].filter(
      (id) =>
        current.get(id)?.cardType === type &&
        effects.canTarget(s, sourceId, id),
    );
  };
  const legalTargets = (s: GameState, a: CacheAction) => {
    const c = a.programChoices!;
    shape(c);
    return c.targets.map(
      (id, i) =>
        isCurrentActionTarget(s, a, id) &&
        candidates(s, a.sourceId, c.reversed, i).includes(id),
    );
  };
  const behavior: ScriptBehavior = {
    hasLegalTargets(s, a) {
      const legal = legalTargets(s, a);
      return !legal.length || legal.some(Boolean);
    },
    resolve(s, a) {
      const legal = legalTargets(s, a),
        ids = a.programChoices.targets.filter((_id, i) => legal[i]);
      if (!ids.length) return s;
      return kind === "dust-to-dust"
        ? effects.destroy(s, a.sourceId, ids)
        : effects.bounce(s, ids);
    },
  };
  return {
    behavior,
    shape,
    legalTargets,
    slotCandidates(s: GameState, a: CacheAction, slot: number) {
      return new Set(
        candidates(s, a.sourceId, a.programChoices!.reversed, slot),
      );
    },
    validate(s: GameState, id: string, c: ProgramChoices) {
      shape(c);
      if (
        c.targets.some(
          (target, i) => !candidates(s, id, c.reversed, i).includes(target),
        )
      )
        throw Error("Illegal departure target");
    },
    variants(s: GameState, id: string, reverse: boolean): ProgramPlayVariant[] {
      return (kind === "the-emperor" && reverse ? [false, true] : [false]).map(
        (reversed) => ({
          key: reversed ? "reversed" : "normal",
          label: reversed ? "Return programs to hand" : "Normal",
          modes: [],
          x: null,
          reversed,
          mainframes: null,
          targets:
            kind === "dust-to-dust"
              ? [0, 1].map((slot) => ({
                  label: slot === 0 ? "Target RAM" : "Target character",
                  minimum: 1,
                  maximum: 1,
                  candidates: candidates(s, id, reversed, slot),
                }))
              : [
                  {
                    label: reversed ? "Target programs" : "Target characters",
                    minimum: 0,
                    maximum: 2,
                    candidates: candidates(s, id, reversed, 0),
                  },
                ],
        }),
      );
    },
  };
}
