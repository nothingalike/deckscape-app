import type { GameState } from "./game-state";
import type { EnvironmentEffects } from "./environment-bindings";
import { finishScriptResolution, type ScriptBehavior } from "./resolve-script";
import type { ProgramChoices } from "./program-choices";
import type { ProgramPlayVariant } from "./program-play-option";
import {
  validateRamCostChoiceContinuation,
  type RamCostChoiceEvaluation,
} from "./ram-cost-choice";
import { revealSearchedCard } from "./deck-search";
import {
  captureEventObservation,
  type EventObservation,
} from "./event-observation";
import type { Seat } from "./setup";

export interface WheelOfFortuneEvent extends EventObservation {
  type: "wheel-of-fortune-revealed";
  sourceId: string;
  player: Seat;
  namedCost: number;
  revealed: string | null;
  revealedCost: number | null;
  matched: boolean;
}

export function wheelOfFortune(
  handler: string,
  effects: Pick<EnvironmentEffects, "characteristics" | "draw" | "install">,
) {
  const shape = (c: ProgramChoices) => {
    if (
      c.targets.length ||
      c.modes.length ||
      c.x !== null ||
      c.mainframeTarget !== undefined ||
      c.playerTarget !== undefined ||
      c.runCharacters !== undefined
    )
      throw Error("Invalid Wheel of Fortune choices");
  };
  const behavior: ScriptBehavior = {
    hasLegalTargets(_s, a) {
      shape(a.programChoices);
      return true;
    },
    resolve(s, a) {
      shape(a.programChoices);
      if (s.pendingDecision)
        throw Error("Wheel of Fortune resolution unavailable");
      const next = structuredClone(s);
      next.pendingDecision = {
        type: "ram-cost-choice",
        id: "ram-cost:" + a.id,
        sourceId: a.sourceId,
        actionId: a.id,
        player: a.controller,
        handler,
      };
      validateRamCostChoiceContinuation(next);
      return next;
    },
  };
  return {
    behavior,
    shape,
    legalTargets: () => [],
    slotCandidates: () => new Set<string>(),
    validate(_s: GameState, _id: string, c: ProgramChoices) {
      shape(c);
    },
    variants(
      _s: GameState,
      _id: string,
      reverse: boolean,
    ): ProgramPlayVariant[] {
      return (reverse ? [false, true] : [false]).map((reversed) => ({
        key: reversed ? "reversed" : "normal",
        label: reversed
          ? "Name a RAM cost; if correct, draw 2"
          : "Name a RAM cost; if correct, install 1 RAM running",
        modes: [],
        x: null,
        reversed,
        targets: [],
        mainframes: null,
      }));
    },
    choice(s: GameState): RamCostChoiceEvaluation {
      const saved = validateRamCostChoiceContinuation(s);
      if (saved.handler !== handler)
        throw Error("Wrong Wheel of Fortune continuation");
      return {
        complete(state, decision, cost) {
          const a = state.priorityWindow!.resolving!;
          shape(a.programChoices!);
          const id = state.players[decision.player].zones.cyberdeck[0] ?? null;
          const current = effects.characteristics(state),
            card = id ? current.get(id) : null;
          if (id && (!card || !("ramCost" in card)))
            throw Error("Wheel of Fortune revealed cost unavailable");
          const revealedCost = card && "ramCost" in card ? card.ramCost : null;
          let next = id
            ? revealSearchedCard(state, decision.player, id, current)
            : structuredClone(state);
          const matched = id !== null && revealedCost === cost;
          next.pendingRuleEvents.push({
            type: "wheel-of-fortune-revealed",
            sourceId: decision.sourceId,
            player: decision.player,
            namedCost: cost,
            revealed: id,
            revealedCost,
            matched,
            ...captureEventObservation(next),
          });
          if (matched)
            next = a.programChoices!.reversed
              ? effects.draw(next, decision.sourceId, decision.player, 2)
              : effects.install!(
                  next,
                  decision.sourceId,
                  decision.player,
                  true,
                );
          return finishScriptResolution(next);
        },
      };
    },
  };
}
