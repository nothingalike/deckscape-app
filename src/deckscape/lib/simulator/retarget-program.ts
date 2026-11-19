import type { GameState } from "./game-state";
import type { CacheAction } from "./priority";
import type { CardCharacteristics } from "./characteristics";
import { programChoicesSchema, type ProgramChoices } from "./program-choices";
import { actionObjectTargets, validTargetIncarnations } from "./action-targets";
import { requireCurrentCardSource } from "./cache-source";
import { recordObjectTargeting } from "./targeting-events";

/** Internal selection, constructed by the retained card handler. Captures are never
 * accepted directly from a player's command. Keeping a stale target retains its old
 * incarnation; deliberately choosing its returned card uses the current incarnation. */
export interface ProgramRetargetSelection {
  choices: ProgramChoices;
  targetIncarnations: Record<string, number>;
}

export interface ProgramRetargetEvaluation {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  /** Validate the final target shape for the retained modes, including CR 113.8
   * target groups. Do not recheck payment, reversal permission or additional costs. */
  validateStructure(before: CacheAction, after: CacheAction): void;
  /** One result per logical target slot: choices.targets, then mainframeTarget,
   * then playerTarget, then cacheActionId. A character-or-player slot may change representation.
   * Evaluate restrictions against this complete action, including captures and
   * its ORIGINAL controller. This must not require every target to be legal. */
  legalTargets(state: GameState, action: CacheAction): readonly boolean[];
}

export type ProgramRetargetSlotCandidates = (
  state: GameState,
  action: CacheAction,
  slot: number,
) => ReadonlySet<string>;
export interface ProgramRetargetObjectOption {
  id: string;
  incarnation: number;
}

/** Server-private per-slot choices avoid enumerating the cross product for
 * variable-target programs. The first option retains that exact original target,
 * even if it is now illegal. New options require both public visibility and the
 * original program's slot permission. The final complete selection is validated
 * separately, including restrictions between target groups. */
export function programRetargetObjectSlots(
  state: GameState,
  actionId: string,
  legalSlots: ProgramRetargetSlotCandidates,
): ProgramRetargetObjectOption[][] {
  const action = state.priorityWindow?.stack.find((a) => a.id === actionId);
  if (
    action?.kind !== "card" ||
    !action.programChoices ||
    !validTargetIncarnations(action)
  )
    throw Error("Invalid pending program for object retargeting");
  requireCurrentCardSource(state, action);
  if (
    action.programChoices.mainframeTarget !== undefined ||
    action.programChoices.playerTarget !== undefined ||
    action.programChoices.cacheActionId !== undefined
  )
    throw Error(
      "Object retarget slots cannot replace a player or mainframe slot",
    );
  const publicIds = new Set([
    ...state.arena,
    ...state.environment,
    ...state.cache,
    ...state.players.flatMap((p) => [
      ...p.zones.mainframe,
      ...p.zones.ramBank,
      ...p.zones.recycleBin,
    ]),
  ]);
  return action.programChoices.targets.map((oldId, index) => {
    const permitted = legalSlots(
      structuredClone(state),
      structuredClone(action),
      index,
    );
    const options = [
      { id: oldId, incarnation: action.targetIncarnations![oldId] },
    ];
    for (const id of publicIds) {
      const object = state.objects[id];
      if (
        !object ||
        object.faceDown ||
        id === action.sourceId ||
        !permitted.has(id) ||
        (id === oldId && object.incarnation === options[0].incarnation)
      )
        continue;
      options.push({ id, incarnation: object.incarnation });
    }
    return options;
  });
}

/** Resolve server-generated slot indices once, retaining every paid choice. This
 * is the grouped-selection path; legacy one/two-target menus can remain compact.
 * Callers must enforce the saved decision's revision and actor before using it. */
export function selectProgramRetargetObjects(
  state: GameState,
  actionId: string,
  indices: readonly number[],
  legalSlots: ProgramRetargetSlotCandidates,
  evaluate: (
    state: GameState,
    actionId: string,
    selection: ProgramRetargetSelection,
  ) => GameState,
): GameState {
  const slots = programRetargetObjectSlots(state, actionId, legalSlots);
  if (
    !slots.length ||
    indices.length !== slots.length ||
    indices.some(
      (index, i) =>
        !Number.isSafeInteger(index) || index < 0 || index >= slots[i].length,
    )
  )
    throw Error("Invalid program retarget slot selection");
  const picked = slots.map((options, i) => options[indices[i]]);
  if (
    picked.some((p) =>
      picked.some(
        (other) => other.id === p.id && other.incarnation !== p.incarnation,
      ),
    )
  )
    throw Error("Conflicting incarnations in retarget selection");
  const action = state.priorityWindow!.stack.find((a) => a.id === actionId)!;
  return evaluate(structuredClone(state), actionId, {
    choices: {
      ...structuredClone(action.programChoices!),
      targets: picked.map((p) => p.id),
    },
    targetIncarnations: Object.fromEntries(
      picked.map((p) => [p.id, p.incarnation]),
    ),
  });
}

