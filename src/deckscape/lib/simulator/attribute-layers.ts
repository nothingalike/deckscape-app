import type { CardCharacteristics } from "./characteristics";
import { portRegions, type PortRegion } from "./ports";
import { orderLayerEffects } from "./stat-layers";

export type AttributeEffect = {
  id: string;
  timestamp: number;
  dependsOn: readonly string[];
} & (
  | { kind: "set-ram" | "add-ram"; value: number }
  | { kind: "set-port" | "add-port"; port: PortRegion; value: number }
  | { kind: "set-attack-type"; attackType: "MF" | "BF" }
  | { kind: "swap-attack-type" }
);
function layer(effect: AttributeEffect): number {
  return effect.kind.startsWith("set-") ? 0 : 1;
}
function checked(value: number): number {
  if (!Number.isSafeInteger(value))
    throw new Error("Attribute exceeds supported integer range");
  return value;
}

/** CR v1.1 612.1g.2–3: attribute-setting effects precede modifications, using timestamp/dependency
 * order within each sublayer. This receives applicable typed effects after layers 1-5.
 * RAM costs and port levels clamp at zero after calculation (107.2b.1).
 */
export function evaluateCardAttributes(
  card: CardCharacteristics,
  effects: readonly AttributeEffect[],
): CardCharacteristics {
  if (new Set(effects.map((effect) => effect.id)).size !== effects.length)
    throw new Error("Duplicate attribute effect");
  const next = structuredClone(card);
  for (const effect of effects) {
    if (
      !effect.id ||
      !Number.isSafeInteger(effect.timestamp) ||
      effect.timestamp < 0
    )
      throw new Error("Invalid attribute effect identity");
    if ("value" in effect) checked(effect.value);
  }
  for (const index of [0, 1]) {
    const active = effects.filter((effect) => layer(effect) === index);
    if (
      new Set(active.map((effect) => effect.timestamp)).size !== active.length
    )
      throw new Error("Attribute effects need a resolved timestamp order");
    for (const effect of orderLayerEffects(active)) {
      switch (effect.kind) {
        case "set-ram":
        case "add-ram":
          if (!("ramCost" in next)) throw new Error("Object has no RAM cost");
          next.ramCost = checked(
            effect.kind === "set-ram"
              ? effect.value
              : next.ramCost + effect.value,
          );
          break;
        case "set-port":
        case "add-port":
          if (!("ports" in next) || !portRegions.includes(effect.port))
            throw new Error("Object has no applicable port");
          next.ports[effect.port] = checked(
            effect.kind === "set-port"
              ? effect.value
              : next.ports[effect.port] + effect.value,
          );
          break;
        case "set-attack-type":
          if (
            next.cardType !== "character" ||
            !["MF", "BF"].includes(effect.attackType)
          )
            throw new Error("Invalid attack type change");
          next.attackType = effect.attackType;
          break;
        case "swap-attack-type":
          if (next.cardType !== "character")
            throw new Error("Object has no attack type");
          next.attackType = next.attackType === "MF" ? "BF" : "MF";
          break;
        default:
          throw new Error("Unsupported attribute effect");
      }
    }
  }
  if ("ramCost" in next) next.ramCost = Math.max(0, next.ramCost);
  if ("ports" in next)
    for (const region of portRegions)
      next.ports[region] = Math.max(0, next.ports[region]);
  return next;
}
