import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { CardCharacteristics } from "./characteristics";
import type { ProgramChoices } from "./play-program";
import type { ProgramPlayVariant } from "./program-play-option";
import { finishScriptResolution, type ScriptBehavior } from "./resolve-script";
import {
  validateHandChoiceContinuation,
  type HandChoiceEvaluation,
} from "./hand-choice";

export interface PhishingEffects {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  canTargetPlayer(state: GameState, sourceId: string, player: Seat): boolean;
  reveal(state: GameState, sourceId: string, player: Seat): GameState;
  discard(
    state: GameState,
    sourceId: string,
    player: Seat,
    id: string,
  ): GameState;
}

export function phishing(effects: PhishingEffects) {
  const handler = "script/phishing";
  const target = (choices: ProgramChoices): Seat => {
    if (
      choices.targets.length ||
      choices.modes.length ||
      choices.reversed ||
      choices.x !== null ||
      choices.mainframeTarget !== undefined ||
      (choices.playerTarget !== 0 && choices.playerTarget !== 1)
    )
      throw new Error("Invalid PHISHING choices");
    return choices.playerTarget;
  };
  const behavior: ScriptBehavior = {
    hasLegalTargets: (state, action) =>
      effects.canTargetPlayer(
        state,
        action.sourceId,
        target(action.programChoices),
      ),
    resolve(state, action) {
      const player = target(action.programChoices);
      if (!effects.canTargetPlayer(state, action.sourceId, player))
        return state;
      const next = effects.reveal(
        structuredClone(state),
        action.sourceId,
        player,
      );
      if (
        next.revision !== state.revision ||
        next.engineVersion !== state.engineVersion ||
        next.rulesVersion !== state.rulesVersion
      )
        throw new Error("PHISHING reveal changed transaction identity");
      if (next.pendingDecision)
        throw new Error(
          "PHISHING reveal requires a saved replacement continuation",
        );
      if (next.outcome || !next.players[player].zones.hand.length) return next;
      const inspected = [...next.players[player].zones.hand];
      next.pendingDecision = {
        type: "hand-choice",
        id: `hand:${action.id}`,
        sourceId: action.sourceId,
        actionId: action.id,
        handler,
        player: action.controller,
        targetPlayer: player,
        inspected,
        incarnations: Object.fromEntries(
          inspected.map((id) => [id, next.objects[id].incarnation]),
        ),
      };
      validateHandChoiceContinuation(next);
      return next;
    },
  };
  return {
    behavior,
    validate(state: GameState, sourceId: string, choices: ProgramChoices) {
      if (!effects.canTargetPlayer(state, sourceId, target(choices)))
        throw new Error("Illegal PHISHING target");
    },
    variants(state: GameState, sourceId: string): ProgramPlayVariant[] {
      return [
        {
          key: "player",
          label: "Reveal a player's hand",
          modes: [],
          targets: [],
          reversed: false,
          x: null,
          mainframes: null,
          playerTargets: ([0, 1] as const)
            .filter((player) =>
              effects.canTargetPlayer(structuredClone(state), sourceId, player),
            )
            .map((player) => ({
              player,
              label:
                player === state.objects[sourceId].controller
                  ? "You"
                  : "Opponent",
            })),
        },
      ];
    },
    choice(state: GameState): HandChoiceEvaluation {
      const decision = validateHandChoiceContinuation(state);
      if (decision.handler !== handler)
        throw new Error("Wrong PHISHING continuation");
      target(state.priorityWindow!.resolving!.programChoices!);
      return {
        characteristics: effects.characteristics(structuredClone(state)),
        complete(snapshot, saved, selected) {
          const next = effects.discard(
            snapshot,
            saved.sourceId,
            saved.targetPlayer,
            selected,
          );
          if (next.pendingDecision)
            throw new Error(
              "PHISHING discard requires a saved replacement continuation",
            );
          return finishScriptResolution(next);
        },
      };
    },
  };
}
