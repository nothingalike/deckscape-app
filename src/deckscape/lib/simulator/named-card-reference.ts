import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { PinnedDefinition } from "./deck-admission";
import { versionDefinition, type EngineManifest } from "./definition-version";

export interface NamedCardReference {
  matches(state: GameState, instanceId: string): boolean;
  controlledInPlay(state: GameState, player: Seat): boolean;
}

/** CR 201.3 matches exact rules names, not source identity or UI labels. The reference name
 * comes from the pinned definition; the candidate name comes from copy/text/face-down layers.
 * Tokens are not cards (110.6f). This binding does not certify the referenced card as playable.
 */
export function bindNamedCardReference(
  reference: PinnedDefinition,
  expectedCardId: string,
  engine: EngineManifest,
  effectiveName: (state: GameState, instanceId: string) => string | null,
): NamedCardReference {
  const pinned = versionDefinition(reference.definition, engine);
  if (
    pinned.version !== reference.version ||
    pinned.definition.cardId !== expectedCardId
  )
    throw new Error("Named reference definition mismatch");
  const name = pinned.definition.characteristics.name;
  const matches = (state: GameState, instanceId: string) => {
    const object = state.objects[instanceId];
    return (
      !!object &&
      !object.token &&
      effectiveName(structuredClone(state), instanceId) === name
    );
  };
  return {
    matches,
    controlledInPlay(state, player) {
      if (
        state.rulesVersion !== pinned.definition.rulesVersion ||
        state.engineVersion !== pinned.definition.engineVersion
      )
        throw new Error("Named reference version mismatch");
      return [
        ...state.arena,
        ...state.environment,
        ...state.players.flatMap((item) => item.zones.ramBank),
      ].some(
        (id) => state.objects[id].controller === player && matches(state, id),
      );
    },
  };
}
