import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { ProgramChoices } from "./program-choices";
import type { CacheAction } from "./priority";
import type { ScriptBehavior } from "./resolve-script";
import type { ProgramPlayVariant } from "./program-play-option";
import { isCurrentActionTarget } from "./action-targets";
import { isCurrentCardSource } from "./cache-source";
import { advanceObjectIncarnation } from "./object-incarnation";
import { assertGameZones } from "./game-state";
import { releaseCommittedRam } from "./ram";
import type { Seat } from "./setup";
import {
  captureEventObservation,
  type EventObservation,
} from "./event-observation";
export interface CacheProgramReturnedEvent extends EventObservation {
  type: "cache-program-returned";
  player: Seat;
  instanceId: string;
  sourceId: string;
}
export function theMagician(effects: {
  characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
  canTarget(s: GameState, source: string, id: string): boolean;
}) {
  const shape = (c: ProgramChoices) => {
    if (
      c.reversed ||
      c.targets.length !== 1 ||
      c.modes.length ||
      c.x !== null ||
      c.playerTarget !== undefined ||
      c.mainframeTarget !== undefined ||
      c.runCharacters !== undefined
    )
      throw Error("Invalid The Magician choices");
  };
  const candidates = (s: GameState, id: string) => {
    const current = effects.characteristics(s);
    return (s.priorityWindow?.stack ?? [])
      .filter((a) => a.kind === "card" && isCurrentCardSource(s, a))
      .map((a) => a.sourceId)
      .filter(
        (target) =>
          target !== id &&
          s.cache.includes(target) &&
          current.get(target)?.cardType === "program" &&
          effects.canTarget(s, id, target),
      );
  };
  const legalTargets = (s: GameState, a: CacheAction) => {
    const c = a.programChoices!;
    shape(c);
    return [
      isCurrentActionTarget(s, a, c.targets[0]) &&
        candidates(s, a.sourceId).includes(c.targets[0]),
    ];
  };
  const behavior: ScriptBehavior = {
    hasLegalTargets(s, a) {
      return legalTargets(s, a)[0];
    },
    resolve(s, a) {
      if (!legalTargets(s, a)[0]) return s;
      const id = a.programChoices.targets[0];
      const pending = s.priorityWindow!.stack.find(
        (item) => item.kind === "card" && item.sourceId === id,
      )!;
      // Moving off the cache ends this play without countering it or refunding costs.
      let next = releaseCommittedRam(structuredClone(s), id, "normal");
      next.priorityWindow!.stack = next.priorityWindow!.stack.filter(
        (item) => item.id !== pending.id,
      );
      next.cache = next.cache.filter((item) => item !== id);
      const object = next.objects[id];
      Object.assign(object, {
        controller: object.owner,
        running: false,
        abilitySpent: false,
        faceDown: false,
        attachments: [],
      });
      advanceObjectIncarnation(next, id);
      next.players[object.owner].zones.cyberdeck.unshift(id);
      next.pendingRuleEvents.push({
        type: "cache-program-returned",
        player: object.owner,
        instanceId: id,
        sourceId: a.sourceId,
        ...captureEventObservation(next),
      });
      assertGameZones(next);
      return next;
    },
  };
  return {
    behavior,
    shape,
    legalTargets,
    slotCandidates(s: GameState, a: CacheAction, _slot: number) {
      return new Set(candidates(s, a.sourceId));
    },
    validate(s: GameState, id: string, c: ProgramChoices) {
      shape(c);
      if (!candidates(s, id).includes(c.targets[0]))
        throw Error("Illegal The Magician target");
    },
    variants(
      s: GameState,
      id: string,
      _reverse: boolean,
    ): ProgramPlayVariant[] {
      return [
        {
          key: "normal",
          label: "Put a pending program on its owner's cyberdeck",
          modes: [],
          x: null,
          reversed: false,
          mainframes: null,
          targets: [
            {
              label: "Target program on the cache",
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
