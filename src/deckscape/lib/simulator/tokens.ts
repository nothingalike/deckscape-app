import type { Ports } from "./ports";

/** Printed characteristics from creating effects; CR v1.00 110.6c-d. */
export const tokenTemplates = {
  butterfly: {
    name: "Butterfly",
    attack: 0,
    defence: 1,
    attackTypes: ["MF"],
    factions: [],
    creators: ["BUTTERFLY EFFECT"],
  },
  revenant: {
    name: "Revenant",
    attack: 2,
    defence: 2,
    attackTypes: ["MF"],
    factions: [],
    creators: ["DEATH"],
  },
  dreamwalker: {
    name: "Dreamwalker",
    attack: 0,
    defence: 1,
    attackTypes: ["MF"],
    factions: [],
    creators: ["ECLIPSE", "SPIRIT GUIDE"],
  },
  drone: {
    name: "Drone",
    attack: 1,
    defence: 1,
    attackTypes: ["BF"],
    factions: ["NANOBOT"],
    creators: ["HIVE DYNAMICS", "THE HIVE"],
  },
  pawn: {
    name: "Pawn",
    attack: 0,
    defence: 1,
    attackTypes: ["MF", "BF"],
    factions: [],
    creators: ["WNDRTECH"],
  },
  bishop: {
    name: "Bishop",
    attack: 3,
    defence: 3,
    attackTypes: ["MF", "BF"],
    factions: [],
    creators: ["WNDRTECH"],
  },
  rook: {
    name: "Rook",
    attack: 5,
    defence: 5,
    attackTypes: ["MF", "BF"],
    factions: [],
    creators: ["WNDRTECH"],
  },
} as const;

export type TokenTemplateId = keyof typeof tokenTemplates;
export type AttackType = "MF" | "BF";

export interface TokenCharacteristics {
  cardType: "character";
  name: string;
  attack: number;
  defence: number;
  attackType: AttackType;
  factions: string[];
  ports: Ports;
  ramCost: number;
  requirements: Record<string, number>;
  iconic: boolean;
  abilities: string[];
}

/** Requires the creating player's choice where the printed effect offers one.
 * Returns fresh base values; ownership, zone, effects and lifecycle belong to the engine.
 * Copy effects use their source's copiable characteristics (CR 706), not this factory.
 */
export function tokenCharacteristics(
  id: TokenTemplateId,
  chosenAttackType?: AttackType,
): TokenCharacteristics {
  const template = tokenTemplates[id];
  if (!template) throw new Error(`Unknown token template: ${id}`);
  const options: readonly AttackType[] = template.attackTypes;
  if (options.length > 1 && !chosenAttackType)
    throw new Error(`${template.name} requires an attack-type choice`);
  const attackType = chosenAttackType ?? options[0];
  if (!options.includes(attackType))
    throw new Error(`Invalid attack type for ${template.name}`);
  return {
    cardType: "character",
    name: template.name,
    attack: template.attack,
    defence: template.defence,
    attackType,
    factions: [...template.factions],
    ports: { head: 0, body: 0, leftArm: 0, rightArm: 0 },
    ramCost: 0,
    requirements: {},
    iconic: false,
    abilities: [],
  };
}
