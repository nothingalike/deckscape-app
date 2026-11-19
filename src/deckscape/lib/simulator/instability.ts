import {
  captureEventObservation,
  type EventObservation,
} from "./event-observation";
import { assertGameZones, type GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";
import { rollD20 } from "./random";

export interface InstabilityRollEvent extends Partial<EventObservation> {
  type: "instability-rolled";
  player: Seat;
  instanceId: string;
  value: number;
}
export interface InstabilityEvaluation {
  /** Effective characteristics by instance; tokens and modified types use the same lookup. */
  characteristics: ReadonlyMap<string, CardCharacteristics>;
  /** Engine-owned roll procedure, including applicable roll replacement/modification effects. */
  roll(
    state: GameState,
    instanceId: string,
  ): { state: GameState; value: number };
  /** One batch, with no destruction source (CR 702.17d). */
  destroySimultaneously(
    state: GameState,
    ids: readonly string[],
    sourceId: null,
  ): GameState;
}

/** Unmodified d20 procedure; the caller selects this only after checking roll effects. */
export function baseInstabilityRoll(state: GameState): {
  state: GameState;
  value: number;
} {
  const rolled = rollD20(state.random);
  const next = structuredClone(state);
  next.random = rolled.state;
  return { state: next, value: rolled.value };
}

/** CR 702.17: announce each eligible persistent, roll for all, then destroy failures together. */
export function resolveInstability(
  state: GameState,
  player: Seat,
  evaluated: InstabilityEvaluation,
): GameState {
  if (state.outcome) throw new Error("Game already ended");
  const candidates: string[] = [];
  for (const id of [...state.arena, ...state.environment]) {
    const object = state.objects[id];
    if (object.controller !== player) continue;
    const card = evaluated.characteristics.get(id);
    if (!card) throw new Error(`Missing instability characteristics for ${id}`);
    if (card.cardType === "character" || card.cardType === "program")
      candidates.push(id);
  }
  let next = structuredClone(state);
  const failed: string[] = [];
  for (const id of candidates) {
    const rolled = evaluated.roll(next, id);
    if (!Number.isSafeInteger(rolled.value))
      throw new Error("Invalid evaluated instability roll");
    next = rolled.state;
    next.pendingRuleEvents.push({
      type: "instability-rolled",
      ...captureEventObservation(next),
      player,
      instanceId: id,
      value: rolled.value,
    });
    if (rolled.value <= 10) failed.push(id);
    if (next.outcome) {
      assertGameZones(next);
      return next;
    }
  }
  if (failed.length) next = evaluated.destroySimultaneously(next, failed, null);
  assertGameZones(next);
  return next;
}
