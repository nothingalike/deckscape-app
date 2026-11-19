import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import { rollD20 } from "./random";
import {
  captureEventObservation,
  type EventObservation,
} from "./event-observation";

export interface CardDieRollEvent extends EventObservation {
  type: "card-die-rolled";
  sourceId: string;
  player: Seat;
  sides: 20;
  /** Final result after applicable roll replacements/modifiers. */
  result: number;
  /** Public instruction selected by this roll; older saved events may omit it. */
  outcome?: string;
}
export interface GenerationalWealthEffects {
  roll(
    state: GameState,
    sourceId: string,
    player: Seat,
  ): { state: GameState; value: number };
  install(
    state: GameState,
    sourceId: string,
    player: Seat,
    running: boolean,
  ): GameState;
}

/** Base die roll only; the release adds applicable replacements and modifiers. */
export function baseCardD20(state: GameState) {
  const rolled = rollD20(state.random),
    next = structuredClone(state);
  next.random = rolled.state;
  return { state: next, value: rolled.value };
}

export function generationalWealth(
  state: GameState,
  sourceId: string,
  player: Seat,
  effects: GenerationalWealthEffects,
): GameState {
  const rolled = effects.roll(structuredClone(state), sourceId, player);
  if (
    !Number.isSafeInteger(rolled.value) ||
    rolled.state.revision !== state.revision ||
    rolled.state.engineVersion !== state.engineVersion ||
    rolled.state.rulesVersion !== state.rulesVersion ||
    rolled.state.pendingDecision
  )
    throw new Error("Invalid GENERATIONAL WEALTH roll");
  let next = rolled.state;
  next.pendingRuleEvents.push({
    type: "card-die-rolled",
    sourceId,
    player,
    sides: 20,
    result: rolled.value,
    outcome:
      rolled.value >= 9
        ? "PASSED (9+): install 1 RAM running."
        : "FAILED (below 9): no RAM installed.",
    ...captureEventObservation(next),
  });
  if (!next.outcome && rolled.value >= 9)
    next = effects.install(next, sourceId, player, true);
  return next;
}