/** Enumerate legal replacements for the single-target programs in the starter
 * pool. Validation remains owned by the original program, including target
 * type, controller restrictions, paid modes, and current object incarnations.
 * No client-supplied incarnation or manufactured choices are accepted here.
 */
export function singleTargetRetargetOptions(
  state: GameState,
  actionId: string,
  evaluate: (
    state: GameState,
    actionId: string,
    selection: ProgramRetargetSelection,
  ) => GameState,
  legalSlots?: (
    state: GameState,
    action: CacheAction,
    slot: number,
  ) => ReadonlySet<string>,
): ProgramRetargetSelection[] {
  const action = state.priorityWindow?.stack.find((a) => a.id === actionId);
  if (!action?.programChoices || action.kind !== "card")
    throw new Error("Pending program unavailable for retargeting");
  const original = action.programChoices;
  const count =
    original.targets.length +
    Number(original.mainframeTarget !== undefined) +
    Number(original.playerTarget !== undefined) +
    Number(original.cacheActionId !== undefined);
  if (!count) return [];
  const candidates: ProgramRetargetSelection[] = [];
  // Only public objects are offered; card-owned validation enforces legal zones.
  const ids = new Set([
    ...state.arena,
    ...state.environment,
    ...state.cache,
    ...state.players.flatMap((p) => [
      ...p.zones.mainframe,
      ...p.zones.ramBank,
      ...p.zones.recycleBin,
    ]),
  ]);
  if (count > 1) {
    if (!legalSlots)
      throw Error("Multiple-target program retargeting requires slot choices");
    if (count !== 2 || original.targets.length !== count)
      throw Error("Unsupported multiple-target shape");
    // Each card binding supplies the legal candidates for its independent slots. This avoids
    // repeated whole-state evaluation for the cross product of legal choices.
    const slots = programRetargetObjectSlots(state, actionId, legalSlots);
    for (const left of slots[0])
      for (const right of slots[1]) {
        if (left.id === right.id) continue;
        if (
          left.id === original.targets[0] &&
          right.id === original.targets[1] &&
          left.incarnation === action.targetIncarnations![left.id] &&
          right.incarnation === action.targetIncarnations![right.id]
        )
          continue;
        candidates.push({
          choices: {
            ...structuredClone(original),
            targets: [left.id, right.id],
          },
          targetIncarnations: {
            [left.id]: left.incarnation,
            [right.id]: right.incarnation,
          },
        });
      }
    return candidates;
  }
  if (original.cacheActionId !== undefined) {
    for (const pending of state.priorityWindow!.stack) {
      if (pending.kind !== "activated") continue;
      candidates.push({
        choices: { ...structuredClone(original), cacheActionId: pending.id },
        targetIncarnations: {},
      });
    }
  }
  const permitted =
    count === 1 && original.targets.length === 1 && legalSlots
      ? legalSlots(structuredClone(state), structuredClone(action), 0)
      : undefined;
  for (const id of original.cacheActionId === undefined ? ids : []) {
    if (permitted && !permitted.has(id)) continue;
    const object = state.objects[id];
    if (!object || object.faceDown) continue;
    const choices = structuredClone(original);
    delete choices.playerTarget;
    if (original.mainframeTarget !== undefined) {
      choices.mainframeTarget = id;
      choices.targets = [];
    } else {
      choices.targets = [id];
    }
    candidates.push({
      choices,
      targetIncarnations: { [id]: object.incarnation },
    });
  }
  if (
    original.mainframeTarget === undefined &&
    original.cacheActionId === undefined
  ) {
    for (const player of [0, 1] as const) {
      const choices = structuredClone(original);
      choices.targets = [];
      choices.playerTarget = player;
      candidates.push({ choices, targetIncarnations: {} });
    }
  }
  return candidates.filter((selection) => {
    try {
      evaluate(structuredClone(state), actionId, structuredClone(selection));
      return true;
    } catch {
      // Same rejection boundary as submitting a candidate target change.
      return false;
    }
  });
}

