import type { GameState } from "./game-state";
import type { ProgramChoices } from "./program-choices";
import type { ProgramPlayVariant } from "./program-play-option";
import type { ScriptBehavior } from "./resolve-script";
import type { TriggerBehavior } from "./resolve-trigger";
import {
  ruleEventObservationState,
  type PendingTrigger,
  type RuleEvent,
} from "./rule-events";
import {
  judgementEffectSchema,
  type JudgementEffect,
} from "./timed-trigger-effects";
import { takeEffectTimestamp } from "./effect-timestamp";
import type { ProgramBindingEffects } from "./program-bindings";
import type { TriggerTarget } from "./trigger-target";

export function judgement(
  version: string,
  handler: string,
  e: Pick<
    ProgramBindingEffects,
    "characteristics" | "canTarget" | "destroyBatch"
  >,
) {
  if (!e.destroyBatch) throw Error("Judgement destruction runtime unavailable");
  const shape = (c: ProgramChoices) => {
    if (
      c.targets.length ||
      c.modes.length ||
      c.x !== null ||
      c.playerTarget !== undefined ||
      c.mainframeTarget !== undefined ||
      c.runCharacters !== undefined ||
      c.cacheActionId !== undefined
    )
      throw Error("Invalid Judgement choices");
  };
  const qualifies = (s: GameState, event: RuleEvent, d: JudgementEffect) => {
    if (
      event.type !== "persistent-destroyed" ||
      event.player !== d.controller ||
      event.destroyedBy === null ||
      event.destroyedBy === d.controller ||
      d.expiresAfterTurn !== s.turn.number
    )
      return false;
    const observed = ruleEventObservationState(s, event);
    return (
      observed.arena.includes(event.instanceId) &&
      e.characteristics(observed).get(event.instanceId)?.cardType ===
        "character"
    );
  };
  const validate = (s: GameState, t: PendingTrigger) => {
    const d = t.judgement;
    if (
      !d ||
      d.kind !== "judgement" ||
      d.sourceDefinitionVersion !== version ||
      d.handler !== handler ||
      t.handler !== handler ||
      t.sourceId !== d.sourceId ||
      t.controller !== d.controller ||
      d.timestamp >= s.nextEffectNumber ||
      !qualifies(s, t.event, d)
    )
      throw Error("Invalid Judgement trigger");
    return d;
  };
  const targets = (s: GameState, t: PendingTrigger): TriggerTarget[] => {
    const d = validate(s, t),
      snapshot = structuredClone(s);
    snapshot.objects[t.sourceId].controller = t.controller;
    const current = e.characteristics(snapshot),
      kind = d.reversed ? "program" : "character";
    return [...s.arena, ...s.environment]
      .filter(
        (id) =>
          current.get(id)?.cardType === kind &&
          e.canTarget(snapshot, t.sourceId, id),
      )
      .map((id) => ({ kind, id, incarnation: s.objects[id].incarnation }));
  };
  const triggered: TriggerBehavior = {
    targets,
    resolve(s, t) {
      validate(s, t);
      const target = t.target;
      if (
        !target ||
        target.kind === "player" ||
        !targets(s, t).some(
          (c) =>
            c.kind !== "player" &&
            c.kind === target.kind &&
            c.id === target.id &&
            c.incarnation === target.incarnation,
        )
      )
        return s;
      return e.destroyBatch!(s, t.sourceId, [target.id], t.controller);
    },
  };
  const behavior: ScriptBehavior = {
    hasLegalTargets: () => true,
    resolve(s, a) {
      shape(a.programChoices);
      const next = structuredClone(s),
        timestamp = takeEffectTimestamp(next);
      next.triggerEffects.push(
        judgementEffectSchema.parse({
          kind: "judgement",
          id: `effect:${timestamp}`,
          timestamp,
          sourceId: a.sourceId,
          sourceDefinitionVersion: version,
          controller: a.controller,
          handler,
          reversed: a.programChoices.reversed,
          expiresAfterTurn: s.turn.number,
        }),
      );
      return next;
    },
  };
  return {
    behavior,
    triggered,
    shape,
    validate(_s: GameState, _id: string, c: ProgramChoices) {
      shape(c);
    },
    variants(
      _s: GameState,
      _id: string,
      reverse: boolean,
    ): ProgramPlayVariant[] {
      return (reverse ? [false, true] : [false]).map((reversed) => ({
        key: reversed ? "reversed" : "normal",
        label: reversed
          ? "Destroy a program for each qualifying destruction"
          : "Destroy a character for each qualifying destruction",
        reversed,
        x: null,
        modes: [],
        targets: [],
        mainframes: null,
      }));
    },
    discover(s: GameState, event: RuleEvent): PendingTrigger[] {
      return s.triggerEffects.flatMap((d) =>
        d.kind === "judgement" &&
        d.handler === handler &&
        d.sourceDefinitionVersion === version &&
        qualifies(s, event, d)
          ? [
              {
                sourceId: d.sourceId,
                controller: d.controller,
                handler,
                event: structuredClone(event),
                judgement: structuredClone(d),
              },
            ]
          : [],
      );
    },
  };
}
