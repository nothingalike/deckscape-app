import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { CombatDamagePacket } from "./combat-damage";
import {
  ruleEventObservationState,
  type PendingTrigger,
  type RuleTriggerDiscovery,
} from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";

export const corruptionCounterHandler = "rules/corruption-netcheck-v1";
export interface CorruptionCounterEffects {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  /** Evaluate current damage replacements/prevention, then apply this one cumulative instance. */
  damage(state: GameState, packets: readonly CombatDamagePacket[]): GameState;
}

/** CR 703.1: CORRUPTION damages the mainframe's owner on that owner's NETCHECK. */
export function bindCorruptionCounters(
  engineVersion: string,
  rulesVersion: string,
  effects: CorruptionCounterEffects,
) {
  if (!engineVersion || !["1.00", "1.1"].includes(rulesVersion))
    throw new Error("Unsupported CORRUPTION rules binding");
  const checkVersion = (state: GameState) => {
    if (
      state.engineVersion !== engineVersion ||
      state.rulesVersion !== rulesVersion
    )
      throw new Error("CORRUPTION runtime version mismatch");
  };
  const observed = (state: GameState, event: PendingTrigger["event"]) => {
    if (
      event.type !== "netcheck-started" ||
      !event.observers ||
      !event.zonesAtEvent ||
      !event.statEffectsBefore
    )
      throw new Error("CORRUPTION needs captured NETCHECK facts");
    return ruleEventObservationState(state, event);
  };
  const ruleTriggers: RuleTriggerDiscovery = (state, event) => {
    checkVersion(state);
    if (event.type !== "netcheck-started") return [];
    const snapshot = observed(state, event),
      current = effects.characteristics(structuredClone(snapshot));
    return snapshot.players[event.player].zones.mainframe.flatMap((id) => {
      const object = snapshot.objects[id];
      return object.owner === event.player &&
        (object.counters.CORRUPTION ?? 0) > 0 &&
        current.get(id)?.cardType === "mainframe"
        ? [
            {
              sourceId: id,
              controller: object.controller,
              handler: corruptionCounterHandler,
              event: structuredClone(event),
            },
          ]
        : [];
    });
  };
  const behavior: TriggerBehavior = {
    resolve(state, trigger) {
      checkVersion(state);
      const snapshot = observed(state, trigger.event),
        source = snapshot.objects[trigger.sourceId];
      if (
        trigger.handler !== corruptionCounterHandler ||
        !source ||
        source.controller !== trigger.controller ||
        trigger.event.player !== source.owner ||
        !snapshot.players[source.owner].zones.mainframe.includes(source.id) ||
        (source.counters.CORRUPTION ?? 0) <= 0 ||
        effects.characteristics(snapshot).get(source.id)?.cardType !==
          "mainframe"
      )
        throw new Error("Invalid CORRUPTION trigger");
      if (
        !state.players[source.owner].zones.mainframe.includes(source.id) ||
        state.objects[source.id]?.incarnation !== source.incarnation ||
        effects.characteristics(structuredClone(state)).get(source.id)
          ?.cardType !== "mainframe"
      )
        return state;
      const amount = state.objects[source.id].counters.CORRUPTION ?? 0;
      return amount
        ? effects.damage(state, [
            {
              sourceId: source.id,
              recipient: "player",
              player: source.owner,
              channel: "MF",
              amount,
            },
          ])
        : state;
    },
  };
  return {
    ruleTriggers,
    triggers: new Map([[corruptionCounterHandler, behavior]]),
    triggerLabels: new Map([
      [
        corruptionCounterHandler,
        "CORRUPTION: take MF damage equal to the counters on your mainframe.",
      ],
    ]),
  };
}
