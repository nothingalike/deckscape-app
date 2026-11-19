import type { CardInspection } from "./card-inspection";
/** Public decision descriptors contain only the deciding player's available choices. */
export type DecisionPrompt =
  | import("./ducky-contract").DuckyPrompt
  | import("./tower-contract").TowerPrompt
  | import("./eclipse-contract").EclipsePrompt
  | import("./enhance-contract").EnhancePrompt
  | import("./wonderland-contract").WonderlandPrompt
  | {
      type: "damage-prevention";
      decisionId: string;
      revision: number;
      sourceId: string;
      options: string[];
    }
  | {
      type: "bailout";
      decisionId: string;
      revision: number;
      sourceId: string;
      count: number;
      ram: string[];
    }
  | {
      type: "spirit-entry";
      decisionId: string;
      revision: number;
      sourceId: string;
      name: string;
      groupIndex: number;
      totalGroups: number;
      confirmed: { id: string; player: 0 | 1; name: string }[];
      cards: (CardInspection & { id: string; eligible: true })[];
    }
  | {
      type: "copy-ability";
      decisionId: string;
      revision: number;
      sourceId: string;
      targetId: string;
      options: { index: number; label: string }[];
    }
  | {
      type: "counter-replacement";
      options?: ("armor" | "spirit" | "fan" | "decline")[];
      decisionId: string;
      revision: number;
      sourceId: string;
    }
  | {
      type: "redirect-ability";
      decisionId: string;
      revision: number;
      sourceId: string;
      targetActionId: string;
      targetAbility: string;
      targetCount: number;
      originalTargets: string[];
      originalPlayer?: 0 | 1;
      variants: import("./activation-option").ActivationVariant[];
    }
  | {
      type: "shred-transfer";
      mandatory?: true;
      decisionId: string;
      revision: number;
      sourceId: string;
      gearId: string;
      options: { index: number; links: { hostId: string; port: string }[] }[];
    }
  | {
      type: "retarget-program";
      decisionId: string;
      revision: number;
      sourceId: string;
      targetActionId: string;
      targetProgramId: string;
      objectSlots?: {
        options: {
          index: number;
          label: string;
          targetId?: string;
          card?: CardInspection;
        }[];
      }[];
      originalTargets?: string[];
      options: {
        index: number;
        label: string;
        targetId?: string;
        targetIds?: string[];
        player?: 0 | 1;
      }[];
    }
  | {
      type: "hand-choice";
      decisionId: string;
      revision: number;
      targetPlayer: 0 | 1;
      allowFail: false;
      cards: (CardInspection & { id: string; eligible: true })[];
    }
  | {
      type: "ram-cost-choice";
      decisionId: string;
      revision: number;
    }
  | {
      type: "faction-choice";
      decisionId: string;
      revision: number;
      factions: string[];
    }
  | {
      type: "trigger-choice";
      cardCount?: number;
      decisionId: string;
      revision: number;
      prompt: string;
      options: { id: string; label: string; cardId?: string }[];
    }
  | {
      type: "optional-trigger";
      decisionId: string;
      revision: number;
      prompt: string;
    }
  | {
      type: "top-cards";
      decisionId: string;
      revision: number;
      kind: "index" | "divine" | "look-bin" | "tea-party";
      allowFail: boolean;
      cards: (CardInspection & { id: string; eligible: boolean })[];
    }
  | {
      type: "trigger-target";
      cards?: (CardInspection & { id: string; eligible: boolean })[];
      decisionId: string;
      revision: number;
      sourceId: string;
      options: (
        | { index: number; characterId: string }
        | { index: number; ramId: string }
        | { index: number; programId: string }
        | { index: number; player: "you" | "opponent"; seat: 0 | 1 }
      )[];
    }
  | {
      type: "deck-search";
      decisionId: string;
      revision: number;
      allowFail: boolean;
      cards: (CardInspection & {
        id: string;
        eligible: boolean;
      })[];
    }
  | {
      type: "counter-payment";
      decisionId: string;
      revision: number;
      ramCost: number;
      ram: string[];
    }
  | {
      type: "tether-follow";
      decisionId: string;
      revision: number;
      options: { index: number; destination: string; hostId?: string }[];
    }
  | {
      type: "ram-balance";
      decisionId: string;
      revision: number;
      hosts: { hostId: string; required: number; committed: string[] }[];
      ram: { id: string; running: boolean }[];
    };
