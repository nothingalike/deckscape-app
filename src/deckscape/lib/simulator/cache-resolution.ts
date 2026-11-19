import type { GameState } from "./game-state";
import { requireCurrentCardSource } from "./cache-source";
import type { CardCharacteristics } from "./characteristics";
import type { ResolutionContinuationBehavior } from "./resolution-continuation";
import {
  resolveScript,
  type ScriptBehavior,
  type ScriptEffects,
} from "./resolve-script";
import {
  resolveActivatedAbility,
  type ActivatedBehavior,
} from "./resolve-ability";

export interface CacheResolutionRuntime {
  definitions(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  scripts: ReadonlyMap<string, ScriptBehavior>;
  activated: ReadonlyMap<string, ActivatedBehavior>;
  continuations?: ReadonlyMap<string, ResolutionContinuationBehavior>;
  resources: ScriptEffects;
  /** Entry bindings own replacements and card-specific exceptions. No implicit base entry. */
  entries: {
    character(state: GameState): GameState;
    gear(state: GameState): GameState;
    protocol(state: GameState): GameState;
    environment(state: GameState): GameState;
  };
  /** Retained cache-trigger representation requires an explicit versioned interpreter. */
  triggered?(state: GameState): GameState;
}

/** Dispatch the captured action, preserving its source/choices and all resolution pauses. */
export function resolveCacheAction(
  state: GameState,
  runtime: CacheResolutionRuntime,
): GameState {
  const action = state.priorityWindow?.resolving;
  if (
    state.outcome ||
    state.pendingDecision ||
    state.resolutionContinuation ||
    !state.triggersOrdered ||
    state.pendingRuleEvents.length ||
    state.pendingTriggers.length ||
    !action ||
    state.priorityWindow?.resolutionApplied
  )
    throw new Error("Cache resolution is not ready");
  const next = structuredClone(state);
  if (action.kind === "activated")
    return resolveActivatedAbility(next, runtime.activated, runtime.resources);
  if (action.kind === "triggered") {
    if (!runtime.triggered)
      throw new Error("Cache trigger interpreter unavailable");
    return runtime.triggered(next);
  }
  if (!state.cache.includes(action.sourceId))
    throw new Error("Resolving card is absent from cache");
  requireCurrentCardSource(state, action);
  const object = state.objects[action.sourceId];
  const definitions = runtime.definitions(structuredClone(state));
  const card = definitions.get(object.definitionVersion);
  if (!card) throw new Error("Resolving card definition unavailable");
  if (card.cardType === "character") return runtime.entries.character(next);
  if (card.cardType === "gear") return runtime.entries.gear(next);
  if (card.cardType !== "program")
    throw new Error("Unsupported cached card type");
  if (card.subtype === "script")
    return resolveScript(next, definitions, runtime.scripts, runtime.resources);
  return runtime.entries[card.subtype](next);
}
