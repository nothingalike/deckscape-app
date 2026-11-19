import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import {
  ruleEventObservationState,
  type RuleTriggerDiscovery,
  type PendingTrigger,
} from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import type { CounterPlacement } from "./put-counters";

export const bleedCounterHandler = "rules/bleed-netcheck-v1";
export interface BleedCounterEffects {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  putCounters(
    state: GameState,
    sourceId: string,
    placements: readonly CounterPlacement[],
  ): GameState;
}

/** CR 703.2: the character carrying BLEED is the source, regardless of who placed it. */
export function bindBleedCounters(
  engineVersion: string,
  rulesVersion: string,
  effects: BleedCounterEffects,
) {
  if (!engineVersion || !["1.00", "1.1"].includes(rulesVersion))
    throw new Error("Unsupported BLEED rules binding");
  const checkVersion = (state: GameState) => {
    if (
      state.engineVersion !== engineVersion ||
      state.rulesVersion !== rulesVersion
    )
      throw new Error("BLEED runtime version mismatch");
  };
  const observed = (state: GameState, event: PendingTrigger["event"]) => {
    if (
      event.type !== "netcheck-started" ||
      !event.observers ||
      !event.zonesAtEvent ||
      !event.statEffectsBefore
    )
      throw new Error("BLEED needs captured NETCHECK facts");
    return ruleEventObservationState(state, event);
  };
  const ruleTriggers: RuleTriggerDiscovery = (state, event) => {
    checkVersion(state);
    if (event.type !== "netcheck-started") return [];
    const snapshot = observed(state, event),
      current = effects.characteristics(structuredClone(snapshot));
    return snapshot.arena.flatMap((id) => {
      const object = snapshot.objects[id];
      return object.controller === event.player &&
        (object.counters.BLEED ?? 0) > 0 &&
        current.get(id)?.cardType === "character"
        ? [
            {
              sourceId: id,
              controller: object.controller,
              handler: bleedCounterHandler,
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
        trigger.handler !== bleedCounterHandler ||
        !source ||
        !snapshot.arena.includes(source.id) ||
        source.controller !== trigger.controller ||
        trigger.event.player !== trigger.controller ||
        (source.counters.BLEED ?? 0) <= 0 ||
        effects.characteristics(snapshot).get(source.id)?.cardType !==
          "character"
      )
        throw new Error("Invalid BLEED trigger");
      const current = effects.characteristics(structuredClone(state));
      if (
        !state.arena.includes(source.id) ||
        state.objects[source.id]?.incarnation !== source.incarnation ||
        current.get(source.id)?.cardType !== "character"
      )
        return state;
      const amount = state.objects[source.id].counters.BLEED ?? 0;
      return amount
        ? effects.putCounters(state, source.id, [
            { instanceId: source.id, counter: "-1/-1", amount },
          ])
        : state;
    },
  };
  return {
    ruleTriggers,
    triggers: new Map([[bleedCounterHandler, behavior]]),
    triggerLabels: new Map([
      [
        bleedCounterHandler,
        "BLEED: add -1/-1 counters equal to this character's BLEED counters.",
      ],
    ]),
  };
}
