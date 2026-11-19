import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { AbilityChoices } from "./ability-choices";
import type { ActivatedBehavior } from "./resolve-ability";
import type { ActivationVariant } from "./activation-option";
import type { CharacterActivationEffects } from "./character-activation-bindings";
import { isCurrentActionTarget } from "./action-targets";
import { captureEventObservation } from "./event-observation";

export function aliceAbility(
  kind: "living-backwards" | "checkmate",
  source: CardCharacteristics,
  effects: Pick<
    CharacterActivationEffects,
    "characteristics" | "canTarget" | "counters"
  >,
) {
  const shape = (c: AbilityChoices) => {
    if (
      c.targets.length !== (kind === "checkmate" ? 0 : 1) ||
      c.modes.length ||
      c.x !== null ||
      c.playerTarget !== undefined ||
      c.sacrificeRam !== undefined ||
      c.sacrificeCharacters !== undefined ||
      c.cacheActionId !== undefined
    )
      throw Error("Invalid Alice ability choices");
  };
  const candidates = (s: GameState, sourceId: string) => {
    const current = effects.characteristics(s);
    return s.arena.filter((id) => {
      const c = current.get(id);
      return (
        c?.cardType === "character" &&
        c.factions.includes("WONDERLAND") &&
        effects.canTarget(s, sourceId, id, source)
      );
    });
  };
  const behavior: ActivatedBehavior = {
    hasLegalTargets(s, a) {
      shape(a.activatedAbility.choices);
      return (
        kind === "checkmate" ||
        (isCurrentActionTarget(s, a, a.activatedAbility.choices.targets[0]) &&
          candidates(s, a.sourceId).includes(
            a.activatedAbility.choices.targets[0],
          ))
      );
    },
    resolve(s, a) {
      if (kind === "checkmate") {
        const current = effects.characteristics(s),
          chess = new Set<string>();
        let opposingCharacters = 0;
        for (const id of s.arena) {
          const c = current.get(id),
            o = s.objects[id];
          if (c?.cardType !== "character") continue;
          if (o.controller !== a.controller) opposingCharacters++;
          else if (o.token) chess.add(c.name.toLowerCase());
        }
        if (
          opposingCharacters !== 1 ||
          !["pawn", "bishop", "rook"].every((name) => chess.has(name))
        )
          return s;
        const next = structuredClone(s);
        next.outcome = {
          type: "win",
          winner: a.controller,
          reason: "card-effect",
        };
        return next;
      }
      const id = a.activatedAbility.choices.targets[0],
        count = s.objects[id].counters.INVERT ?? 0;
      if (!count)
        return effects.counters!.putCounters(
          s,
          a.sourceId,
          [{ instanceId: id, counter: "INVERT", amount: 1 }],
          source,
        );
      const next = structuredClone(s);
      if (count === 1) delete next.objects[id].counters.INVERT;
      else next.objects[id].counters.INVERT = count - 1;
      next.pendingRuleEvents.push({
        type: "counters-removed",
        sourceId: a.sourceId,
        instanceId: id,
        player: next.objects[id].controller,
        counter: "INVERT",
        amount: 1,
        ...captureEventObservation(next),
      });
      return next;
    },
  };
  return {
    behavior,
    validate(s: GameState, id: string, c: AbilityChoices) {
      shape(c);
      if (kind !== "checkmate" && !candidates(s, id).includes(c.targets[0]))
        throw Error("Choose a WONDERLAND character");
    },
    variants(s: GameState, id: string): ActivationVariant[] {
      return [
        {
          key: kind,
          label: kind === "checkmate" ? "Check for checkmate" : "Toggle INVERT",
          modes: [],
          x: null,
          targets:
            kind === "checkmate"
              ? []
              : [
                  {
                    label: "WONDERLAND character",
                    minimum: 1,
                    maximum: 1,
                    candidates: candidates(s, id),
                  },
                ],
        },
      ];
    },
  };
}
