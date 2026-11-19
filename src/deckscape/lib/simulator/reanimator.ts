import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { AbilityChoices } from "./activate-ability";
import type { ActivatedBehavior } from "./resolve-ability";
import type { TriggerBehavior } from "./resolve-trigger";
import type { ActivationVariant } from "./activation-option";
import type { CharacterTargetEvaluation } from "./character-status-effects";
import { isCurrentActionTarget } from "./action-targets";
import { scheduleActivatedTargetPurge } from "./delayed-triggers";

export interface ReanimatorEffects {
  enter(
    state: GameState,
    player: Seat,
    sourceId: string,
    targetId: string,
  ): GameState;
  purge(state: GameState, sourceId: string, targetId: string): GameState;
}
const target = (c: AbilityChoices) => {
  if (
    c.targets.length !== 1 ||
    c.modes.length ||
    c.x !== null ||
    c.playerTarget !== undefined
  )
    throw Error("Invalid Recompile choices");
  return c.targets[0];
};
export function reanimatorTargets(
  s: GameState,
  player: Seat,
  source: string,
  effects: CharacterTargetEvaluation,
): string[] {
  const current = effects.characteristics(s);
  return s.players[player].zones.recycleBin.filter((id) => {
    const c = current.get(id);
    return (
      !s.objects[id].token &&
      c?.cardType === "character" &&
      c.factions.includes("MYSTIC") &&
      effects.canTarget(s, source, id)
    );
  });
}
export function validateRecompile(
  s: GameState,
  player: Seat,
  source: string,
  c: AbilityChoices,
  effects: CharacterTargetEvaluation,
) {
  if (!reanimatorTargets(s, player, source, effects).includes(target(c)))
    throw Error("Invalid Recompile target");
}
export function reanimatorVariants(
  s: GameState,
  player: Seat,
  source: string,
  effects: CharacterTargetEvaluation,
): ActivationVariant[] {
  return [
    {
      key: "normal",
      label: "Recompile a MYSTIC character with SPIRIT",
      modes: [],
      x: null,
      targets: [
        {
          label: "MYSTIC character in your recycle bin",
          minimum: 1,
          maximum: 1,
          candidates: reanimatorTargets(s, player, source, effects),
        },
      ],
    },
  ];
}
export function recompile(
  version: string,
  handler: string,
  effects: CharacterTargetEvaluation & ReanimatorEffects,
): ActivatedBehavior {
  const behavior: ActivatedBehavior = {
    hasLegalTargets(s, a) {
      const id = target(a.activatedAbility.choices);
      return (
        isCurrentActionTarget(s, a, id) &&
        reanimatorTargets(s, a.controller, a.sourceId, effects).includes(id)
      );
    },
    resolve(s, a) {
      if (!behavior.hasLegalTargets(s, a)) return s;
      const id = target(a.activatedAbility.choices),
        incarnation = s.objects[id].incarnation;
      const next = effects.enter(s, a.controller, a.sourceId, id);
      return next.arena.includes(id) &&
        next.objects[id].incarnation !== incarnation
        ? scheduleActivatedTargetPurge(next, a, version, handler, id)
        : next;
    },
  };
  return behavior;
}
export function reanimatorPurge(
  version: string,
  handler: string,
  purge: ReanimatorEffects["purge"],
): TriggerBehavior {
  return {
    resolve(s, t) {
      const d = t.delayed;
      if (
        t.handler !== handler ||
        t.event.type !== "turn-ending" ||
        d?.kind !== "next-turn-end-purge-target" ||
        d.sourceDefinitionVersion !== version ||
        d.handler !== handler ||
        d.sourceId !== t.sourceId ||
        d.controller !== t.controller
      )
        throw Error("Invalid Reanimator purge");
      return s.arena.includes(d.targetId) &&
        s.objects[d.targetId]?.incarnation === d.targetIncarnation
        ? purge(s, t.sourceId, d.targetId)
        : s;
    },
  };
}
