import { evaluateTriggerChoice } from "./trigger-choice";
import type { Seat } from "./setup";
import type { GameCommand } from "./commands";
import {
  captureGameLog,
  recordLogCommand,
  recordLogResolution,
  recordLogTrigger,
} from "./game-log";
import type { GameState } from "./game-state";
import { evaluateTriggerTarget } from "./trigger-target";
import { evaluateOptionalTrigger } from "./optional-trigger";
import type { GameCommandRuntime } from "./commands";
import type { MatchRuntime } from "./match-service";
import { decodeGameState } from "./state-schema";
import { resumeResolutionContinuation } from "./resolution-continuation";
import { settleGame, type SettlementRuntime } from "./settle";
import {
  createStateBasedActionRunner,
  type StateBasedActionRuntime,
} from "./state-based-actions";
import {
  resolveNextRuleTrigger,
  type TriggerBehavior,
} from "./resolve-trigger";
import {
  resolveCacheAction,
  type CacheResolutionRuntime,
} from "./cache-resolution";

export interface EngineRuntimeBindings {
  engineVersion: string;
  rulesVersion: string;
  commands: Omit<
    GameCommandRuntime,
    "settle" | "triggerTarget" | "optionalTrigger" | "triggerChoice"
  >;
  automatic: Omit<
    SettlementRuntime,
    "stateBasedActions" | "resolveTrigger" | "resolveCache" | "resumeCache"
  >;
  stateBased: StateBasedActionRuntime;
  cache: CacheResolutionRuntime;
  triggers: ReadonlyMap<string, TriggerBehavior>;
  visibility: MatchRuntime["visibility"];
  battlefield: NonNullable<MatchRuntime["battlefield"]>;
}

/** Composition only. All permissions, replacements and card bindings must be supplied
 * by the release. Creating a runtime does not register it or enable new-match admission.
 */
export function createEngineRuntime(
  bindings: EngineRuntimeBindings,
  maxSteps = 10000,
): MatchRuntime {
  const { engineVersion, rulesVersion } = bindings;
  if (!engineVersion.trim() || !rulesVersion.trim())
    throw new Error("Engine runtime pins are required");
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 1)
    throw new Error("Invalid settlement limit");
  const assertPins = (state: GameState) => {
    if (
      state.engineVersion !== engineVersion ||
      state.rulesVersion !== rulesVersion
    )
      throw new Error("Engine runtime version mismatch");
    return state;
  };
  const automatic: SettlementRuntime = {
    ...bindings.automatic,
    combat: bindings.commands.combat,
    damage: bindings.commands.damage,
    log: (state) => captureGameLog(state, bindings.automatic.characteristics),
    stateBasedActions: createStateBasedActionRunner(bindings.stateBased),
    resolveTrigger: (state) => {
      let source: ReturnType<typeof recordLogTrigger> | undefined;
      const next = resolveNextRuleTrigger(
        state,
        bindings.triggers,
        (current, trigger) => {
          source = recordLogTrigger(
            current,
            trigger,
            bindings.automatic.characteristics,
          );
        },
      );
      return captureGameLog(next, bindings.automatic.characteristics, source);
    },
    resolveCache: (state) => {
      recordLogResolution(state, bindings.automatic.characteristics);
      return resolveCacheAction(state, bindings.cache);
    },
    resumeCache: (state) =>
      resumeResolutionContinuation(
        state,
        bindings.cache.continuations ?? new Map(),
      ),
  };
  return Object.freeze({
    decodeState: (input: unknown) => assertPins(decodeGameState(input)),
    commands: Object.freeze({
      ...bindings.commands,
      recordCommand: (
        state: GameState,
        action: GameCommand["action"],
        actor: Seat,
      ) => {
        recordLogCommand(state, action, actor);
        return captureGameLog(state, bindings.automatic.characteristics);
      },
      triggerChoice: (state: GameState) =>
        evaluateTriggerChoice(assertPins(state), bindings.triggers),
      optionalTrigger: (state: GameState) =>
        evaluateOptionalTrigger(assertPins(state), bindings.triggers),
      triggerTarget: (state: GameState) => ({
        ...evaluateTriggerTarget(assertPins(state), bindings.triggers),
        characteristics: bindings.automatic.characteristics(state),
      }),
      settle: (state: GameState) =>
        assertPins(settleGame(assertPins(state), automatic, maxSteps)),
    }),
    visibility: bindings.visibility,
    battlefield: bindings.battlefield,
  });
}
