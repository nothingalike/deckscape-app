import { statEffectActive } from "./stat-effect-duration";
import type { CardCharacteristics } from "./characteristics";
import type { GameState } from "./game-state";

export interface StatPair {
  attack: number;
  defence: number;
}
type StatChange =
  | { operation: "set" | "add" | "multiply"; attack?: number; defence?: number }
  | { operation: "swap" };
export type StatEffect = {
  id: string;
  timestamp: number;
  /** Explicit dependencies from the typed card evaluator, not parsed prose. */
  dependsOn: readonly string[];
  layer: "7a" | "7b" | "7c" | "7d" | "7f";
} & StatChange;

function checked(value: number): number {
  if (!Number.isSafeInteger(value))
    throw new Error("Stat value exceeds supported integer range");
  return value;
}

/** CR 605/612.2. Dependency cycles use timestamp order within the cycle; dependencies
 * outside it are still respected. Timestamps must express a total order within each layer.
 */
export function orderLayerEffects<
  T extends Pick<StatEffect, "id" | "timestamp" | "dependsOn">,
>(effects: readonly T[]): T[] {
  const byId = new Map(effects.map((effect) => [effect.id, effect]));
  const reaches = (
    from: string,
    to: string,
    seen = new Set<string>(),
  ): boolean => {
    if (seen.has(from)) return false;
    seen.add(from);
    return (byId.get(from)?.dependsOn ?? []).some(
      (id) => id === to || (byId.has(id) && reaches(id, to, seen)),
    );
  };
  const pending = [...effects].sort((a, b) => a.timestamp - b.timestamp);
  const done = new Set<string>(),
    result: T[] = [];
  while (pending.length) {
    const index = pending.findIndex((effect) => {
      const component = effects.filter(
        (other) =>
          other.id === effect.id ||
          (reaches(effect.id, other.id) && reaches(other.id, effect.id)),
      );
      const members = new Set(component.map((other) => other.id));
      return component.every((other) =>
        other.dependsOn.every(
          (id) => !byId.has(id) || done.has(id) || members.has(id),
        ),
      );
    });
    if (index < 0) throw new Error("Unresolved stat dependency");
    const [effect] = pending.splice(index, 1);
    result.push(effect);
    done.add(effect.id);
  }
  return result;
}

function apply(stats: StatPair, effect: StatEffect): StatPair {
  if (effect.operation === "swap")
    return { attack: stats.defence, defence: stats.attack };
  const next = { ...stats };
  for (const key of ["attack", "defence"] as const) {
    const amount = effect[key];
    if (amount === undefined) continue;
    next[key] = checked(
      effect.operation === "set"
        ? amount
        : effect.operation === "add"
          ? stats[key] + amount
          : stats[key] * amount,
    );
  }
  return next;
}

/** CR 612.1g. Receives only currently applicable effects after duration, source-zone,
 * targeting and condition evaluation. Printed/base/current values remain distinct.
 * Undefined counters such as BLEED do not modify stats without a bound effect.
 */
export function evaluateCharacterStats(
  printed: StatPair,
  counters: Readonly<Record<string, number>>,
  effects: readonly StatEffect[],
): { printed: StatPair; base: StatPair; current: StatPair } {
  checked(printed.attack);
  checked(printed.defence);
  if (new Set(effects.map((effect) => effect.id)).size !== effects.length)
    throw new Error("Duplicate stat effect ID");
  for (const effect of effects) {
    if (
      !effect.id ||
      !Number.isSafeInteger(effect.timestamp) ||
      effect.timestamp < 0
    )
      throw new Error("Invalid stat effect identity");
    const expected =
      effect.layer === "7a" || effect.layer === "7c"
        ? ["set"]
        : effect.layer === "7f"
          ? ["swap"]
          : effect.layer === "7b"
            ? ["add", "multiply", "swap"]
            : effect.layer === "7d"
              ? ["add", "multiply"]
              : [];
    if (!expected.includes(effect.operation))
      throw new Error("Stat operation is invalid for its layer");
    if (effect.operation !== "swap") {
      if (effect.attack === undefined && effect.defence === undefined)
        throw new Error("Empty stat change");
      if (effect.attack !== undefined) checked(effect.attack);
      if (effect.defence !== undefined) checked(effect.defence);
    }
  }
  let current = { ...printed },
    base = { ...printed };
  for (const layer of ["7a", "7b", "7c", "7d", "7e", "7f"] as const) {
    if (layer === "7e") {
      const plus = counters["+1/+1"] ?? 0,
        minus = counters["-1/-1"] ?? 0;
      if (checked(plus) < 0 || checked(minus) < 0)
        throw new Error("Negative counter count");
      current = {
        attack: checked(current.attack + plus - minus),
        defence: checked(current.defence + plus - minus),
      };
    } else {
      const active = effects.filter((effect) => effect.layer === layer);
      if (
        new Set(active.map((effect) => effect.timestamp)).size !== active.length
      )
        throw new Error("Stat effects need a resolved timestamp order");
      for (const effect of orderLayerEffects(active))
        current = apply(current, effect);
      if (layer === "7b") base = { ...current };
    }
  }
  return { printed: { ...printed }, base, current };
}

/** Produces the same per-instance characteristic map consumed by combat and SBA evaluators.
 * Layers 1-6 must already be applied by the owning runtime before this final stat layer.
 */
export function applyCharacterStatLayers(
  state: GameState,
  characteristics: ReadonlyMap<string, CardCharacteristics>,
  effects: ReadonlyMap<string, readonly StatEffect[]>,
): Map<string, CardCharacteristics> {
  const result = new Map<string, CardCharacteristics>();
  for (const [id, card] of characteristics) {
    const object = state.objects[id];
    if (!object) throw new Error("Missing stat-layer object");
    const next = structuredClone(card);
    const active = state.statEffects
      .filter(
        (item) =>
          (item.targetId === id ||
            (item.targetId === null &&
              item.faction !== undefined &&
              card.cardType === "character" &&
              card.factions.includes(item.faction) &&
              state.arena.includes(id))) &&
          statEffectActive(state, item),
      )
      .map((item) => item.effect);
    if (next.cardType === "character")
      Object.assign(
        next,
        evaluateCharacterStats(next, object.counters, [
          ...active,
          ...(effects.get(id) ?? []),
        ]).current,
      );
    else if (effects.get(id)?.length)
      throw new Error("Stat effect targets a non-character");
    result.set(id, next);
  }
  for (const id of effects.keys())
    if (!result.has(id)) throw new Error("Missing stat effect target");
  return result;
}
