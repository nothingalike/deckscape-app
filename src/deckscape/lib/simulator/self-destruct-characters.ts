import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { ActivatedAction, ActivatedBehavior } from "./resolve-ability";
import type { AbilityChoices } from "./activate-ability";
import type { ActivationVariant } from "./activation-option";
import {
  activatedDamage,
  type ActivatedDamageEffects,
} from "./activated-damage";
import type { SelfDestructionCost } from "./search-and-destroy";
import { isCurrentIncarnation } from "./object-incarnation";
import { activatedSourceInformation } from "./activated-source-information";
import { validateUntargetedCharacterEffect } from "./character-sweep-effects";
import type { CombatDamagePacket } from "./combat-damage";

export const isSelfDestructAbility = (id: string) =>
  id === "boom" || id === "leap-of-faith";

export function selfDestructCharacter(
  id: string,
  source: CardCharacteristics,
  effects: ActivatedDamageEffects & SelfDestructionCost,
) {
  if (!isSelfDestructAbility(id))
    throw Error("Unknown self-destruction ability");
  const targeted = id === "leap-of-faith";
  const leap = (captured = source) =>
    activatedDamage(
      {
        recipient: "character",
        minimum: 0,
        maximum: 2,
        channel: "BF",
        amount: 1,
      },
      captured,
      effects,
    );
  const behavior: ActivatedBehavior = {
    hasLegalTargets(state, action) {
      if (targeted) return leap().behavior.hasLegalTargets(state, action);
      validateUntargetedCharacterEffect(action.activatedAbility.choices);
      return true;
    },
    resolve(state, action, resources) {
      if (
        !isCurrentIncarnation(state, action.activatedAbility.source) ||
        ![
          ...state.arena,
          ...state.environment,
          ...state.players.flatMap((p) => p.zones.ramBank),
        ].includes(action.sourceId)
      )
        return state;
      const payment = effects.pay(structuredClone(state), action.sourceId),
        next = payment.state;
      if (
        typeof payment.paid !== "boolean" ||
        next.revision !== state.revision ||
        next.engineVersion !== state.engineVersion ||
        next.rulesVersion !== state.rulesVersion ||
        next.pendingDecision
      )
        throw Error("Invalid self-destruction payment result");
      if (!payment.paid || next.outcome) return next;
      const retained = next.priorityWindow?.resolving;
      if (retained?.id !== action.id || !retained.activatedAbility)
        throw Error("Self-destruction changed the resolving action");
      const current = effects.characteristics(next),
        captured = activatedSourceInformation(
          next,
          retained as ActivatedAction,
          current,
        );
      if (targeted)
        return leap(captured).behavior.resolve(next, action, resources);
      const packets: CombatDamagePacket[] = [];
      for (const player of [0, 1] as const)
        for (const channel of ["MF", "BF"] as const)
          packets.push({
            sourceId: action.sourceId,
            sourceController: action.controller,
            recipient: "player",
            player,
            channel,
            amount: 4,
          });
      for (const target of next.arena)
        if (current.get(target)?.cardType === "character")
          packets.push({
            sourceId: action.sourceId,
            sourceController: action.controller,
            recipient: "character",
            instanceId: target,
            channel: "BF",
            amount: 4,
          });
      return effects.damage(next, packets, captured);
    },
  };
  return {
    behavior,
    validate(state: GameState, sourceId: string, choices: AbilityChoices) {
      if (targeted) leap().validate(state, sourceId, choices);
      else validateUntargetedCharacterEffect(choices);
    },
    variants(state: GameState, sourceId: string): ActivationVariant[] {
      return targeted
        ? [leap().variant(state, sourceId)]
        : [
            {
              key: "normal",
              label:
                "Destroy this character; damage all players and characters",
              modes: [],
              x: null,
              targets: [],
            },
          ];
    },
  };
}
