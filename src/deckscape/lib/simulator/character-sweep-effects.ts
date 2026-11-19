import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { ActivatedBehavior } from "./resolve-ability";
import type { ActivatedDamageEffects } from "./activated-damage";
import type { AbilityChoices } from "./activate-ability";
import { addUntilTurnEndStatEffect } from "./timed-stat-effects";
import { addUntilTurnEndCombatEffect } from "./timed-combat-effects";
import { isCurrentIncarnation } from "./object-incarnation";
import type { CharacterCounterEffects } from "./character-counter-abilities";

export function validateUntargetedCharacterEffect(
  choices: AbilityChoices,
): void {
  if (
    choices.targets.length ||
    choices.modes.length ||
    choices.x !== null ||
    choices.playerTarget !== undefined
  )
    throw new Error("Invalid untargeted character effect choices");
}

export interface CharacterSweepSpecification {
  controllers: "all" | "opponents";
  amount: number;
  channel: "MF" | "BF";
  exceptNamedCard?: string;
  exceptSource?: boolean;
}

/** This effect does not target. Select all current recipients before applying one
 * damage batch. CR 201.3 bracketed names exclude every matching card, not only self. */
export function characterDamageSweep(
  spec: CharacterSweepSpecification,
  effects: Pick<ActivatedDamageEffects, "characteristics" | "damage">,
): ActivatedBehavior {
  if (
    !Number.isSafeInteger(spec.amount) ||
    spec.amount < 0 ||
    !["all", "opponents"].includes(spec.controllers) ||
    !["MF", "BF"].includes(spec.channel)
  )
    throw new Error("Invalid character damage sweep");
  return {
    hasLegalTargets(_state, action) {
      validateUntargetedCharacterEffect(action.activatedAbility.choices);
      return true;
    },
    resolve(state, action) {
      const current = effects.characteristics(structuredClone(state));
      const packets = state.arena.flatMap((id) => {
        const card = current.get(id),
          object = state.objects[id];
        if (!card) throw new Error("Damage sweep characteristics unavailable");
        if (
          card.cardType !== "character" ||
          (spec.exceptSource &&
            id === action.sourceId &&
            isCurrentIncarnation(state, action.activatedAbility.source)) ||
          (spec.controllers === "opponents" &&
            object.controller === action.controller) ||
          (spec.exceptNamedCard &&
            !object.token &&
            card.name === spec.exceptNamedCard)
        )
          return [];
        return [
          {
            sourceId: action.sourceId,
            recipient: "character" as const,
            instanceId: id,
            amount: spec.amount,
            channel: spec.channel,
          },
        ];
      });
      return packets.length
        ? effects.damage(
            state,
            packets,
            action.activatedAbility.characteristics,
          )
        : state;
    },
  };
}

export function windmill(
  effects: Pick<ActivatedDamageEffects, "characteristics" | "damage"> &
    Pick<CharacterCounterEffects, "putCounters">,
): ActivatedBehavior {
  const sweep = characterDamageSweep(
    { controllers: "all", amount: 1, channel: "BF", exceptSource: true },
    effects,
  );
  return {
    hasLegalTargets: sweep.hasLegalTargets,
    resolve(state, action, resources) {
      const next = sweep.resolve(state, action, resources);
      if (
        next.outcome ||
        !isCurrentIncarnation(next, action.activatedAbility.source) ||
        !next.arena.includes(action.sourceId) ||
        effects.characteristics(next).get(action.sourceId)?.cardType !==
          "character"
      )
        return next;
      return effects.putCounters(next, action.sourceId, [
        { instanceId: action.sourceId, counter: "-1/-1", amount: 1 },
      ]);
    },
  };
}

/** CALL OF THE CHROME fixes its recipients and cyberware counts during resolution.
 * Later source departure, attachments or faction/control changes do not recalculate it. */
export function callOfTheChrome(effects: {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
}): ActivatedBehavior {
  return {
    hasLegalTargets(_state, action) {
      validateUntargetedCharacterEffect(action.activatedAbility.choices);
      return true;
    },
    resolve(state, action) {
      const current = effects.characteristics(structuredClone(state));
      const recipients = state.arena.flatMap((id) => {
        const card = current.get(id);
        if (!card)
          throw new Error("Chrome recipient characteristics unavailable");
        if (
          state.objects[id].controller !== action.controller ||
          card.cardType !== "character" ||
          !card.factions.includes("CYBERNETIC")
        )
          return [];
        const attached = state.arena.filter((gearId) => {
          const gear = current.get(gearId);
          if (!gear)
            throw new Error("Chrome attachment characteristics unavailable");
          return (
            gear.cardType === "gear" &&
            gear.subtype === "cyberware" &&
            state.objects[gearId].attachments.some(
              (link) => link.kind === "gear" && link.hostId === id,
            )
          );
        }).length;
        return [{ id, bonus: attached * 2 }];
      });
      let next = structuredClone(state);
      for (const recipient of recipients) {
        next = addUntilTurnEndStatEffect(
          next,
          action.sourceId,
          recipient.id,
          {
            layer: "7d",
            operation: "add",
            attack: recipient.bonus,
            defence: 0,
          },
          current,
        );
        next = addUntilTurnEndCombatEffect(
          next,
          action.sourceId,
          recipient.id,
          { kind: "grant-keyword", keyword: "OVERRUN" },
          current,
        );
      }
      return next;
    },
  };
}
