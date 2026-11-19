import { createHash } from "node:crypto";
import type { GameState } from "./game-state";
import type { EvaluatedDamage } from "./damage-batch";
import type { CardCharacteristics } from "./characteristics";
import type { CounterPlacement } from "./put-counters";
import type { Seat } from "./setup";
import type { ProgramChoices } from "./program-choices";
import type { ScriptBehavior } from "./resolve-script";
import type { ProgramPlayVariant } from "./program-play-option";
import { chooseDamagePrevention } from "./counter-replacement-continuation";
import { takeEffectTimestamp } from "./effect-timestamp";
import { firewallId, amethystId } from "./firewall";

export function justice(
  canTarget: (s: GameState, source: string, player: Seat) => boolean,
) {
  const target = (c: ProgramChoices) => {
    if (
      c.targets.length ||
      c.modes.length ||
      c.reversed ||
      c.x !== null ||
      c.mainframeTarget ||
      c.cacheActionId ||
      c.runCharacters ||
      c.playerTarget === undefined
    )
      throw Error("Invalid Justice choices");
    return c.playerTarget;
  };
  const behavior: ScriptBehavior = {
    hasLegalTargets: (s, a) =>
      canTarget(s, a.sourceId, target(a.programChoices)),
    resolve(s, a) {
      const next = structuredClone(s),
        timestamp = takeEffectTimestamp(next);
      next.damagePreventions.push({
        id: `effect:${timestamp}`,
        timestamp,
        sourceId: a.sourceId,
        expiresAfterTurn: s.turn.number,
        kind: "justice",
        player: target(a.programChoices),
        controller: a.controller,
      });
      return next;
    },
  };
  return {
    behavior,
    validate(s: GameState, source: string, c: ProgramChoices) {
      if (!canTarget(s, source, target(c)))
        throw Error("Illegal Justice player target");
    },
    variants(s: GameState, source: string): ProgramPlayVariant[] {
      return [
        {
          key: "normal",
          label: "Protect a player with Justice",
          modes: [],
          targets: [],
          reversed: false,
          x: null,
          mainframes: null,
          playerTargets: ([0, 1] as const)
            .filter((p) => canTarget(s, source, p))
            .map((player) => ({
              player,
              label:
                player === s.objects[source].controller ? "You" : "Opponent",
            })),
        },
      ];
    },
  };
}

/** Justice, Firewall/Amethyst, and unlimited prevention share one affected-player
 * ordering choice. Reflected packets are noncombat and cannot recurse through Justice. */
export function applyJusticePrevention(
  s: GameState,
  packets: readonly EvaluatedDamage[],
  canPrevent: boolean,
  e: {
    characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
    hasAbility(s: GameState, id: string, handler: string): boolean;
    version(cardId: string): string | undefined;
    putCounters(
      s: GameState,
      source: string,
      p: readonly CounterPlacement[],
    ): GameState;
  },
) {
  let state = s;
  const result = structuredClone([...packets]),
    reflected: EvaluatedDamage[] = [];
  const groups = new Map<string, number[]>();
  for (const [i, p] of result.entries()) {
    if (p.recipient !== "player" || p.amount <= 0) continue;
    const key = JSON.stringify([p.sourceId, p.player, p.channel, !!p.combat]);
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  for (const [key, indices] of groups) {
    const packet = result[indices[0]];
    if (packet.recipient !== "player") continue;
    const channel = packet.channel,
      handler =
        channel === "MF" ? "protocol/firewall" : "protocol/amethyst-datashard",
      counter = channel === "MF" ? "breach" : "fracture",
      version = e.version(channel === "MF" ? firewallId : amethystId);
    const walls = state.arena.filter(
      (id) =>
        !!version &&
        state.objects[id].definitionVersion === version &&
        state.objects[id].controller === packet.player &&
        e.hasAbility(state, id, handler),
    );
    const justiceEffects =
      packet.combat &&
      e.characteristics(state).get(packet.sourceId)?.cardType === "character"
        ? state.damagePreventions.filter(
            (d) =>
              d.kind === "justice" &&
              d.player === packet.player &&
              d.expiresAfterTurn >= state.turn.number,
          )
        : [];
    const other =
      canPrevent &&
      indices.every((i) => result[i].prevented === result[i].amount);
    if (!walls.length && !justiceEffects.length) continue;
    // Earlier equivalent unlimited preventions are represented as an explicit choice.
    if (other) for (const i of indices) result[i].prevented = 0;
    while (true) {
      const available = indices.reduce(
        (sum, i) => sum + result[i].amount - result[i].prevented,
        0,
      );
      const choices = [
        ...walls,
        ...(canPrevent && available >= 2
          ? justiceEffects.map((d) => `justice:${d.id}`)
          : []),
        ...(other ? ["other-prevention"] : []),
      ];
      const options = [...new Set(choices)];
      if (!options.length || available <= 0) break;
      const fingerprint = createHash("sha256")
        .update(
          JSON.stringify({
            key,
            indices,
            result,
            options,
            justiceEffects,
            walls,
          }),
        )
        .digest("hex");
      const selected = chooseDamagePrevention(
        state,
        packet.player,
        walls[0] ?? packet.sourceId,
        fingerprint,
        options,
      );
      if (selected === "other-prevention") {
        for (const i of indices) result[i].prevented = result[i].amount;
        break;
      }
      const wall = walls.indexOf(selected);
      if (wall >= 0) {
        walls.splice(wall, 1);
        state = e.putCounters(state, selected, [
          { instanceId: selected, counter, amount: 1 },
        ]);
        if (canPrevent) {
          for (const i of indices) result[i].prevented = result[i].amount;
          break;
        }
        continue;
      }
      const index = justiceEffects.findIndex(
          (d) => `justice:${d.id}` === selected,
        ),
        effect = justiceEffects.splice(index, 1)[0];
      const prevented = Math.floor(available / 2);
      let rest = prevented;
      for (const i of indices) {
        const amount = Math.min(rest, result[i].amount - result[i].prevented);
        result[i].prevented += amount;
        rest -= amount;
      }
      const player =
        packet.sourceController ?? state.objects[packet.sourceId].controller;
      reflected.push({
        sourceId: effect.sourceId,
        sourceController: effect.controller,
        recipient: "player",
        player,
        channel: "MF",
        amount: prevented,
        prevented: 0,
      });
    }
  }
  return { state, packets: result, reflected };
}
