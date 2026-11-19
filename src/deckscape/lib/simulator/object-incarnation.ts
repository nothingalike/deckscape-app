import type { GameState } from "./game-state";
import { takeEffectTimestamp } from "./effect-timestamp";

/** Server-private identity within a zone (CR 400.8). Physical IDs remain stable for
 * deck accounting. Mutates the caller's transaction copy; movement primitives handle
 * destination status, attachments and the explicit play/commitment exceptions.
 */
export function advanceObjectIncarnation(
  state: GameState,
  id: string,
  preserveRamCost = false,
): void {
  const object = state.objects[id];
  if (
    !object ||
    !Number.isSafeInteger(object.incarnation) ||
    object.incarnation < 0 ||
    !Number.isSafeInteger(object.incarnation + 1)
  )
    throw new Error("Object incarnation exhausted or invalid");
  const timestamp = takeEffectTimestamp(state);
  object.incarnation++;
  if (state.timedControl)
    state.timedControl = state.timedControl.filter((e) => e.targetId !== id);
  if (state.attachmentControl)
    state.attachmentControl = state.attachmentControl.filter(
      (e) => e.hostId !== id,
    );
  if (state.psychosisImmunities)
    state.psychosisImmunities = state.psychosisImmunities.filter(
      (e) => e.targetId !== id,
    );
  if (state.destructionProtections)
    state.destructionProtections = state.destructionProtections.filter(
      (e) => e.targetId !== id,
    );
  state.statEffects = state.statEffects.filter(
    (effect) =>
      effect.targetId !== id &&
      !(effect.expiresAfterTurn === null && effect.sourceId === id),
  );
  delete object.trojanPlayedTurn;
  // Explicit play/cache-entry continuity; every ordinary departure resets the setting.
  if (!preserveRamCost) delete object.setRamCost;
  delete object.copiedAbility;
  state.combatEffects = state.combatEffects.filter(
    (effect) =>
      effect.targetId !== id &&
      !(effect.expiresAfterTurn === null && effect.sourceId === id),
  );
  object.timestamp = timestamp;
  state.programReplayPermissions = state.programReplayPermissions.filter(
    (p) => p.targetId !== id,
  );
  object.counters = {};
  object.damage = { MF: 0, BF: 0 };
  object.lastDamageSourceId = null;
  delete object.lastDamageController;
  object.lastDamagedTurn = null;
}

export function isCurrentIncarnation(
  state: GameState,
  captured: { id: string; incarnation: number },
): boolean {
  return (
    Number.isSafeInteger(captured.incarnation) &&
    captured.incarnation >= 0 &&
    state.objects[captured.id]?.incarnation === captured.incarnation
  );
}
