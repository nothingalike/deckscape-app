import {
  validateUntargetedScript,
  type ScriptBehavior,
} from "./resolve-script";
import type { CharacterStatusEvaluation } from "./character-status-effects";
import { changePersistentStatus } from "./persistent-status";
import { addUntilTurnEndStatEffect } from "./timed-stat-effects";
import { addUntilTurnEndCombatEffect } from "./timed-combat-effects";

/** Each instruction fixes its controlled faction recipients at resolution, without targeting them. */
export function factionProgram(
  kind: "hackathon" | "mad-honey",
  effects: CharacterStatusEvaluation,
): ScriptBehavior {
  return {
    hasLegalTargets(_state, action) {
      validateUntargetedScript(action);
      return true;
    },
    resolve(state, action) {
      validateUntargetedScript(action);
      const current = effects.characteristics(state),
        faction = kind === "hackathon" ? "HACKER" : "NANOBOT";
      const ids = state.arena.filter(
        (id) =>
          state.objects[id].controller === action.controller &&
          current.get(id)?.cardType === "character" &&
          current.get(id)!.factions.includes(faction),
      );
      if (kind === "hackathon")
        return changePersistentStatus(
          state,
          action.sourceId,
          ids.map((instanceId) => ({ instanceId, operation: "reboot" })),
          effects,
        );
      let next = state;
      for (const id of ids) {
        next = addUntilTurnEndStatEffect(
          next,
          action.sourceId,
          id,
          { layer: "7d", operation: "add", attack: 1, defence: 1 },
          current,
        );
        next = addUntilTurnEndCombatEffect(
          next,
          action.sourceId,
          id,
          { kind: "grant-keyword", keyword: "OVERRUN" },
          current,
        );
      }
      return next;
    },
  };
}
