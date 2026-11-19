import { assertGameZones, type GameState } from "./game-state";
import { isCurrentCardSource, requireCurrentCardSource } from "./cache-source";
import { advanceObjectIncarnation } from "./object-incarnation";
import type { CardCharacteristics } from "./characteristics";
import type { CacheAction } from "./priority";
import type { ProgramChoices } from "./play-program";
import type { Seat } from "./setup";

export type ScriptAction = CacheAction & { programChoices: ProgramChoices };
export interface ScriptEffects {
  /** One complete draw instruction. Evaluate its replacements once, then perform
   * individual draws with current restrictions. Never ignore or split count. */
  draw(state: GameState, player: Seat, count: number): GameState;
  install(state: GameState, player: Seat, running: boolean): GameState;
}
export interface ScriptBehavior {
  /** True for untargeted effects; targeted effects recheck their captured choices. */
  hasLegalTargets(state: GameState, action: ScriptAction): boolean;
  resolve(
    state: GameState,
    action: ScriptAction,
    effects: ScriptEffects,
  ): GameState;
}
export interface ScriptEvent {
  type: "script-binned" | "script-purged";
  instanceId: string;
  player: Seat;
  reason: "resolved" | "all-targets-illegal";
}

/** CR 302.3b/606: resolve instructions, then bin. Dispatcher handles ensuing events/SBAs
 * before finishing the priority action. Decision-bearing scripts need a resumable handler.
 */
export function resolveScript(
  state: GameState,
  definitions: ReadonlyMap<string, CardCharacteristics>,
  behaviors: ReadonlyMap<string, ScriptBehavior>,
  effects: ScriptEffects,
): GameState {
  const action = state.priorityWindow?.resolving;
  if (
    state.outcome ||
    !action ||
    action.kind !== "card" ||
    !action.programChoices ||
    state.pendingRuleEvents.length ||
    state.pendingTriggers.length
  )
    throw new Error("No script resolution ready");
  const object = state.objects[action.sourceId];
  requireCurrentCardSource(state, action);
  const card = object && definitions.get(object.definitionVersion);
  if (
    !card ||
    card.cardType !== "program" ||
    card.subtype !== "script" ||
    !state.cache.includes(action.sourceId)
  )
    throw new Error("Resolving card is not a cached script");
  const behavior = behaviors.get(object.definitionVersion);
  if (!behavior)
    throw new Error(`Missing script behavior for ${object.definitionVersion}`);
  const captured: ScriptAction = {
    ...structuredClone(action),
    programChoices: structuredClone(action.programChoices),
  };
  const legal = behavior.hasLegalTargets(
    structuredClone(state),
    structuredClone(captured),
  );
  let next = structuredClone(state);
  if (legal) next = behavior.resolve(next, captured, effects);
  if (next.pendingDecision) {
    assertGameZones(next);
    return next;
  }
  return finishScriptResolution(
    next,
    legal ? "resolved" : "all-targets-illegal",
  );
}

/** Complete a synchronous or resumed script after all its resolution-time decisions. */
export function finishScriptResolution(
  state: GameState,
  reason: ScriptEvent["reason"] = "resolved",
): GameState {
  const action = state.priorityWindow?.resolving;
  if (!action || action.kind !== "card" || state.pendingDecision)
    throw new Error("Script completion unavailable");
  const next = structuredClone(state);
  // Effects may move the source themselves. Never pull it back from another zone.
  if (isCurrentCardSource(next, action)) {
    next.cache = next.cache.filter((id) => id !== action.sourceId);
    const source = next.objects[action.sourceId];
    Object.assign(source, {
      controller: source.owner,
      running: false,
      abilitySpent: false,
      faceDown: false,
      damage: { MF: 0, BF: 0 },
      lastDamageSourceId: null,
      counters: {},
      attachments: [],
    });
    const purge = action.purgeOnResolution && reason === "resolved";
    next.players[source.owner].zones[purge ? "purge" : "recycleBin"].push(
      action.sourceId,
    );
    advanceObjectIncarnation(next, action.sourceId);
    next.pendingRuleEvents.push({
      type: purge ? "script-purged" : "script-binned",
      instanceId: action.sourceId,
      player: action.controller,
      reason,
    });
  }
  assertGameZones(next);
  return next;
}

export function validateUntargetedScript(
  action: ScriptAction,
  reversal = false,
): void {
  const choices = action.programChoices;
  if (
    choices.targets.length ||
    choices.modes.length ||
    choices.x !== null ||
    choices.playerTarget !== undefined ||
    choices.mainframeTarget ||
    (!reversal && choices.reversed)
  )
    throw new Error("Invalid choices for untargeted script");
}

/** Reviewed Moon Flower Cactus: Draw 2. No card-name/prose matching at runtime. */
export const moonFlowerCactusScript: ScriptBehavior = {
  hasLegalTargets: (_state, action) => {
    validateUntargetedScript(action);
    return true;
  },
  resolve(state, action, effects) {
    return effects.draw(state, action.controller, 2);
  },
};

/** Reviewed The Empress: Draw 1, install 1 running (2 when played reversed). */
export const theEmpressScript: ScriptBehavior = {
  hasLegalTargets: (_state, action) => {
    validateUntargetedScript(action, true);
    return true;
  },
  resolve(state, action, effects) {
    let next = effects.draw(state, action.controller, 1);
    for (
      let i = 0;
      i < (action.programChoices.reversed ? 2 : 1) && !next.outcome;
      i++
    )
      next = effects.install(next, action.controller, true);
    return next;
  },
};
