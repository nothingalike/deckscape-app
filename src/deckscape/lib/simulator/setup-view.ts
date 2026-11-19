import type { Seat, SetupState } from "./setup";

/** Allowlist projection: never serialize canonical state or its instance registry to a client. */
export function projectSetup(state: SetupState, userId: string) {
  const seat = state.players.findIndex((player) => player.userId === userId);
  if (seat !== 0 && seat !== 1) throw new Error("Not a match participant");
  const visibleCard = (instanceId: string) => {
    const instance = state.instances[instanceId];
    if (!instance) throw new Error("Missing card instance");
    return {
      instanceId,
      definitionVersion: instance.definitionVersion,
      owner: instance.owner,
    };
  };
  const yourDecision =
    state.decision.type !== "ready" && state.decision.seat === seat;
  return {
    revision: state.revision,
    openingRolls: state.openingRolls ?? null,
    seat: seat as Seat,
    startingPlayer: state.startingPlayer,
    decision: { ...state.decision },
    players: state.players.map((player, index) => ({
      seat: index as Seat,
      mainframe: visibleCard(player.mainframe),
      mainframeHealth: player.mainframeHealth,
      bioframeHealth: player.bioframeHealth,
      cyberdeckCount: player.cyberdeck.length,
      ramDeckCount: player.ramDeck.length,
      handCount: player.hand.length,
      ...(index === seat ? { hand: player.hand.map(visibleCard) } : {}),
    })),
    legalDecisions: !yourDecision
      ? []
      : state.decision.type === "choose-starter"
        ? [{ type: "choose-starter" as const, choices: [0, 1] as Seat[] }]
        : [
            {
              type: "mulligan" as const,
              cardIds: [...state.players[seat].hand],
            },
          ],
  };
}
