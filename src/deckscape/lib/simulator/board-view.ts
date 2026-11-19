import type { projectGame } from "./game-view";

/** This module consumes a participant projection, never a canonical GameState. */
export type PlayerGameView = ReturnType<typeof projectGame>;
export type VisibleBoardCard = PlayerGameView["arena"][number];
export interface CardEffectPresentation {
  label: string;
  duration: "until-end-of-turn" | "while-source-in-play";
}
export interface CardPresentation {
  name: string;
  artworkUrl?: string;
  /** Client-only illustration treatment; not official printed card artwork. */
  customTokenArtwork?: boolean;
  rulesText: string;
  /** Effective values supplied by the authoritative evaluator, not calculated by the UI. */
  attack?: number;
  defence?: number;
  attackType?: "MF" | "BF";
  /** Active effects supplied from canonical retained state, never inferred from rules text. */
  effects?: CardEffectPresentation[];
}
export interface BoardZone {
  id: string;
  label: string;
  cards: VisibleBoardCard[];
  hiddenCount?: number;
}

export function boardZones(
  view: PlayerGameView,
  playerNames?: readonly [string, string],
): BoardZone[] {
  const zones: BoardZone[] = [];
  const side = (seat: 0 | 1) => {
    const player = view.players.find((p) => p.seat === seat);
    if (!player) throw new Error("Missing participant view");
    const label =
      playerNames?.[seat] ?? (seat === view.seat ? "Your" : "Opponent’s");
    zones.push(
      {
        id: `${seat}:mainframe`,
        label: `${label} mainframe`,
        cards: player.mainframe,
      },
      { id: `${seat}:ram`, label: `${label} RAM bank`, cards: player.ramBank },
      {
        id: `${seat}:arena`,
        label: `${label} arena`,
        cards: view.arena.filter((card) => card.controller === seat),
      },
      {
        id: `${seat}:hand`,
        label: `${label} hand`,
        cards:
          seat === view.seat
            ? (player.hand ?? [])
            : (player.revealedHand ?? []),
        hiddenCount:
          seat === view.seat || player.revealedHand
            ? undefined
            : player.handCount,
      },
      {
        id: `${seat}:cyberdeck`,
        label: `${label} cyberdeck`,
        cards:
          seat === view.seat && player.cyberdeckTop
            ? [player.cyberdeckTop]
            : [],
        hiddenCount: player.cyberdeckCount,
      },
      {
        id: `${seat}:ramdeck`,
        label: `${label} RAM deck`,
        cards: [],
        hiddenCount: player.ramDeckCount,
      },
      {
        id: `${seat}:recycle`,
        label: `${label} recycle bin`,
        cards: player.recycleBin,
      },
      { id: `${seat}:purge`, label: `${label} purge`, cards: player.purge },
    );
  };
  side(view.seat === 0 ? 1 : 0);
  zones.push({
    id: "environment",
    label: "Environment",
    cards: view.environment,
  });
  zones.push({ id: "cache", label: "Cache", cards: view.cache });
  side(view.seat);
  return zones;
}

/** Even an accidentally overbroad presentation map cannot reveal an uninspectable card. */
export function presentationFor(
  card: VisibleBoardCard,
  presentations: Readonly<Record<string, CardPresentation>>,
): CardPresentation {
  if (!card.definitionVersion) return { name: "Face-down card", rulesText: "" };
  const details = presentations[card.instanceId] ?? {
    name: "Card details unavailable",
    rulesText: "",
  };
  // Only supplement visible tokens without existing artwork. Copied characters
  // retain their source art; this never modifies pinned token definitions.
  const tokenArtwork: Readonly<Record<string, string>> = {
    Butterfly: "/simulator/tokens/butterfly-v1.webp",
    Revenant: "/simulator/tokens/revenant-v1.webp",
    Dreamwalker: "/simulator/tokens/dreamwalker-v1.webp",
    Drone: "/simulator/tokens/drone-v1.webp",
    Pawn: "/simulator/tokens/pawn-v1.webp",
    Bishop: "/simulator/tokens/bishop-v1.webp",
    Rook: "/simulator/tokens/rook-v1.webp",
  };
  const artworkUrl =
    card.token &&
    !details.artworkUrl &&
    Object.hasOwn(tokenArtwork, details.name)
      ? tokenArtwork[details.name]
      : undefined;
  return artworkUrl
    ? { ...details, artworkUrl, customTokenArtwork: true }
    : details;
}

export const BOARD_WIDTH = 1040;
export const CARD_WIDTH = 108;
export const CARD_HEIGHT = 154;
export function layoutBoard(zones: readonly BoardZone[]) {
  let y = 12;
  const rows = zones.map((zone) => {
    const top = y;
    const height = zone.cards.length
      ? 38 + Math.ceil(zone.cards.length / 8) * (CARD_HEIGHT + 12)
      : 48;
    y += height + 12;
    return {
      zone,
      y: top,
      height,
      cards: zone.cards.map((card, index) => ({
        card,
        x: 20 + (index % 8) * 125,
        y: top + 30 + Math.floor(index / 8) * (CARD_HEIGHT + 12),
      })),
    };
  });
  return { rows, height: y };
}
