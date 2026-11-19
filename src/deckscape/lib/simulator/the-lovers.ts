import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { ProgramChoices } from "./program-choices";
import type { CacheAction } from "./priority";
import type { ScriptBehavior } from "./resolve-script";
import type { TriggerBehavior } from "./resolve-trigger";
import type { ProgramPlayVariant } from "./program-play-option";
import type { CounterPlacement } from "./put-counters";
import type { Seat } from "./setup";
import { isCurrentActionTarget } from "./action-targets";
import { scheduleLinkedDestruction } from "./delayed-triggers";

export function theLovers(
  version: string,
  handler: string,
  effects: {
    characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
    canTarget(s: GameState, source: string, id: string): boolean;
    putCounters(
      s: GameState,
      source: string,
      placements: readonly CounterPlacement[],
    ): GameState;
    destroy(
      s: GameState,
      source: string,
      ids: readonly string[],
      controller: Seat,
    ): GameState;
  },
) {
  const shape = (c: ProgramChoices) => {
    if (
      c.reversed ||
      c.targets.length !== 2 ||
      new Set(c.targets).size !== 2 ||
      c.modes.length ||
      c.x !== null ||
      c.playerTarget !== undefined ||
      c.mainframeTarget !== undefined ||
      c.runCharacters !== undefined
    )
      throw Error("Invalid Lovers choices");
  };
  const candidates = (s: GameState, id: string) => {
    const current = effects.characteristics(s);
    return s.arena.filter(
      (target) =>
        current.get(target)?.cardType === "character" &&
        effects.canTarget(s, id, target),
    );
  };
  const legalTargets = (s: GameState, a: CacheAction) => {
    shape(a.programChoices!);
    const permitted = candidates(s, a.sourceId);
    return a.programChoices!.targets.map(
      (id) => isCurrentActionTarget(s, a, id) && permitted.includes(id),
    );
  };
  const behavior: ScriptBehavior = {
    hasLegalTargets: (s, a) => legalTargets(s, a).some(Boolean),
    resolve(s, a) {
      const legal = legalTargets(s, a);
      if (!legal.some(Boolean)) return s;
      const next = effects.putCounters(
        s,
        a.sourceId,
        a.programChoices.targets.flatMap((id, i) =>
          legal[i] ? [{ instanceId: id, counter: "+1/+1", amount: 2 }] : [],
        ),
      );
      return scheduleLinkedDestruction(next, a, handler);
    },
  };
  const triggered: TriggerBehavior = {
    resolve(s, t) {
      const d = t.delayed,
        e = t.event;
      if (
        !d ||
        d.kind !== "linked-character-destruction" ||
        d.sourceDefinitionVersion !== version ||
        t.handler !== handler ||
        d.handler !== handler ||
        t.sourceId !== d.sourceId ||
        t.controller !== d.controller ||
        e.type !== "persistent-destroyed"
      )
        throw Error("Invalid Lovers destruction trigger");
      const index = d.targets.findIndex(
        (target) =>
          target.id === e.instanceId &&
          target.incarnation === e.previous.incarnation,
      );
      if (index < 0) throw Error("Lovers destruction does not match link");
      const other = d.targets[1 - index];
      if (
        !s.arena.includes(other.id) ||
        s.objects[other.id]?.incarnation !== other.incarnation ||
        effects.characteristics(s).get(other.id)?.cardType !== "character"
      )
        return s;
      return effects.destroy(s, d.sourceId, [other.id], d.controller);
    },
  };
  return {
    behavior,
    triggered,
    shape,
    legalTargets,
    slotCandidates(s: GameState, a: CacheAction, _slot: number) {
      return new Set(candidates(s, a.sourceId));
    },
    validate(s: GameState, id: string, c: ProgramChoices) {
      shape(c);
      if (c.targets.some((target) => !candidates(s, id).includes(target)))
        throw Error("Illegal Lovers target");
    },
    variants(
      s: GameState,
      id: string,
      _reverse: boolean,
    ): ProgramPlayVariant[] {
      return [
        {
          key: "normal",
          label: "Link two characters and give each two +1/+1 counters",
          modes: [],
          x: null,
          reversed: false,
          mainframes: null,
          targets: [
            {
              label: "Two characters",
              minimum: 2,
              maximum: 2,
              candidates: candidates(s, id),
            },
          ],
        },
      ];
    },
  };
}
