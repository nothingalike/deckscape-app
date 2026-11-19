import type { CardCharacteristics } from "./characteristics";
import type { GameState } from "./game-state";
import type { PlayerGameView } from "./board-view";
import { evaluatePlayerSynergy, mainframeTierRequirements } from "./synergy";

export interface SynergyContributorGroup {
  current: number;
  cardIds: string[];
  hiddenCount: number;
}

export interface PlayerSynergyPresentation {
  seat: 0 | 1;
  mainframeId: string;
  tiers: {
    index: number;
    active: boolean;
    replaced?: boolean;
    operator: "base" | "independent" | "or" | "instead" | "plus";
    text: string;
    persistents: { current: number; required: number };
    factions: {
      faction: string;
      current: number;
      required: number;
    }[];
  }[];
  contributors: {
    persistents: SynergyContributorGroup;
    factions: Record<string, SynergyContributorGroup>;
  };
  explanations: string[];
}

/** Server-side, viewer-safe explanation over the same effective values as eligibility. */
export function projectSynergyPresentations(
  state: GameState,
  effective: ReadonlyMap<string, CardCharacteristics>,
  view: PlayerGameView,
): [PlayerSynergyPresentation, PlayerSynergyPresentation] {
  const totals = evaluatePlayerSynergy(state, effective);
  const inspectable = new Set(
    [
      ...view.arena,
      ...view.environment,
      ...view.players.flatMap((player) => [
        ...player.mainframe,
        ...player.ramBank,
      ]),
    ]
      .filter((card) => card.definitionVersion)
      .map((card) => card.instanceId),
  );
  const inPlay = [
    ...state.arena,
    ...state.environment,
    ...state.players.flatMap((player) => player.zones.ramBank),
  ];

  return ([0, 1] as const).map((seat) => {
    const mainframeId = state.players[seat].zones.mainframe[0];
    const mainframe = effective.get(mainframeId);
    if (!mainframeId || mainframe?.cardType !== "mainframe")
      throw new Error("Mainframe synergy presentation unavailable");
    const controlled = inPlay.filter(
      (id) => state.objects[id]?.controller === seat,
    );
    const permanentIds = controlled.filter(
      (id) =>
        state.rulesVersion !== "1.1" || effective.get(id)?.cardType !== "ram",
    );
    const factionNames = new Set([
      ...Object.keys(totals[seat].factions),
      ...mainframe.tiers.flatMap((tier) => Object.keys(tier.factions)),
    ]);
    const group = (ids: readonly string[]): SynergyContributorGroup => {
      const cardIds = ids.filter((id) => inspectable.has(id));
      return {
        current: ids.length,
        cardIds,
        hiddenCount: ids.length - cardIds.length,
      };
    };
    const factionGroups = Object.fromEntries(
      [...factionNames]
        .sort()
        .map((faction) => [
          faction,
          group(
            permanentIds.filter((id) =>
              effective.get(id)?.factions.includes(faction),
            ),
          ),
        ]),
    );
    const active = mainframeTierRequirements(state, mainframeId, effective);
    const permanentCurrent = permanentIds.length;
    const ramCount = controlled.filter(
      (id) => effective.get(id)?.cardType === "ram",
    ).length;
    return {
      seat,
      mainframeId,
      tiers: mainframe.tiers.map((tier, index) => ({
        index,
        active:
          active[index] &&
          !(
            mainframe.tiers[index + 1]?.operator === "instead" &&
            active[index + 1]
          ),
        ...(active[index] &&
        mainframe.tiers[index + 1]?.operator === "instead" &&
        active[index + 1]
          ? { replaced: true }
          : {}),
        operator: tier.operator,
        text: tier.text,
        persistents: {
          current: permanentCurrent,
          required: tier.persistents,
        },
        factions: Object.entries(tier.factions)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([faction, required]) => ({
            faction,
            current: totals[seat].factions[faction] ?? 0,
            required,
          })),
      })),
      contributors: {
        persistents: group(permanentIds),
        factions: factionGroups,
      },
      explanations:
        state.rulesVersion === "1.1" && ramCount
          ? [
              `${ramCount} RAM ${ramCount === 1 ? "is" : "are"} in play but does not count toward permanent thresholds in rules v1.1.`,
            ]
          : [],
    };
  }) as [PlayerSynergyPresentation, PlayerSynergyPresentation];
}
