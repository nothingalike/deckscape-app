import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { ProgramChoices } from "./play-program";
import type { ScriptBehavior } from "./resolve-script";
import { isCurrentActionTarget } from "./action-targets";

export type DestructionTargetType =
  "character" | "ram" | "program" | "cyberware";
export interface DestructionScriptEffects {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  canTarget(state: GameState, sourceId: string, targetId: string): boolean;
  /** Shared departure runtime evaluates destruction restrictions and replacements. */
  destroy(state: GameState, sourceId: string, targetId: string): GameState;
}

function target(choices: ProgramChoices): string {
  if (
    choices.targets.length !== 1 ||
    choices.modes.length ||
    choices.x !== null ||
    choices.playerTarget !== undefined ||
    choices.reversed ||
    choices.mainframeTarget
  )
    throw new Error("Invalid destruction program choices");
  return choices.targets[0];
}

/** CR 113.7/701.5a.1: destroy targets only in-play persistents, never the cache. */
export function destructionScriptTargets(
  state: GameState,
  sourceId: string,
  type: DestructionTargetType,
  effects: Pick<DestructionScriptEffects, "characteristics" | "canTarget">,
): string[] {
  const current = effects.characteristics(structuredClone(state));
  return [
    ...state.arena,
    ...state.environment,
    ...state.players.flatMap((player) => player.zones.ramBank),
  ].filter(
    (id) =>
      (type === "cyberware"
        ? current.get(id)?.cardType === "gear" &&
          (current.get(id) as { subtype?: string }).subtype === "cyberware"
        : current.get(id)?.cardType === type) &&
      effects.canTarget(structuredClone(state), sourceId, id),
  );
}

export function validateDestructionScriptChoices(
  state: GameState,
  sourceId: string,
  choices: ProgramChoices,
  type: DestructionTargetType,
  effects: Pick<DestructionScriptEffects, "characteristics" | "canTarget">,
) {
  const id = target(choices);
  if (!destructionScriptTargets(state, sourceId, type, effects).includes(id))
    throw new Error("Illegal destruction program target");
}

/** DELETE, EMP GRENADE and TERMINATE differ only in their permitted target type. */
export function destructionScript(
  type: DestructionTargetType,
  effects: DestructionScriptEffects,
): ScriptBehavior {
  return {
    hasLegalTargets(state, action) {
      const id = target(action.programChoices);
      if (!isCurrentActionTarget(state, action, id)) return false;
      const current = effects.characteristics(structuredClone(state)).get(id);
      // Resolution validates the selected target only. Enumerating every possible
      // target here multiplies targeting work when an effect offers retarget choices.
      return (
        (state.arena.includes(id) ||
          state.environment.includes(id) ||
          state.players.some((p) => p.zones.ramBank.includes(id))) &&
        (type === "cyberware"
          ? current?.cardType === "gear" && current.subtype === "cyberware"
          : current?.cardType === type) &&
        effects.canTarget(structuredClone(state), action.sourceId, id)
      );
    },
    resolve(state, action) {
      return effects.destroy(
        state,
        action.sourceId,
        target(action.programChoices),
      );
    },
  };
}
