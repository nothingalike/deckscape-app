import type { GameState } from "./game-state";
import type { CacheAction } from "./priority";
import type { ProgramChoices } from "./program-choices";
import type { ProgramPlayVariant } from "./program-play-option";
import type { CardCharacteristics } from "./characteristics";
import { finishScriptResolution, type ScriptBehavior } from "./resolve-script";
import { isCurrentActionTarget } from "./action-targets";
import {
  pendingActivated,
  beginScriptRedirect,
  type RedirectEvaluation,
} from "./redirect-ability";
import {
  validateRetargetChoiceContinuation,
  type RetargetChoiceEvaluation,
} from "./retarget-choice";
import type {
  ProgramRetargetObjectOption,
  ProgramRetargetSelection,
} from "./retarget-program";

export interface ChariotEffects {
  version: string;
  characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
  canTarget(s: GameState, source: string, target: string): boolean;
  validateSource(s: GameState, source: string): void;
  redirect: RedirectEvaluation;
  options(s: GameState, actionId: string): ProgramRetargetSelection[];
  objectSlots(s: GameState, actionId: string): ProgramRetargetObjectOption[][];
  retarget(
    s: GameState,
    actionId: string,
    selected: ProgramRetargetSelection,
  ): GameState;
  retargetObjects(
    s: GameState,
    actionId: string,
    indices: readonly number[],
  ): GameState;
}

/** Printed Chariot behavior. Admission and original-program target rules remain
 * release-owned; this composes the saved normal and reversed resolution paths. */
export function theChariot(e: ChariotEffects) {
  const shape = (c: ProgramChoices) => {
    if (
      c.modes.length ||
      c.x !== null ||
      c.mainframeTarget !== undefined ||
      c.playerTarget !== undefined ||
      c.runCharacters !== undefined ||
      (c.reversed
        ? c.targets.length !== 0 || !c.cacheActionId
        : c.targets.length !== 1 || c.cacheActionId !== undefined)
    )
      throw Error("Invalid Chariot choices");
  };
  const program = (s: GameState, source: string, id: string) => {
    if (
      source === id ||
      !s.cache.includes(id) ||
      s.objects[id]?.faceDown ||
      e.characteristics(s).get(id)?.cardType !== "program" ||
      !e.canTarget(s, source, id)
    )
      return undefined;
    return s.priorityWindow?.stack.find(
      (a) =>
        a.kind === "card" &&
        a.sourceId === id &&
        a.programChoices &&
        a.sourceIncarnation === s.objects[id].incarnation,
    );
  };
  const target = (s: GameState, source: string, c: ProgramChoices) =>
    c.reversed
      ? pendingActivated(s, c.cacheActionId!)
      : program(s, source, c.targets[0]);
  const grouped = (a: CacheAction) => a.programChoices!.targets.length > 1;
  const behavior: ScriptBehavior = {
    hasLegalTargets(s, a) {
      shape(a.programChoices);
      return (
        !!target(s, a.sourceId, a.programChoices) &&
        (a.programChoices.reversed ||
          isCurrentActionTarget(s, a, a.programChoices.targets[0]))
      );
    },
    resolve(s, a) {
      e.validateSource(s, a.sourceId);
      if (!behavior.hasLegalTargets(s, a)) return s;
      if (a.programChoices.reversed)
        return beginScriptRedirect(s, a, e.version, e.redirect);
      const original = target(s, a.sourceId, a.programChoices)!;
      const slots = grouped(original)
        ? e.objectSlots(s, original.id)
        : undefined;
      const options = slots ? [] : e.options(s, original.id);
      if (slots ? !slots.some((slot) => slot.length > 1) : !options.length)
        return s;
      if (s.pendingDecision)
        throw Error("Another resolution decision is pending");
      const next = structuredClone(s);
      next.pendingDecision = {
        type: "retarget-program",
        id: `retarget:${a.id}`,
        sourceId: a.sourceId,
        actionId: a.id,
        targetActionId: original.id,
        player: a.controller,
        options: structuredClone(options),
        ...(slots ? { objectSlots: structuredClone(slots) } : {}),
      };
      validateRetargetChoiceContinuation(next);
      return next;
    },
  };
  return {
    behavior,
    shape,
    validate(s: GameState, source: string, c: ProgramChoices) {
      e.validateSource(s, source);
      shape(c);
      if (!target(s, source, c)) throw Error("Illegal Chariot target");
    },
    variants(
      s: GameState,
      source: string,
      reverse: boolean,
    ): ProgramPlayVariant[] {
      e.validateSource(s, source);
      return [
        {
          key: "normal",
          label: "Change a program's targets",
          modes: [],
          x: null,
          reversed: false,
          mainframes: null,
          targets: [
            {
              label: "Program on the cache",
              minimum: 1,
              maximum: 1,
              candidates: s.cache.filter((id) => program(s, source, id)),
            },
          ],
        },
        ...(reverse
          ? (s.priorityWindow?.stack ?? []).flatMap((a) =>
              a.kind === "activated" && a.activatedAbility
                ? [
                    {
                      key: `reversed:${a.id}`,
                      label: `Reversed: ${a.activatedAbility.characteristics.name} — ${a.activatedAbility.abilityId}`,
                      modes: [],
                      x: null,
                      reversed: true,
                      cacheActionId: a.id,
                      mainframes: null,
                      targets: [],
                    },
                  ]
                : [],
            )
          : []),
      ];
    },
    choice(s: GameState): RetargetChoiceEvaluation {
      const saved = validateRetargetChoiceContinuation(s);
      e.validateSource(s, saved.sourceId);
      shape(s.priorityWindow!.resolving!.programChoices!);
      if (s.priorityWindow!.resolving!.programChoices!.reversed)
        throw Error("Reversed Chariot requires an ability decision");
      const check = (d: typeof saved) => {
        if (
          d.actionId !== saved.actionId ||
          d.targetActionId !== saved.targetActionId
        )
          throw Error("Wrong Chariot continuation");
      };
      return {
        characteristics: e.characteristics(s),
        options: e.options,
        objectSlots: e.objectSlots,
        complete(state, d, selected) {
          check(d);
          return finishScriptResolution(
            e.retarget(state, d.targetActionId, selected),
          );
        },
        completeObjects(state, d, indices) {
          check(d);
          return finishScriptResolution(
            e.retargetObjects(state, d.targetActionId, indices),
          );
        },
      };
    },
  };
}
