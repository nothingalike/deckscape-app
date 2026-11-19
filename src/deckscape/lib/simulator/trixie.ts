import type { GameState } from "./game-state";
import type { AbilityChoices } from "./ability-choices";
import type { ActivatedBehavior } from "./resolve-ability";
import type { EventBehavior } from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import { takeEffectTimestamp } from "./effect-timestamp";
import type { Seat } from "./setup";
export const trixieDrawHandler = "trixie/tarot-draw-v1";
export function validateFloorScore(c: AbilityChoices) {
  if (
    c.targets.length ||
    c.modes.length ||
    c.x !== null ||
    c.playerTarget !== undefined ||
    c.sacrificeRam !== undefined ||
    c.cacheActionId !== undefined
  )
    throw Error("Invalid FLOOR SCORE choices");
}
export const floorScore: ActivatedBehavior = {
  hasLegalTargets: () => true,
  resolve(s, a) {
    validateFloorScore(a.activatedAbility.choices);
    const next = structuredClone(s),
      timestamp = takeEffectTimestamp(next);
    next.triggerEffects.push({
      kind: "floor-score",
      id: `effect:${timestamp}`,
      timestamp,
      sourceId: a.sourceId,
      controller: a.controller,
      expiresAfterTurn: s.turn.number,
    });
    return next;
  },
};
export function floorScorePayments(
  s: GameState,
  player: Seat,
  tags: readonly string[],
) {
  return tags.includes("DRUG")
    ? s.triggerEffects
        .filter(
          (e) =>
            e.kind === "floor-score" &&
            e.controller === player &&
            e.expiresAfterTurn === s.turn.number,
        )
        .map((e) => e.id)
    : [];
}
export function trixieDraw(
  version: string | undefined,
  hasAbility: (s: GameState, id: string) => boolean,
  draw: (s: GameState, p: Seat, n: number) => GameState,
) {
  const event: EventBehavior = {
    onEvent(s, id, e) {
      return e.type === "program-played" &&
        e.tags.includes("TAROT") &&
        e.player === s.objects[id].controller &&
        s.arena.includes(id) &&
        hasAbility(s, id)
        ? [
            {
              sourceId: id,
              controller: s.objects[id].controller,
              handler: trixieDrawHandler,
              event: e,
            },
          ]
        : [];
    },
  };
  const trigger: TriggerBehavior = {
    resolve(s, t) {
      if (
        t.handler !== trixieDrawHandler ||
        t.event.type !== "program-played" ||
        !t.event.tags.includes("TAROT") ||
        t.event.player !== t.controller
      )
        throw Error("Invalid Trixie draw");
      return draw(s, t.controller, 1);
    },
  };
  return {
    events: new Map(version ? [[version, event]] : []),
    triggers: new Map([[trixieDrawHandler, trigger]]),
    triggerLabels: new Map([
      [trixieDrawHandler, "Trixie: draw 1 for playing a tarot."],
    ]),
  };
}
