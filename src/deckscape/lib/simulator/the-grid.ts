import type { GameState } from "./game-state";
import type { PendingTrigger } from "./rule-events";
import {
  topCardsTrigger,
  type TopCardsEffects,
  type TopCardsSpecification,
} from "./top-cards";

export const theGridIndex: TopCardsSpecification = {
  kind: "index",
  count: 3,
  cardType: "program",
};
export const blackMarketIndex: TopCardsSpecification = {
  kind: "index",
  count: 3,
  cardType: "gear",
};

export function theGrid(
  state: GameState,
  trigger: PendingTrigger,
  effects: TopCardsEffects,
  specification: TopCardsSpecification = theGridIndex,
): GameState {
  if (
    trigger.event.type !== "netcheck-started" ||
    trigger.optionalPlayer !== trigger.event.player
  )
    throw new Error("THE GRID player mismatch");
  return topCardsTrigger(state, trigger, specification, effects);
}
