import { assertGameZones, type GameState } from "./game-state";
import type { Seat } from "./setup";
import type { CardCharacteristics } from "./characteristics";
import type { ProgramChoices } from "./program-choices";
import type { CacheAction } from "./priority";
import type { ScriptBehavior } from "./resolve-script";
import type { ProgramPlayVariant } from "./program-play-option";
import { isCurrentActionTarget } from "./action-targets";
import { advanceObjectIncarnation } from "./object-incarnation";
import {
  captureEventObservation,
  type EventObservation,
} from "./event-observation";

export interface RecycleRamReturnedEvent extends EventObservation {
  type: "recycle-ram-returned";
  sourceId: string;
  instanceId: string;
  player: Seat;
}
export function downloadMoreRam(effects: {
  characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
  canTarget(s: GameState, source: string, target: string): boolean;
}) {
  const shape = (c: ProgramChoices) => {
    if (
      c.modes.length ||
      c.x !== null ||
      c.reversed ||
      c.playerTarget !== undefined ||
      c.mainframeTarget !== undefined ||
      c.runCharacters !== undefined ||
      c.targets.length > 4 ||
      new Set(c.targets).size !== c.targets.length
    )
      throw Error("Invalid Download More RAM choices");
  };
  const candidates = (
    s: GameState,
    source: string,
    player = s.objects[source].controller,
  ) => {
    const current = effects.characteristics(s);
    return s.players[player].zones.recycleBin.filter(
      (id) =>
        current.get(id)?.cardType === "ram" &&
        !s.objects[id].token &&
        effects.canTarget(s, source, id),
    );
  };
  const legalTargets = (s: GameState, a: CacheAction) => {
    shape(a.programChoices!);
    const allowed = candidates(s, a.sourceId, a.controller);
    return a.programChoices!.targets.map(
      (id) => isCurrentActionTarget(s, a, id) && allowed.includes(id),
    );
  };
  const behavior: ScriptBehavior = {
    hasLegalTargets(s, a) {
      const legal = legalTargets(s, a);
      return !legal.length || legal.some(Boolean);
    },
    resolve(s, a) {
      const legal = legalTargets(s, a),
        ids = a.programChoices.targets.filter((_, i) => legal[i]);
      if (!ids.length) return s;
      const next = structuredClone(s),
        zone = next.players[a.controller].zones;
      zone.recycleBin = zone.recycleBin.filter((id) => !ids.includes(id));
      for (const id of ids) {
        advanceObjectIncarnation(next, id);
        Object.assign(next.objects[id], {
          controller: a.controller,
          running: true,
          faceDown: false,
          abilitySpent: false,
          attachments: [],
        });
        zone.ramBank.push(id);
      }
      const observation = captureEventObservation(next);
      for (const id of ids)
        next.pendingRuleEvents.push({
          type: "recycle-ram-returned",
          sourceId: a.sourceId,
          instanceId: id,
          player: a.controller,
          ...structuredClone(observation),
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
      return new Set(candidates(s, a.sourceId, a.controller));
    },
    validate(s: GameState, id: string, c: ProgramChoices) {
      shape(c);
      const allowed = candidates(s, id);
      if (c.targets.some((t) => !allowed.includes(t)))
        throw Error("Illegal recycled RAM target");
    },
    variants(
      s: GameState,
      id: string,
      _reverse: boolean,
    ): ProgramPlayVariant[] {
      return [
        {
          key: "normal",
          label: "Normal",
          modes: [],
          x: null,
          reversed: false,
          mainframes: null,
          targets: [
            {
              label: "RAM in your recycle bin",
              minimum: 0,
              maximum: 4,
              candidates: candidates(s, id),
            },
          ],
        },
      ];
    },
  };
}
