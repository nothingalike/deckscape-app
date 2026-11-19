import type { GameState } from "./game-state";
import type { CacheAction } from "./priority";

/** Capture object targets only. Program/activated playerTarget is an explicit seat and has
 * no object incarnation; never infer a player from a missing object record. */
export function actionObjectTargets(action: CacheAction): string[] {
  return [
    ...new Set([
      ...(action.gearTargets ?? []).map((link) => link.hostId),
      ...(action.protocolTarget ? [action.protocolTarget] : []),
      ...(action.programChoices?.targets ?? []),
      ...(action.programChoices?.mainframeTarget
        ? [action.programChoices.mainframeTarget]
        : []),
      ...(action.activatedAbility?.choices.targets ?? []),
    ]),
  ];
}

export function captureTargetIncarnations(
  state: GameState,
  ids: readonly string[],
): Record<string, number> {
  return Object.fromEntries(
    [...new Set(ids)].map((id) => {
      const object = state.objects[id];
      if (
        !object ||
        !Number.isSafeInteger(object.incarnation) ||
        object.incarnation < 0
      )
        throw new Error("Target incarnation unavailable");
      return [id, object.incarnation];
    }),
  );
}

export function validTargetIncarnations(action: CacheAction): boolean {
  const targets = actionObjectTargets(action);
  const captured = action.targetIncarnations ?? {};
  return (
    Object.keys(captured).length === targets.length &&
    targets.every(
      (id) =>
        Object.hasOwn(captured, id) &&
        Number.isSafeInteger(captured[id]) &&
        captured[id] >= 0,
    )
  );
}

/** No current-object fallback: a missing capture is a malformed action, not a new target. */
export function isCurrentActionTarget(
  state: GameState,
  action: CacheAction,
  id: string,
): boolean {
  if (
    !validTargetIncarnations(action) ||
    !Object.hasOwn(action.targetIncarnations ?? {}, id)
  )
    throw new Error("Missing or inconsistent target incarnation");
  return state.objects[id]?.incarnation === action.targetIncarnations![id];
}
