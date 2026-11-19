import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { ActivatedAction } from "./resolve-ability";
import type { ActivationVariant } from "./activation-option";
import { recordObjectTargeting } from "./targeting-events";
import { requireCurrentCardSource } from "./cache-source";
import { finishScriptResolution, type ScriptAction } from "./resolve-script";

export interface RedirectDecision {
  type: "redirect-ability";
  id: string;
  actionId: string;
  sourceId: string;
  targetActionId: string;
  player: Seat;
  scriptDefinitionVersion?: string;
}
export const redirectSelectionSchema = z
  .object({
    variant: z.string().min(1),
    groups: z.array(z.array(z.string().min(1))),
    playerTarget: z.union([z.literal(0), z.literal(1)]).optional(),
  })
  .strict();
export type RedirectSelection = z.infer<typeof redirectSelectionSchema>;
export interface RedirectEvaluation {
  variants(state: GameState, action: ActivatedAction): ActivationVariant[];
  validateScriptSource?(
    state: GameState,
    sourceId: string,
    definitionVersion: string,
  ): void;
}
export function pendingActivated(
  state: GameState,
  id: string,
): ActivatedAction | undefined {
  const a = state.priorityWindow?.stack.find((a) => a.id === id);
  return a?.kind === "activated" && a.activatedAbility
    ? (a as ActivatedAction)
    : undefined;
}
export function validateRedirectDecision(state: GameState) {
  const d = state.pendingDecision,
    a = state.priorityWindow?.resolving;
  if (
    d?.type !== "redirect-ability" ||
    !a ||
    state.priorityWindow?.mode !== "drain" ||
    a.id !== d.actionId ||
    a.sourceId !== d.sourceId ||
    a.controller !== d.player ||
    d.id !== `redirect:${a.id}` ||
    !pendingActivated(state, d.targetActionId)
  )
    throw Error("Invalid Redirect continuation");
  if (d.scriptDefinitionVersion) {
    if (
      a.kind !== "card" ||
      !a.programChoices?.reversed ||
      a.programChoices.cacheActionId !== d.targetActionId ||
      a.programChoices.targets.length ||
      a.programChoices.modes.length ||
      a.programChoices.x !== null ||
      a.programChoices.playerTarget !== undefined ||
      a.programChoices.mainframeTarget !== undefined ||
      a.programChoices.runCharacters !== undefined ||
      state.objects[a.sourceId]?.definitionVersion !== d.scriptDefinitionVersion
    )
      throw Error("Invalid script Redirect continuation");
    requireCurrentCardSource(state, a);
  } else if (
    a.kind !== "activated" ||
    a.activatedAbility?.handler !== "trojan/redirect" ||
    a.activatedAbility.choices.cacheActionId !== d.targetActionId
  )
    throw Error("Invalid activated Redirect continuation");
  return d;
}

/** Bindings supply the validated script pin; reversal changes a program's target
 * type, not the original ability's controller, modes, X or paid costs. */
export function beginScriptRedirect(
  state: GameState,
  action: ScriptAction,
  version: string,
  evaluated: RedirectEvaluation,
): GameState {
  if (!evaluated.validateScriptSource)
    throw Error("Script Redirect binding unavailable");
  evaluated.validateScriptSource(state, action.sourceId, version);
  const target =
    action.programChoices.cacheActionId &&
    pendingActivated(state, action.programChoices.cacheActionId);
  if (!target) return state;
  if (!redirectVariants(state, target, evaluated).length) return state;
  if (state.pendingDecision)
    throw Error("Another resolution decision is pending");
  const next = structuredClone(state);
  next.pendingDecision = {
    type: "redirect-ability",
    id: `redirect:${action.id}`,
    actionId: action.id,
    sourceId: action.sourceId,
    targetActionId: target.id,
    player: action.controller,
    scriptDefinitionVersion: version,
  };
  validateRedirectDecision(next);
  return next;
}
const count = (a: ActivatedAction) =>
  a.activatedAbility.choices.targets.length +
  Number(a.activatedAbility.choices.playerTarget !== undefined) +
  Number(a.activatedAbility.choices.cacheActionId !== undefined);