function slots(action: CacheAction): string[] {
  const choices = action.programChoices!;
  return [
    ...choices.targets.map((id) =>
      JSON.stringify(["object", id, action.targetIncarnations![id]]),
    ),
    ...(choices.mainframeTarget
      ? [
          JSON.stringify([
            "object",
            choices.mainframeTarget,
            action.targetIncarnations![choices.mainframeTarget],
          ]),
        ]
      : []),
    ...(choices.playerTarget !== undefined
      ? [JSON.stringify(["player", choices.playerTarget])]
      : []),
    ...(choices.cacheActionId !== undefined
      ? [JSON.stringify(["ability", choices.cacheActionId])]
      : []),
  ];
}

/** CR 113.11: replace a pending program's targets atomically. The resolving
 * effect owns revision/decision advancement. No program is replayed or repaid. */
export function retargetProgram(
  state: GameState,
  actionId: string,
  selection: ProgramRetargetSelection,
  effects: ProgramRetargetEvaluation,
): GameState {
  const matches = (state.priorityWindow?.stack ?? []).filter(
    (action) => action.id === actionId,
  );
  const before = matches[0];
  if (
    state.outcome ||
    matches.length !== 1 ||
    before.kind !== "card" ||
    !before.programChoices ||
    before.gearTargets ||
    before.activatedAbility
  )
    throw new Error("Pending program unavailable for retargeting");
  requireCurrentCardSource(state, before);
  const card = effects
    .characteristics(structuredClone(state))
    .get(before.sourceId);
  if (card?.cardType !== "program" || !validTargetIncarnations(before))
    throw new Error("Invalid program retargeting source");

  const choices = programChoicesSchema.parse(selection.choices);
  const original = before.programChoices;
  if (
    choices.x !== original.x ||
    choices.reversed !== original.reversed ||
    JSON.stringify(choices.modes) !== JSON.stringify(original.modes) ||
    JSON.stringify(choices.sacrificeCharacters) !==
      JSON.stringify(original.sacrificeCharacters) ||
    JSON.stringify(choices.runCharacters) !==
      JSON.stringify(original.runCharacters)
  )
    throw new Error("Retargeting cannot change modes or paid choices");

  const after = structuredClone(before);
  after.programChoices = choices;
  after.targetIncarnations = structuredClone(selection.targetIncarnations);
  // Protocol attachment and program targeting are two views of one choice.
  if (before.protocolTarget !== undefined) {
    if (
      original.mainframeTarget !== before.protocolTarget ||
      !choices.mainframeTarget
    )
      throw new Error("Invalid protocol retargeting choice");
    after.protocolTarget = choices.mainframeTarget;
  }
  if (!validTargetIncarnations(after))
    throw new Error("Invalid retargeted incarnations");
  const oldSlots = slots(before),
    newSlots = slots(after);
  if (oldSlots.length !== newSlots.length || !oldSlots.length)
    throw new Error("Retargeting cannot change target count");
  const changed = newSlots.map((target, index) => target !== oldSlots[index]);
  if (!changed.some(Boolean))
    throw new Error("At least one target must change");

  const oldObjects = actionObjectTargets(before),
    newObjects = actionObjectTargets(after);
  for (const id of newObjects) {
    if (id === before.sourceId)
      throw new Error("A program cannot target itself");
    const retained =
      oldObjects.includes(id) &&
      before.targetIncarnations![id] === after.targetIncarnations![id];
    if (
      !retained &&
      state.objects[id]?.incarnation !== after.targetIncarnations![id]
    )
      throw new Error("New target incarnation is not current");
  }

  effects.validateStructure(structuredClone(before), structuredClone(after));
  const next = structuredClone(state);
  next.priorityWindow!.stack[
    next.priorityWindow!.stack.findIndex((action) => action.id === actionId)
  ] = after;
  const previousLegal = effects.legalTargets(
    structuredClone(state),
    structuredClone(before),
  );
  const finalLegal = effects.legalTargets(
    structuredClone(next),
    structuredClone(after),
  );
  if (
    previousLegal.length !== oldSlots.length ||
    finalLegal.length !== newSlots.length ||
    [...previousLegal, ...finalLegal].some(
      (value) => typeof value !== "boolean",
    )
  )
    throw new Error("Invalid retargeting legality evaluation");
  if (
    finalLegal.some(
      (legal, index) => !legal && (changed[index] || previousLegal[index]),
    )
  )
    throw new Error("Illegal target change");

  const retainedObjects = oldObjects.filter(
    (id) => before.targetIncarnations![id] === after.targetIncarnations![id],
  );
  recordObjectTargeting(
    next,
    before.sourceId,
    before.controller,
    newObjects,
    retainedObjects,
  );
  return next;
}
