import type { GameState } from "./game-state";
import type { ProgramChoices } from "./program-choices";
import type { ScriptBehavior } from "./resolve-script";
import type { CacheAction } from "./priority";
import type { TriggerBehavior } from "./resolve-trigger";
import type { ProgramPlayVariant } from "./program-play-option";
import type { ProgramBindingEffects } from "./program-bindings";
import { isCurrentActionTarget } from "./action-targets";
import { addUntilTurnEndStatEffect } from "./timed-stat-effects";
import { scheduleScriptTargetDestruction } from "./delayed-triggers";

export function rushTheStage(
  version: string,
  handler: string,
  effects: Pick<
    ProgramBindingEffects,
    "characteristics" | "canTarget" | "destroyBatch"
  >,
) {
  const shape = (c: ProgramChoices) => {
    if (
      c.targets.length !== 1 ||
      c.modes.length ||
      c.x === null ||
      !Number.isSafeInteger(c.x) ||
      c.x < 0 ||
      c.reversed ||
      c.mainframeTarget !== undefined ||
      c.playerTarget !== undefined ||
      c.runCharacters !== undefined
    )
      throw Error("Invalid Rush the Stage choices");
    return c.x;
  };
  const candidates = (s: GameState, source: string) => {
    const current = effects.characteristics(s);
    return s.arena.filter((id) => {
      const c = current.get(id);
      return (
        c?.cardType === "character" &&
        c.factions.includes("THRASHER") &&
        effects.canTarget(s, source, id)
      );
    });
  };
  const legalTargets = (
    s: GameState,
    id: string,
    c: ProgramChoices,
    action?: CacheAction,
  ) => {
    shape(c);
    return c.targets.filter(
      (target) =>
        candidates(s, id).includes(target) &&
        (!action || isCurrentActionTarget(s, action, target)),
    );
  };
  const behavior: ScriptBehavior = {
    hasLegalTargets: (s, a) =>
      legalTargets(s, a.sourceId, a.programChoices, a).length > 0,
    resolve(s, a) {
      const amount = shape(a.programChoices),
        target = legalTargets(s, a.sourceId, a.programChoices, a)[0];
      if (!target) return s;
      const next = addUntilTurnEndStatEffect(
        s,
        a.sourceId,
        target,
        { layer: "7d", operation: "add", attack: amount },
        effects.characteristics(s),
      );
      return scheduleScriptTargetDestruction(next, a, handler, target);
    },
  };
  const triggered: TriggerBehavior = {
    resolve(s, t) {
      const d = t.delayed;
      if (
        t.handler !== handler ||
        t.event.type !== "turn-ending" ||
        d?.kind !== "next-turn-end-destroy" ||
        d.sourceDefinitionVersion !== version ||
        d.handler !== handler ||
        d.sourceId !== t.sourceId ||
        d.controller !== t.controller
      )
        throw Error("Invalid Rush the Stage delayed trigger");
      if (
        !s.arena.includes(d.targetId) ||
        s.objects[d.targetId]?.incarnation !== d.targetIncarnation
      )
        return s;
      if (!effects.destroyBatch)
        throw Error("Rush the Stage destruction runtime unavailable");
      return effects.destroyBatch(s, t.sourceId, [d.targetId], t.controller);
    },
  };
  return {
    behavior,
    triggered,
    shape,
    legalTargets: (s: GameState, a: CacheAction) =>
      a.programChoices!.targets.map((id) =>
        legalTargets(s, a.sourceId, a.programChoices!, a).includes(id),
      ),
    slotCandidates: (s: GameState, a: CacheAction) =>
      new Set(candidates(s, a.sourceId)),
    validate(s: GameState, id: string, c: ProgramChoices) {
      if (legalTargets(s, id, c).length !== 1)
        throw Error("Invalid Rush the Stage target");
    },
    variants(s: GameState, id: string): ProgramPlayVariant[] {
      const p = s.players[s.objects[id].controller];
      return [
        {
          key: "normal",
          label: "Pay X MF and X BF; grant +X/+0 until turn end",
          modes: [],
          reversed: false,
          x: {
            minimum: 0,
            maximum: Math.max(0, Math.min(p.mainframeHealth, p.bioframeHealth)),
          },
          targets: [
            {
              label: "THRASHER character",
              minimum: 1,
              maximum: 1,
              candidates: candidates(s, id),
            },
          ],
          mainframes: null,
        },
      ];
    },
  };
}