function splitOriginal(
  v: ActivationVariant,
  a: ActivatedAction,
): string[][] | null {
  const ids = a.activatedAbility.choices.targets;
  let offset = 0;
  const groups: string[][] = [];
  for (const [i, g] of v.targets.entries()) {
    const length = Math.min(
      g.maximum,
      ids.length -
        offset -
        v.targets.slice(i + 1).reduce((n, g) => n + g.minimum, 0),
    );
    if (length < g.minimum) return null;
    groups.push(ids.slice(offset, offset + length));
    offset += length;
  }
  return offset === ids.length ? groups : null;
}
function retainedIllegal(
  state: GameState,
  v: ActivationVariant,
  a: ActivatedAction,
) {
  const original = splitOriginal(v, a);
  const slots = new Set<number>();
  if (!original) return slots;
  let offset = 0;
  for (const [i, g] of original.entries()) {
    const descriptor = v.targets[i];
    const candidates = descriptor.candidatesByFirstTarget
      ? (descriptor.candidatesByFirstTarget[original[0]?.[0]] ?? [])
      : descriptor.candidates;
    for (const id of g) {
      if (!candidates.includes(id)) slots.add(offset);
      offset++;
    }
  }
  return slots;
}
function rawVariants(
  state: GameState,
  a: ActivatedAction,
  e: RedirectEvaluation,
) {
  return e
    .variants(state, a)
    .filter((v) => isDeepStrictEqual(v.modes, a.activatedAbility.choices.modes))
    .map((v) => ({ ...v, targets: v.targets.filter((g) => !g.purpose) }));
}
function changedSelection(
  state: GameState,
  a: ActivatedAction,
  v: ActivationVariant,
  groups: string[][],
  player: Seat | undefined,
  illegal: Set<number>,
) {
  const old = a.activatedAbility.choices,
    targets = groups.flat();
  return (
    v.cacheActionId !== old.cacheActionId ||
    player !== old.playerTarget ||
    targets.some(
      (id, i) =>
        id !== old.targets[i] ||
        (!illegal.has(i) &&
          state.objects[id]?.incarnation !== a.targetIncarnations?.[id]),
    )
  );
}
function hasReplacement(
  state: GameState,
  a: ActivatedAction,
  v: ActivationVariant,
  illegal: Set<number>,
) {
  const remaining =
    count(a) - Number(!!v.playerTargets) - Number(!!v.cacheActionId);
  if (remaining < 0) return false;
  const players: (Seat | undefined)[] = v.playerTargets?.map(
    (p) => p.player,
  ) ?? [undefined];
  const visit = (
    index: number,
    groups: string[][],
    needed: number,
  ): boolean => {
    if (index === v.targets.length)
      return (
        needed === 0 &&
        players.some((p) => changedSelection(state, a, v, groups, p, illegal))
      );
    const g = v.targets[index],
      candidates = g.candidatesByFirstTarget
        ? (g.candidatesByFirstTarget[groups[0]?.[0]] ?? [])
        : g.candidates;
    const used = new Set(groups.flat()),
      available = candidates.filter((id) => !used.has(id));
    const take = (start: number, picked: string[]): boolean => {
      if (
        picked.length >= g.minimum &&
        visit(index + 1, [...groups, picked], needed - picked.length)
      )
        return true;
      if (picked.length >= Math.min(g.maximum, needed)) return false;
      for (let n = start; n < available.length; n++)
        if (take(n + 1, [...picked, available[n]])) return true;
      return false;
    };
    return take(0, []);
  };
  return visit(0, [], remaining);
}

/** Shape is inherited from the announced action. Payment groups are removed;
 * source/controller snapshots remain authoritative after departure or theft. */
export function redirectVariants(
  state: GameState,
  a: ActivatedAction,
  evaluated: RedirectEvaluation,
) {
  const n = count(a);
  if (!n) return [];
  return rawVariants(state, a, evaluated)
    .map((raw) => {
      const v = structuredClone(raw),
        original = splitOriginal(v, a),
        illegal = retainedIllegal(state, raw, a);
      // CR 113.11: an already-illegal target may stay in its original slot while
      // another target changes. Never bind that slot to a new object incarnation.
      let slot = 0;
      if (original)
        for (const [i, group] of original.entries())
          for (const id of group) {
            if (illegal.has(slot)) {
              if (!v.targets[i].candidates.includes(id))
                v.targets[i].candidates.push(id);
              if (v.targets[i].candidatesByFirstTarget)
                for (const first of v.targets[0].candidates) {
                  const candidates =
                    v.targets[i].candidatesByFirstTarget![first] ?? [];
                  if (!candidates.includes(id)) candidates.push(id);
                  v.targets[i].candidatesByFirstTarget![first] = candidates;
                }
            }
            slot++;
          }
      return { v, illegal };
    })
    .filter(({ v, illegal }) => {
      const fixed = Number(!!v.playerTargets) + Number(!!v.cacheActionId);
      return (
        v.targets.reduce((n, g) => n + g.minimum, fixed) <= n &&
        v.targets.reduce((n, g) => n + g.maximum, fixed) >= n &&
        hasReplacement(state, a, v, illegal)
      );
    })
    .map(({ v }) => v);
}

