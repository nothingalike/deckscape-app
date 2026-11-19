export const characterPlayReasons = {
  window: "No action window or priority for this play.",
  hand: "Character is not in your hand.",
  prohibited: "Character play is prohibited by a current effect.",
  timing: "Non-swift character requires your empty deploy cache.",
  additionalCost: "This character's additional cost is not supported yet.",
  synergy: "Insufficient faction synergy.",
  ram: "Not enough available refreshed RAM.",
} as const;
export type CharacterPlayProblem = keyof typeof characterPlayReasons;
export interface CharacterPlayOption {
  id: string;
  cost: number;
  freePlays?: number;
  ram: string[];
  runCharacters?: { count: number; candidates: string[] };
  unavailable: CharacterPlayProblem | null;
}
