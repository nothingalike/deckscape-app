import type { GameState } from "./game-state";
import { isCurrentActionTarget } from "./action-targets";
import type { CardCharacteristics } from "./characteristics";
import type { AbilityChoices } from "./activate-ability";
import type { ProgramChoices } from "./play-program";
import type { ActivatedBehavior } from "./resolve-ability";
import type { ScriptBehavior } from "./resolve-script";
import {
  changePersistentStatus,
  type StatusEvaluation,
} from "./persistent-status";
import { putCharacterCounters } from "./put-counters";

export interface CharacterStatusEvaluation extends StatusEvaluation {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  canTarget(state: GameState, sourceId: string, targetId: string): boolean;
  /** Applies counter replacement effects before placing the requested counter. */
  putCounter(state: GameState, sourceId: string, targetId: string): GameState;
}
export type CharacterTargetEvaluation = Pick<
  CharacterStatusEvaluation,
  "characteristics" | "canTarget"
>;
export interface CharacterRunEvaluation extends StatusEvaluation {
  /** Release-owned run replacements and PSYCHOSIS checks. */
  runCharacters?(
    state: GameState,
    sourceId: string,
    ids: readonly string[],
  ): GameState;
}
function target(choices: AbilityChoices | ProgramChoices): string {
  if (
    choices.targets.length !== 1 ||
    choices.modes.length ||
    choices.x !== null ||
    choices.playerTarget !== undefined ||
    ("reversed" in choices && choices.reversed) ||
    ("mainframeTarget" in choices && choices.mainframeTarget)
  )
    throw new Error("Invalid character status choices");
  return choices.targets[0];
}
function legal(
  state: GameState,
  sourceId: string,
  id: string,
  evaluated: CharacterTargetEvaluation,
) {
  return (
    state.arena.includes(id) &&
    evaluated.characteristics(structuredClone(state)).get(id)?.cardType ===
      "character" &&
    evaluated.canTarget(structuredClone(state), sourceId, id)
  );
}
export function validateCharacterStatusChoices(
  state: GameState,
  sourceId: string,
  choices: AbilityChoices | ProgramChoices,
  evaluated: CharacterTargetEvaluation,
) {
  if (!legal(state, sourceId, target(choices), evaluated))
    throw new Error("Illegal character status target");
}

export function characterStatusTargets(
  state: GameState,
  sourceId: string,
  evaluated: CharacterTargetEvaluation,
): string[] {
  return state.arena.filter((id) => legal(state, sourceId, id, evaluated));
}

/** Reviewed ACPD DRONES — DETAIN: Run target character. */
export function acpdDetain(
  evaluated: CharacterTargetEvaluation & CharacterRunEvaluation,
): ActivatedBehavior {
  return {
    hasLegalTargets: (state, action) =>
      isCurrentActionTarget(
        state,
        action,
        target(action.activatedAbility.choices),
      ) &&
      legal(
        state,
        action.sourceId,
        target(action.activatedAbility.choices),
        evaluated,
      ),
    resolve: (state, action) =>
      evaluated.runCharacters
        ? evaluated.runCharacters(state, action.sourceId, [
            target(action.activatedAbility.choices),
          ])
        : changePersistentStatus(
            state,
            action.sourceId,
            [
              {
                instanceId: target(action.activatedAbility.choices),
                operation: "run",
              },
            ],
            evaluated,
          ),
  };
}

/** Reviewed TIME: Refresh target character and reboot their abilities. */
export function timeScript(
  evaluated: CharacterStatusEvaluation,
): ScriptBehavior {
  return {
    hasLegalTargets: (state, action) =>
      isCurrentActionTarget(state, action, target(action.programChoices)) &&
      legal(state, action.sourceId, target(action.programChoices), evaluated),
    resolve(state, action) {
      const id = target(action.programChoices);
      return changePersistentStatus(
        state,
        action.sourceId,
        [
          { instanceId: id, operation: "refresh" },
          { instanceId: id, operation: "reboot" },
        ],
        evaluated,
      );
    },
  };
}

/** Reviewed BINARY BLAST: Refresh target character; if it is HACKER, put a +1/+1 counter. */
export function binaryBlastScript(
  evaluated: CharacterStatusEvaluation,
): ScriptBehavior {
  return {
    hasLegalTargets: (state, action) =>
      isCurrentActionTarget(state, action, target(action.programChoices)) &&
      legal(state, action.sourceId, target(action.programChoices), evaluated),
    resolve(state, action) {
      const id = target(action.programChoices);
      let next = changePersistentStatus(
        state,
        action.sourceId,
        [{ instanceId: id, operation: "refresh" }],
        evaluated,
      );
      if (
        isCurrentActionTarget(next, action, id) &&
        evaluated
          .characteristics(structuredClone(next))
          .get(id)
          ?.factions.includes("HACKER")
      )
        next = evaluated.putCounter(next, action.sourceId, id);
      return next;
    },
  };
}

/** Base counter placement for a runtime after it has established no replacement applies. */
export function putBinaryBlastCounter(
  state: GameState,
  sourceId: string,
  targetId: string,
  characteristics: ReadonlyMap<string, CardCharacteristics>,
) {
  return putCharacterCounters(
    state,
    sourceId,
    [{ instanceId: targetId, counter: "+1/+1", amount: 1 }],
    characteristics,
  );
}
