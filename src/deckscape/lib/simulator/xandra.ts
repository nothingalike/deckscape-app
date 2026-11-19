import { ruleEventObservationState } from "./rule-events";
import type { GameState } from "./game-state";
import type { AbilityChoices } from "./ability-choices";
import type { ActivatedBehavior } from "./resolve-ability";
import type { CharacterDestructionCostEffects } from "./character-destruction-cost";
import type { ActivatedDamageEffects } from "./activated-damage";
import { payRam } from "./ram";
import { resolvePsychosis, type PsychosisEvaluation } from "./psychosis";
import { isCurrentActionTarget } from "./action-targets";
export interface XandraEffects extends CharacterDestructionCostEffects {
  psychosis: PsychosisEvaluation;
  canRun(s: GameState, id: string): boolean;
  damage: ActivatedDamageEffects["damage"];
  canTarget(s: GameState, source: string, id: string): boolean;
}
export function xandra(e: XandraEffects) {
  const candidates = (s: GameState, source: string) => {
    const cards = e.characteristics(s);
    return s.arena.filter(
      (id) =>
        id !== source &&
        s.objects[id].controller === s.objects[source].controller &&
        !s.objects[id].running &&
        cards.get(id)?.cardType === "character" &&
        cards.get(id)!.factions.includes("NANOBOT") &&
        e.canRun(s, id),
    );
  };
  const validateRun = (
    s: GameState,
    id: string,
    ids: readonly string[],
    count: number,
  ) => {
    if (
      ids.length !== count ||
      new Set(ids).size !== ids.length ||
      ids.some((x) => !candidates(s, id).includes(x))
    )
      throw Error("Invalid NANOBOT run payment");
  };
  const shape = (c: AbilityChoices) => {
    if (
      !c.sacrificeCharacters ||
      c.modes.length ||
      c.x !== null ||
      c.playerTarget !== undefined ||
      c.sacrificeRam !== undefined ||
      c.cacheActionId !== undefined ||
      c.targets.length !== c.sacrificeCharacters.length
    )
      throw Error("Invalid SWARM STRIKE choices");
  };
  const validate = (s: GameState, id: string, c: AbilityChoices) => {
    shape(c);
    validateRun(s, id, c.sacrificeCharacters!, c.sacrificeCharacters!.length);
    const cards = e.characteristics(s);
    if (
      c.targets.some(
        (t) =>
          !s.arena.includes(t) ||
          cards.get(t)?.cardType !== "character" ||
          !e.canTarget(s, id, t),
      )
    )
      throw Error("Invalid SWARM STRIKE target");
  };
  const behavior: ActivatedBehavior = {
    hasLegalTargets(s, a) {
      return (
        a.activatedAbility.choices.targets.length === 0 ||
        a.activatedAbility.choices.targets.some(
          (id) =>
            isCurrentActionTarget(s, a, id) &&
            s.arena.includes(id) &&
            e.characteristics(s).get(id)?.cardType === "character" &&
            e.canTarget(s, a.sourceId, id),
        )
      );
    },
    resolve(s, a) {
      const c = a.activatedAbility.choices;
      shape(c);
      const values = a.activatedAbility.destroyedCharacterAttacks;
      if (
        !values ||
        values.length !== c.targets.length ||
        values.some((v, i) => v.id !== c.sacrificeCharacters![i])
      )
        throw Error("Missing SWARM STRIKE payment snapshot");
      const cards = e.characteristics(s);
      const packets = c.targets.flatMap((id, i) =>
        isCurrentActionTarget(s, a, id) &&
        s.arena.includes(id) &&
        cards.get(id)?.cardType === "character" &&
        e.canTarget(s, a.sourceId, id)
          ? [
              {
                sourceId: a.sourceId,
                recipient: "character" as const,
                instanceId: id,
                channel: "BF" as const,
                amount: Math.max(0, values[i].attack),
              },
            ]
          : [],
      );
      return packets.length
        ? e.damage(s, packets, a.activatedAbility.characteristics)
        : s;
    },
  };
  return {
    candidates,
    validateRun,
    validate,
    behavior,
    cost(id: string) {
      return {
        validate: (s: GameState, c: AbilityChoices) => validate(s, id, c),
        capture(s: GameState, c: AbilityChoices, paid: GameState) {
          return c.sacrificeCharacters!.map((id) => {
            const event = paid.pendingRuleEvents.findLast(
              (event) =>
                event.type === "persistent-destroyed" &&
                event.instanceId === id,
            );
            if (!event) throw Error("Missing destruction payment observation");
            const card = e
              .characteristics(ruleEventObservationState(paid, event))
              .get(id);
            if (card?.cardType !== "character") throw Error();
            return { id, attack: card.attack };
          });
        },
        pay(s: GameState, c: AbilityChoices) {
          const ids = c.sacrificeCharacters!;
          let next = payRam(
            s,
            s.objects[id].controller,
            0,
            [],
            new Map(),
            undefined,
            ids,
          );
          next = resolvePsychosis(
            next,
            s,
            ids,
            { type: "external-run" },
            e.psychosis,
          );
          next = e.depart(
            next,
            ids.map((target) => ({
              id: target,
              kind: "destroy",
              reason: "cost",
              sourceId: id,
              destroyedBy: s.objects[id].controller,
            })),
          );
          if (next.pendingDecision || ids.some((x) => next.arena.includes(x)))
            throw Error("Unpaid SWARM STRIKE destruction");
          return next;
        },
      };
    },
    variants(s: GameState, id: string) {
      const available = candidates(s, id),
        cards = e.characteristics(s),
        targets = s.arena.filter(
          (t) =>
            cards.get(t)?.cardType === "character" && e.canTarget(s, id, t),
        );
      return Array.from(
        {
          length:
            Math.max(
              available.length,
              ...(s.priorityWindow?.stack ?? [])
                .filter(
                  (a) =>
                    a.sourceId === id &&
                    a.activatedAbility?.abilityId === "swarm-strike",
                )
                .map(
                  (a) =>
                    a.activatedAbility!.choices.sacrificeCharacters?.length ??
                    0,
                ),
            ) + 1,
        },
        (_, count) => ({
          key: `swarm-${count}`,
          label: `Destroy ${count} NANOBOT${count === 1 ? "" : "s"}`,
          modes: [],
          x: null,
          targets: [
            {
              label: "NANOBOT characters to run and destroy",
              purpose: "sacrifice-character" as const,
              minimum: count,
              maximum: count,
              candidates: available,
            },
            ...Array.from({ length: count }, (_, i) => ({
              label: `Damage target for NANOBOT ${i + 1}`,
              minimum: 1,
              maximum: 1,
              candidates: targets,
            })),
          ],
        }),
      );
    },
  };
}
