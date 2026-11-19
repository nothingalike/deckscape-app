import { tokenCopyOverridesSchema } from "./token-copy-schema";
import type { GameObject, GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";
import { createCharacterToken } from "./token-lifecycle";
import { captureEventObservation } from "./event-observation";

/** Creation-time exceptions become part of this token's printed values, not
 * continuous modifiers. Retaining the definition preserves its executable abilities. */
export function tokenCopyCharacteristics(
  object: GameObject,
  printed: CardCharacteristics,
): CardCharacteristics {
  if (!object.tokenCopyOverrides) return structuredClone(printed);
  if (!object.token || printed.cardType !== "character")
    throw Error("Invalid token copy override");
  return {
    ...structuredClone(printed),
    ...tokenCopyOverridesSchema.parse(object.tokenCopyOverrides),
  };
}

/** Copy only the retained printing plus explicit creation exceptions. Never copy
 * attachments, damage, counters, acquired abilities, or other continuous effects.
 * The source may be an event-time observation of an object that has since left. */
export function createNonIconicCharacterCopy(
  state: GameState,
  player: Seat,
  sourceId: string,
  original: GameObject,
  definitions: ReadonlyMap<string, CardCharacteristics>,
  prepareEntry?: (state: GameState, id: string) => GameState,
): { state: GameState; id: string } {
  const card = definitions.get(original.definitionVersion);
  if (original.faceDown || card?.cardType !== "character")
    throw Error("Invalid character copy source");
  const id = `token:${state.nextTokenNumber}`;
  const next = createCharacterToken(
    state,
    player,
    sourceId,
    original.definitionVersion,
    definitions,
    true,
    prepareEntry,
  );
  next.objects[id].tokenCopyOverrides = { iconic: false };
  // Capture after the creation exception; later source changes do not rewrite it.
  next.pendingRuleEvents[next.pendingRuleEvents.length - 1] = {
    type: "token-created",
    instanceId: id,
    player,
    sourceId,
    ...captureEventObservation(next),
  };
  return { state: next, id };
}

/** Entering already attacking isn't declaring an attack and emits no attack event.
 * The creating effect, rather than declaration eligibility or STAMINA, sets running. */
export function enterCombatAttacking(
  state: GameState,
  ids: readonly string[],
): GameState {
  if (
    state.turn.step !== "combat" ||
    state.combat?.stage !== "blockers-window" ||
    new Set(ids).size !== ids.length ||
    ids.some(
      (id) =>
        !state.arena.includes(id) ||
        state.objects[id].controller !== state.turn.activePlayer ||
        !state.objects[id].token ||
        state.combat!.attackers.includes(id),
    )
  )
    throw Error("Invalid attacking token entry");
  const next = structuredClone(state);
  next.combat!.attackers.push(...ids);
  return next;
}
