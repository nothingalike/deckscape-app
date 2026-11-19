import type { GameState } from "./game-state";
import type { ProgramChoices } from "./play-program";
import type { ScriptBehavior } from "./resolve-script";
import type { ProgramPlayVariant } from "./program-play-option";
import type { DestructionScriptEffects } from "./destruction-scripts";
import { isCurrentActionTarget } from "./action-targets";
import type { Seat } from "./setup";

export function singleDepartureProgram(
  kind: "mirage" | "the-hermit" | "trample",
  effects: DestructionScriptEffects & {
    move(
      state: GameState,
      id: string,
      destination: "hand" | "cyberdeck",
      position?: "top",
    ): GameState;
  },
) {
  const shape = (c: ProgramChoices) => {
    if (
      c.targets.length !== 1 ||
      c.modes.length ||
      c.x !== null ||
      c.playerTarget !== undefined ||
      c.mainframeTarget ||
      (c.reversed && kind !== "the-hermit")
    )
      throw Error("Invalid departure choices");
    return c.targets[0];
  };
  const targets = (state: GameState, sourceId: string, controller: Seat) => {
    const current = effects.characteristics(state);
    return state.arena.filter((id) => {
      const c = current.get(id);
      if (
        c?.cardType !== "character" ||
        !effects.canTarget(state, sourceId, id)
      )
        return false;
      if (kind === "mirage")
        return (
          state.objects[id].controller === controller &&
          c.factions.includes("DUSTRUNNER")
        );
      if (kind === "trample")
        return (
          c.defence <= 2 &&
          !!state.combat?.blockers.some((b) => b.blockerId === id)
        );
      return true;
    });
  };
  const behavior: ScriptBehavior = {
    hasLegalTargets(s, a) {
      const id = shape(a.programChoices);
      return (
        isCurrentActionTarget(s, a, id) &&
        targets(s, a.sourceId, a.controller).includes(id)
      );
    },
    resolve(s, a) {
      const id = shape(a.programChoices);
      return kind === "trample"
        ? effects.destroy(s, a.sourceId, id)
        : a.programChoices.reversed
          ? effects.move(s, id, "cyberdeck", "top")
          : effects.move(s, id, "hand");
    },
  };
  return {
    behavior,
    validate(s: GameState, id: string, c: ProgramChoices) {
      if (!targets(s, id, s.objects[id].controller).includes(shape(c)))
        throw Error("Illegal departure target");
    },
    variants(s: GameState, id: string, reverse: boolean): ProgramPlayVariant[] {
      return (kind === "the-hermit" && reverse ? [false, true] : [false]).map(
        (reversed) => ({
          key: reversed ? "reversed" : "normal",
          label: reversed ? "Return to top of cyberdeck" : "Normal",
          modes: [],
          x: null,
          reversed,
          mainframes: null,
          targets: [
            {
              label:
                kind === "mirage"
                  ? "Your Dustrunner character"
                  : kind === "trample"
                    ? "Blocking character with defense 2 or less"
                    : "Target character",
              minimum: 1,
              maximum: 1,
              candidates: targets(s, id, s.objects[id].controller),
            },
          ],
        }),
      );
    },
  };
}
