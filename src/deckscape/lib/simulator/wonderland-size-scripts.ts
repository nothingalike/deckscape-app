import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";
import type { ProgramChoices } from "./play-program";
import type { ScriptBehavior } from "./resolve-script";
import type { CounterPlacement } from "./put-counters";
import { addUntilTurnEndStatEffect } from "./timed-stat-effects";
import { bindNamedCardReference } from "./named-card-reference";
import type { PinnedDefinition } from "./deck-admission";
import type { EngineManifest } from "./definition-version";

/** Card-name references use CR 201.3, including text/copy changes to another card's name. */
export function bindWonderlandSizeScripts(
  alice: PinnedDefinition,
  engine: EngineManifest,
  effectiveName: (state: GameState, instanceId: string) => string | null,
  evaluated: Omit<WonderlandSizeEvaluation, "controlsAliceDreamwalker">,
): { eat: ScriptBehavior; drink: ScriptBehavior } {
  const reference = bindNamedCardReference(
    alice,
    "df45c11a-31c2-4838-a128-a0385346cc61",
    engine,
    effectiveName,
  );
  const binding = {
    ...evaluated,
    controlsAliceDreamwalker: reference.controlledInPlay,
  };
  return {
    eat: wonderlandSizeScript("eat", binding),
    drink: wonderlandSizeScript("drink", binding),
  };
}

export interface WonderlandSizeEvaluation {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  controlsAliceDreamwalker(state: GameState, player: Seat): boolean;
  putCounters(
    state: GameState,
    sourceId: string,
    placements: readonly CounterPlacement[],
  ): GameState;
}
export function validateWonderlandSizeChoices(choices: ProgramChoices): void {
  if (
    choices.targets.length ||
    choices.modes.length ||
    choices.reversed ||
    choices.x !== null ||
    choices.playerTarget !== undefined ||
    choices.mainframeTarget
  )
    throw new Error("Invalid Eat Me / Drink Me choices");
}

/** Reviewed Eat Me / Drink Me select an untargeted group at resolution. Alice replaces the
 * temporary change with counters; she is checked at resolution using a typed identity binding.
 */
export function wonderlandSizeScript(
  kind: "eat" | "drink",
  evaluated: WonderlandSizeEvaluation,
): ScriptBehavior {
  return {
    hasLegalTargets: (_state, action) => {
      validateWonderlandSizeChoices(action.programChoices);
      return true;
    },
    resolve(state, action) {
      const characteristics = evaluated.characteristics(structuredClone(state));
      const recipients = state.arena.filter((id) => {
        const card = characteristics.get(id);
        if (!card) throw new Error("Missing size-effect characteristics");
        return (
          card.cardType === "character" &&
          (kind === "eat"
            ? state.objects[id].controller === action.controller
            : state.objects[id].controller !== action.controller)
        );
      });
      const amount = kind === "eat" ? 1 : -1;
      if (
        evaluated.controlsAliceDreamwalker(
          structuredClone(state),
          action.controller,
        )
      )
        return evaluated.putCounters(
          structuredClone(state),
          action.sourceId,
          recipients.map((instanceId) => ({
            instanceId,
            counter: kind === "eat" ? "+1/+1" : "-1/-1",
            amount: 1,
          })),
        );
      let next = structuredClone(state);
      for (const id of recipients)
        next = addUntilTurnEndStatEffect(
          next,
          action.sourceId,
          id,
          { layer: "7d", operation: "add", attack: amount, defence: amount },
          characteristics,
        );
      return next;
    },
  };
}
