import { bindBleedCounters, type BleedCounterEffects } from "./bleed-counters";
import {
  bindCorruptionCounters,
  type CorruptionCounterEffects,
} from "./corruption-counters";
import type { RuleTriggerDiscovery } from "./rule-events";

/** Global counter rules share discovery and trigger ordering with printed card abilities. */
export function bindKeywordCounterTriggers(
  engineVersion: string,
  rulesVersion: string,
  effects: BleedCounterEffects & CorruptionCounterEffects,
) {
  const bleed = bindBleedCounters(engineVersion, rulesVersion, effects);
  const corruption = bindCorruptionCounters(
    engineVersion,
    rulesVersion,
    effects,
  );
  const ruleTriggers: RuleTriggerDiscovery = (state, event) => [
    ...bleed.ruleTriggers(state, event),
    ...corruption.ruleTriggers(state, event),
  ];
  return {
    ruleTriggers,
    triggers: new Map([...bleed.triggers, ...corruption.triggers]),
    triggerLabels: new Map([
      ...bleed.triggerLabels,
      ...corruption.triggerLabels,
    ]),
  };
}
