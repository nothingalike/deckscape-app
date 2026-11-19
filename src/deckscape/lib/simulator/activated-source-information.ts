import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { ActivatedAction } from "./resolve-ability";
import { isCurrentIncarnation } from "./object-incarnation";

/** Mutates the departure transaction before its objects change zones. The evaluator
 * supplies the effective characteristics from the shared pre-departure board. */
export function captureDepartingActivatedSources(
  transaction: GameState,
  ids: readonly string[],
  current: ReadonlyMap<string, CardCharacteristics>,
): void {
  const window = transaction.priorityWindow;
  if (!window) return;
  for (const action of [
    ...window.stack,
    ...window.triggers,
    ...(window.resolving ? [window.resolving] : []),
  ]) {
    const captured = action.activatedAbility;
    if (
      !captured ||
      !ids.includes(action.sourceId) ||
      !isCurrentIncarnation(transaction, captured.source)
    )
      continue;
    const value = current.get(action.sourceId);
    if (!value)
      throw new Error("Departing ability source characteristics unavailable");
    captured.departedSourceCharacteristics = structuredClone(value);
  }
}

/** CR 111.7b: current information while the original source exists, otherwise its
 * last known information. Announcement-time values are not a last-known fallback. */
export function activatedSourceInformation(
  state: GameState,
  action: ActivatedAction,
  current: ReadonlyMap<string, CardCharacteristics>,
): CardCharacteristics {
  if (
    isCurrentIncarnation(state, action.activatedAbility.source) &&
    [
      ...state.arena,
      ...state.environment,
      ...state.players.flatMap((p) => [
        ...p.zones.mainframe,
        ...p.zones.ramBank,
      ]),
    ].includes(action.sourceId)
  ) {
    const value = current.get(action.sourceId);
    if (!value)
      throw new Error("Current ability source characteristics unavailable");
    return structuredClone(value);
  }
  const captured = action.activatedAbility.departedSourceCharacteristics;
  if (!captured)
    throw new Error("Last-known ability source characteristics unavailable");
  return structuredClone(captured);
}
