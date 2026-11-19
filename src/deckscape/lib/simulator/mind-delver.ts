import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { AbilityChoices } from "./activate-ability";
import type { ActivatedBehavior } from "./resolve-ability";
import type { ActivationVariant } from "./activation-option";
import type { CharacterTargetEvaluation } from "./character-status-effects";
import { isCurrentActionTarget } from "./action-targets";
import {
  changePersistentStatus,
  type StatusEvaluation,
} from "./persistent-status";
import { grantTurnControl } from "./timed-control";

const target = (c: AbilityChoices) => {
  if (
    c.targets.length !== 1 ||
    c.modes.length ||
    c.x !== null ||
    c.playerTarget !== undefined
  )
    throw Error("Invalid Invasive Thoughts choices");
  return c.targets[0];
};
export function mindDelverTargets(
  s: GameState,
  player: Seat,
  source: string,
  e: CharacterTargetEvaluation,
) {
  const cards = e.characteristics(s);
  return s.arena.filter(
    (id) =>
      s.objects[id].controller !== player &&
      cards.get(id)?.cardType === "character" &&
      e.canTarget(s, source, id),
  );
}
export function validateInvasiveThoughts(
  s: GameState,
  player: Seat,
  source: string,
  c: AbilityChoices,
  e: CharacterTargetEvaluation,
) {
  if (!mindDelverTargets(s, player, source, e).includes(target(c)))
    throw Error("Invalid Invasive Thoughts target");
}
export function mindDelverVariants(
  s: GameState,
  player: Seat,
  source: string,
  e: CharacterTargetEvaluation,
): ActivationVariant[] {
  return [
    {
      key: "normal",
      label: "Take control until turn end; refresh and reboot",
      modes: [],
      x: null,
      targets: [
        {
          label: "Opponent's character",
          minimum: 1,
          maximum: 1,
          candidates: mindDelverTargets(s, player, source, e),
        },
      ],
    },
  ];
}
export function invasiveThoughts(
  e: CharacterTargetEvaluation &
    StatusEvaluation & { normalize(s: GameState): GameState },
): ActivatedBehavior {
  const behavior: ActivatedBehavior = {
    hasLegalTargets(s, a) {
      const id = target(a.activatedAbility.choices);
      return (
        isCurrentActionTarget(s, a, id) &&
        mindDelverTargets(s, a.controller, a.sourceId, e).includes(id)
      );
    },
    resolve(s, a) {
      if (!behavior.hasLegalTargets(s, a)) return s;
      const id = target(a.activatedAbility.choices),
        cards = e.characteristics(s),
        card = cards.get(id)!;
      // CR 205.4b.2 prohibits gaining a duplicate iconic persistent. The remaining
      // refresh/reboot instruction still applies to the otherwise legal target.
      const duplicate =
        card.iconic &&
        s.arena.some(
          (other) =>
            other !== id &&
            s.objects[other].controller === a.controller &&
            cards.get(other)?.iconic &&
            cards.get(other)?.name === card.name,
        );
      const next = duplicate
        ? s
        : e.normalize(grantTurnControl(s, a.sourceId, id, a.controller));
      return changePersistentStatus(
        next,
        a.sourceId,
        [
          { instanceId: id, operation: "refresh" },
          { instanceId: id, operation: "reboot" },
        ],
        e,
      );
    },
  };
  return behavior;
}
