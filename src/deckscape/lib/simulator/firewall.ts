import { createHash } from "node:crypto";
import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { EvaluatedDamage } from "./damage-batch";
import type { CounterPlacement } from "./put-counters";
import type { EventBehavior } from "./rule-events";
import { ruleEventObservationState } from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import { chooseDamagePrevention } from "./counter-replacement-continuation";
export const firewallId = "47eaaa21-e06e-456c-947a-9258157c85e4";
export const firewallHandler = "protocol/firewall";

export const amethystId = "818c13e3-3692-4c06-891c-b7b99de2bb4c";
export const firewallProtection = {
  handler: firewallHandler,
  channel: "MF",
  counter: "breach",
} as const;
export const amethystProtection = {
  handler: "protocol/amethyst-datashard",
  channel: "BF",
  counter: "fracture",
} as const;
type Protection = { handler: string; channel: "MF" | "BF"; counter: string };
interface FirewallEffects {
  characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
  hasAbility(s: GameState, id: string, handler: string): boolean;
  putCounters(
    s: GameState,
    source: string,
    placements: readonly CounterPlacement[],
  ): GameState;
}
function active(
  s: GameState,
  id: string,
  version: string | undefined,
  e: Pick<FirewallEffects, "characteristics" | "hasAbility">,
  protection: Protection,
) {
  const card = e.characteristics(s).get(id);
  return (
    !!version &&
    s.objects[id]?.definitionVersion === version &&
    s.arena.includes(id) &&
    card?.cardType === "program" &&
    card.subtype === "protocol" &&
    e.hasAbility(s, id, protection.handler)
  );
}

/** Existing unlimited prevention effects are outcome-equivalent. Firewall adds a
 * counter, so its order relative to those effects and other Firewalls must be chosen.
 * Group one source's simultaneous MF damage to one player into one occurrence. */
export function applyFirewallPrevention(
  s: GameState,
  packets: readonly EvaluatedDamage[],
  version: string | undefined,
  canPrevent: boolean,
  e: FirewallEffects,
  protection: Protection = firewallProtection,
): { state: GameState; packets: EvaluatedDamage[] } {
  let state = s;
  const result = structuredClone([...packets]);
  const groups = new Map<string, number[]>();
  for (let i = 0; i < packets.length; i++) {
    const p = packets[i];
    if (
      p.recipient !== "player" ||
      p.channel !== protection.channel ||
      p.amount <= 0
    )
      continue;
    const key = JSON.stringify([p.player, p.sourceId]);
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  for (const [group, indices] of groups) {
    const packet = result[indices[0]];
    if (packet.recipient !== "player")
      throw Error("Invalid Firewall damage group");
    const remaining = state.arena
      .filter(
        (id) =>
          state.objects[id].controller === packet.player &&
          active(state, id, version, e, protection),
      )
      .sort();
    if (!remaining.length) continue;
    // Base evaluation ran replacements, then the older equivalent unlimited preventions.
    const other =
      canPrevent &&
      indices.every((i) => result[i].prevented === result[i].amount);
    while (remaining.length) {
      const options = [...remaining, ...(other ? ["other-prevention"] : [])];
      const fingerprint = createHash("sha256")
        .update(
          JSON.stringify({
            group,
            packets,
            options,
            objects: remaining.map((id) => state.objects[id]),
          }),
        )
        .digest("hex");
      const selected = chooseDamagePrevention(
        state,
        packet.player,
        remaining[0],
        fingerprint,
        options,
      );
      if (selected === "other-prevention") break;
      remaining.splice(remaining.indexOf(selected), 1);
      state = e.putCounters(state, selected, [
        { instanceId: selected, counter: protection.counter, amount: 1 },
      ]);
      if (canPrevent) {
        for (const i of indices) result[i].prevented = result[i].amount;
        break;
      }
      // User ruling: prevention prohibition does not suppress the breach counter.
      // Each applicable Firewall applies once; the original damage remains unprevented.
    }
  }
  return { state, packets: result };
}

export function firewallTriggers(
  version: string,
  e: Pick<FirewallEffects, "characteristics" | "hasAbility"> & {
    purge(s: GameState, id: string): GameState;
  },
  protection: Protection = firewallProtection,
): { events: EventBehavior; trigger: TriggerBehavior } {
  return {
    events: {
      onEvent(s, id, event) {
        if (
          event.type !== "counters-added" ||
          event.instanceId !== id ||
          event.counter !== protection.counter ||
          event.amount < 1
        )
          return [];
        const observed = ruleEventObservationState(s, event);
        if (
          !active(observed, id, version, e, protection) ||
          (observed.objects[id].counters[protection.counter] ?? 0) < 2
        )
          return [];
        return [
          {
            sourceId: id,
            controller: observed.objects[id].controller,
            handler: protection.handler,
            event: structuredClone(event),
          },
        ];
      },
    },
    trigger: {
      resolve(s, t) {
        const event = t.event;
        if (
          t.handler !== protection.handler ||
          event.type !== "counters-added" ||
          event.instanceId !== t.sourceId ||
          event.counter !== protection.counter
        )
          throw Error("Invalid Firewall purge trigger");
        const before = ruleEventObservationState(s, event).objects[t.sourceId];
        return s.arena.includes(t.sourceId) &&
          s.objects[t.sourceId]?.incarnation === before.incarnation &&
          (s.objects[t.sourceId].counters[protection.counter] ?? 0) >= 2
          ? e.purge(s, t.sourceId)
          : s;
      },
    },
  };
}
