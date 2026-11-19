import { isDeepStrictEqual } from "node:util";
import { assertGameZones, type GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import {
  applyPersistentDepartureBatch,
  type PersistentDeparture,
  type DepartureZone,
} from "./destruction";
import type { PersistentStateActionRuntime } from "./persistent-state-actions";
import type { ForceQuitEvaluation } from "./force-quit";

export interface DepartureRuntimeEffects {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  /** Evaluate the returned RAM's state after destruction replacements, before any departure. */
  ramReturnsRefreshed?(
    state: GameState,
    departure: PersistentDeparture,
  ): boolean;
  /** Resolve current prohibitions/replacements without applying the returned departures.
   * Other replacement effects may change this transaction. A replacement requiring
   * a saved player choice needs its own continuation before invoking this boundary. */
  replace(
    state: GameState,
    intents: readonly PersistentDeparture[],
  ): {
    state: GameState;
    departures: readonly PersistentDeparture[];
  };
}

/** Shared synchronous departure boundary for effects, SBAs and force quit. Evaluate
 * characteristics after replacement effects, then capture sources and move one batch. */
export function createDepartureRuntime(effects: DepartureRuntimeEffects) {
  const depart = (
    state: GameState,
    intents: readonly PersistentDeparture[],
  ): GameState => {
    if (state.outcome || state.pendingDecision)
      throw new Error("Departure resolution unavailable");
    const prepared = effects.replace(
      structuredClone(state),
      structuredClone(intents),
    );
    if (
      prepared.state.revision !== state.revision ||
      prepared.state.engineVersion !== state.engineVersion ||
      prepared.state.rulesVersion !== state.rulesVersion
    )
      throw new Error("Departure replacement changed transaction identity");
    if (prepared.state.pendingDecision)
      throw new Error("Departure replacement requires a saved continuation");
    assertGameZones(prepared.state);
    if (prepared.state.outcome || !prepared.departures.length)
      return structuredClone(prepared.state);
    const current = effects.characteristics(structuredClone(prepared.state));
    const refreshedRamHosts = new Set(
      prepared.departures
        .filter((departure) =>
          effects.ramReturnsRefreshed?.(
            structuredClone(prepared.state),
            structuredClone(departure),
          ),
        )
        .map((departure) => departure.id),
    );
    return applyPersistentDepartureBatch(
      prepared.state,
      prepared.departures,
      current,
      refreshedRamHosts,
    );
  };
  const destroy = (
    state: GameState,
    sourceId: string | null,
    targetId: string,
  ): GameState =>
    depart(state, [
      { id: targetId, kind: "destroy", sourceId, reason: "normal" },
    ]);
  const move = (
    state: GameState,
    id: string,
    destination: DepartureZone,
    position?: "top" | "bottom",
  ): GameState =>
    depart(state, [
      { id, kind: "move", destination, ...(position ? { position } : {}) },
    ]);
  const bin = (state: GameState, id: string): GameState =>
    depart(state, [{ id, kind: "bin" }]);
  const stateBased: PersistentStateActionRuntime["depart"] = (
    state,
    intents,
  ) => {
    const next = depart(state, intents);
    return {
      state: next,
      changed: !isDeepStrictEqual(state, next),
      decisionPending: false,
    };
  };
  const forceQuit: ForceQuitEvaluation["destroySimultaneously"] = (
    state,
    ids,
  ) =>
    depart(
      state,
      ids.map((id) => ({
        id,
        kind: "destroy",
        sourceId: null,
        reason: "force-quit",
      })),
    );
  return Object.freeze({ depart, destroy, move, bin, stateBased, forceQuit });
}
