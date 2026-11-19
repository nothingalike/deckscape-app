import { assertGameZones, type GameState } from "./game-state";
import { requireCurrentCardSource } from "./cache-source";
import { isCurrentActionTarget } from "./action-targets";
import { advanceObjectIncarnation } from "./object-incarnation";
import type { Seat } from "./setup";
import { releaseCommittedRam } from "./ram";
import {
  counterProgramHasLegalTarget,
  type CounterTargetEvaluation,
} from "./counter-program-choices";
import type { ScriptBehavior } from "./resolve-script";

export interface CounterEvent {
  type: "cache-action-countered";
  player: Seat;
  sourceId: string;
  targetId: string;
  kind: "card" | "activated" | "triggered";
}

/** CR 701.4: an evaluated counter effect removes an unresolved action, never its paid costs. */
export function counterCacheAction(
  state: GameState,
  actionId: string,
  sourceId: string,
  permitted: boolean,
): GameState {
  const window = state.priorityWindow;
  if (state.outcome || !window) throw new Error("No counterable cache");
  const action = [...window.stack, ...window.triggers].find(
    (item) => item.id === actionId,
  );
  if (!action) throw new Error("Counter target is not pending on the cache");
  let next = structuredClone(state);
  if (!permitted) return next;
  next.priorityWindow!.stack = next.priorityWindow!.stack.filter(
    (item) => item.id !== actionId,
  );
  next.priorityWindow!.triggers = next.priorityWindow!.triggers.filter(
    (item) => item.id !== actionId,
  );
  if (action.kind === "card") {
    requireCurrentCardSource(state, action);
    if (!next.cache.includes(action.sourceId))
      throw new Error("Countered card is absent from cache");
    next = releaseCommittedRam(next, action.sourceId, "normal");
    next.cache = next.cache.filter((id) => id !== action.sourceId);
    const card = next.objects[action.sourceId];
    Object.assign(card, {
      controller: card.owner,
      running: false,
      abilitySpent: false,
      faceDown: false,
      damage: { MF: 0, BF: 0 },
      lastDamageSourceId: null,
      counters: {},
      attachments: [],
    });
    next.players[card.owner].zones.recycleBin.push(card.id);
    advanceObjectIncarnation(next, card.id);
  }
  next.pendingRuleEvents.push({
    type: "cache-action-countered",
    player: action.controller,
    sourceId,
    targetId: action.sourceId,
    kind: action.kind,
  });
  assertGameZones(next);
  return next;
}

/** Reviewed High Priestess: counter a character, or a program when played reversed.
 * Effective characteristics account for face-down targets and text/type changes.
 */
export function highPriestessScript(
  evaluateTargets: (
    state: GameState,
    sourceId: string,
  ) => CounterTargetEvaluation,
  counter: (state: GameState, actionId: string, sourceId: string) => GameState,
): ScriptBehavior {
  return {
    hasLegalTargets(state, action) {
      return (
        isCurrentActionTarget(
          state,
          action,
          action.programChoices.targets[0],
        ) &&
        counterProgramHasLegalTarget(
          state,
          action.sourceId,
          "high-priestess",
          action.programChoices,
          evaluateTargets(structuredClone(state), action.sourceId),
        )
      );
    },
    resolve(state, action) {
      const target = state.priorityWindow!.stack.find(
        (item) =>
          item.kind === "card" &&
          item.sourceId === action.programChoices.targets[0],
      )!;
      return counter(state, target.id, action.sourceId);
    },
  };
}
