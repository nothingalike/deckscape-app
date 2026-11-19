import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { PersistentDeparture } from "./destruction";
import type { PendingTrigger } from "./rule-events";
import { ruleEventObservationState } from "./rule-events";
import type { CounterPlacement } from "./put-counters";
import type { EvaluatedDamage } from "./damage-batch";
export const zenGardenId = "aedb4478-6bff-4efc-8f13-8795dd125062";
export function zenGardenActive(
  s: GameState,
  id: string,
  version: string | undefined,
  current: ReadonlyMap<string, CardCharacteristics>,
  hasAbility: (s: GameState, id: string) => boolean,
) {
  const c = current.get(id);
  return (
    !!version &&
    s.objects[id]?.definitionVersion === version &&
    s.environment.includes(id) &&
    c?.cardType === "program" &&
    c.subtype === "environment" &&
    hasAbility(s, id)
  );
}
export function replaceZenGardenDeparture(
  s: GameState,
  intents: readonly PersistentDeparture[],
  version: string | undefined,
  current: ReadonlyMap<string, CardCharacteristics>,
  hasAbility: (s: GameState, id: string) => boolean,
): PersistentDeparture[] {
  return intents.map((intent) =>
    zenGardenActive(s, intent.id, version, current, hasAbility) &&
    !(intent.kind === "move" && intent.destination === "purge")
      ? {
          id: intent.id,
          kind: "move",
          destination: "purge",
          replacement: "zen-garden",
        }
      : structuredClone(intent),
  );
}
export function applyZenGardenPrevention(
  s: GameState,
  packets: readonly EvaluatedDamage[],
  version: string | undefined,
  current: ReadonlyMap<string, CardCharacteristics>,
  hasAbility: (s: GameState, id: string) => boolean,
  canPrevent: boolean,
): EvaluatedDamage[] {
  const active =
    canPrevent &&
    s.environment.some((id) =>
      zenGardenActive(s, id, version, current, hasAbility),
    );
  return packets.map((p) =>
    active ? { ...p, prevented: p.amount } : { ...p },
  );
}
export function zenGardenNetcheck(
  s: GameState,
  t: PendingTrigger,
  effects: {
    putCounters(
      s: GameState,
      source: string,
      placements: readonly CounterPlacement[],
    ): GameState;
    destroy(s: GameState, source: string, target: string): GameState;
  },
) {
  const original = ruleEventObservationState(s, t.event).objects[t.sourceId];
  if (
    !s.environment.includes(t.sourceId) ||
    s.objects[t.sourceId]?.incarnation !== original.incarnation
  )
    return s;
  const next = effects.putCounters(s, t.sourceId, [
    { instanceId: t.sourceId, counter: "anicca", amount: 1 },
  ]);
  return (next.objects[t.sourceId].counters.anicca ?? 0) >= 5
    ? effects.destroy(next, t.sourceId, t.sourceId)
    : next;
}
