import type { PortRegion } from "./ports";
import type { CharacterPlayProblem } from "./character-play-option";

export const gearPlayReasons: Record<
  CharacterPlayProblem | "attachment",
  string
> = {
  window: "No action window or priority for this play.",
  hand: "Gear is not in your hand.",
  prohibited: "Gear play is prohibited by a current effect.",
  timing: "Non-swift gear requires your empty deploy cache.",
  additionalCost: "This gear's additional cost is not supported yet.",
  synergy: "Insufficient faction synergy.",
  ram: "Not enough available refreshed RAM.",
  attachment: "No legal attachment is currently available.",
};
export interface GearHostOption {
  hostId: string;
  ports: PortRegion[];
  chain: number;
}
export interface GearPlayOption {
  id: string;
  cost: number;
  freePlays?: number;
  ram: string[];
  tether: boolean;
  hosts: GearHostOption[];
  unavailable: CharacterPlayProblem | "attachment" | null;
}