export function answerRedirect(
  state: GameState,
  user: string,
  revision: number,
  decisionId: string,
  input: RedirectSelection,
  evaluated: RedirectEvaluation,
): GameState {
  if (state.outcome || state.revision !== revision)
    throw Error("Ended game or stale revision");
  const d = validateRedirectDecision(state);
  if (d.scriptDefinitionVersion) {
    if (!evaluated.validateScriptSource)
      throw Error("Script Redirect binding unavailable");
    evaluated.validateScriptSource(
      state,
      d.sourceId,
      d.scriptDefinitionVersion,
    );
  }
  if (d.id !== decisionId || state.players[d.player].userId !== user)
    throw Error("Not the deciding player or decision");
  const selected = redirectSelectionSchema.parse(input),
    before = pendingActivated(state, d.targetActionId)!;
  const variant = redirectVariants(state, before, evaluated).find(
    (v) => v.key === selected.variant,
  );
  if (!variant || selected.groups.length !== variant.targets.length)
    throw Error("Invalid Redirect variant");
  const old = before.activatedAbility.choices;
  const raw = rawVariants(state, before, evaluated).find(
    (v) => v.key === variant.key,
  )!;
  const illegal = retainedIllegal(state, raw, before);
  const targets = selected.groups.flat();
  if (new Set(targets).size !== targets.length)
    throw Error("Duplicate Redirect targets");
  let slot = 0;
  for (const [index, group] of selected.groups.entries()) {
    const descriptor = variant.targets[index];
    if (group.length < descriptor.minimum || group.length > descriptor.maximum)
      throw Error("Invalid Redirect target count");
    const rawGroup = raw.targets[index];
    const candidates = rawGroup.candidatesByFirstTarget
      ? (rawGroup.candidatesByFirstTarget[selected.groups[0]?.[0]] ?? [])
      : rawGroup.candidates;
    for (const id of group) {
      if (
        !candidates.includes(id) &&
        !(illegal.has(slot) && old.targets[slot] === id)
      )
        throw Error("Illegal replacement ability target");
      slot++;
    }
  }
  if (
    variant.playerTargets
      ? !variant.playerTargets.some((p) => p.player === selected.playerTarget)
      : selected.playerTarget !== undefined
  )
    throw Error("Illegal replacement player target");
  const choices = { ...structuredClone(old), targets };
  delete choices.playerTarget;
  delete choices.cacheActionId;
  if (selected.playerTarget !== undefined)
    choices.playerTarget = selected.playerTarget;
  if (variant.cacheActionId) choices.cacheActionId = variant.cacheActionId;
  const after = structuredClone(before);
  after.activatedAbility.choices = choices;
  after.targetIncarnations = Object.fromEntries(
    targets.map((id, i) => [
      id,
      illegal.has(i) && old.targets[i] === id
        ? before.targetIncarnations![id]
        : state.objects[id].incarnation,
    ]),
  );
  if (count(after) !== count(before))
    throw Error("Redirect cannot change target count");
  if (
    isDeepStrictEqual(choices, old) &&
    isDeepStrictEqual(after.targetIncarnations, before.targetIncarnations)
  )
    throw Error("At least one target must change");
  let next = structuredClone(state);
  next.priorityWindow!.stack[
    next.priorityWindow!.stack.findIndex((a) => a.id === before.id)
  ] = after;
  const retained = targets.filter(
    (id) =>
      old.targets.includes(id) &&
      before.targetIncarnations?.[id] === after.targetIncarnations?.[id],
  );
  recordObjectTargeting(
    next,
    before.sourceId,
    before.controller,
    targets,
    retained,
  );
  next.pendingRuleEvents.push({
    type: "ability-retargeted",
    sourceId: d.sourceId,
    player: d.player,
    abilityName: before.activatedAbility.characteristics.name,
    ...(choices.playerTarget === undefined
      ? {}
      : { playerTarget: choices.playerTarget }),
  });
  next.pendingDecision = null;
  if (d.scriptDefinitionVersion) next = finishScriptResolution(next);
  next.priorityWindow!.resolutionApplied = true;
  next.revision++;
  return next;
}
