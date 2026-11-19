import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { DepartureZone } from "./destruction";

export interface TetherFollowDecision {
  type: "tether-follow";
  id: string;
  player: Seat;
  sourceId: string;
  options: { hostId: string; destination: DepartureZone }[];
}
export interface TetherFollowEvaluation {
  /** Evaluates movement replacements and, for decks, placement/order choices. */
  move(
    state: GameState,
    tetherId: string,
    hostId: string,
    destination: DepartureZone,
  ): GameState;
}

function departedOptions(state: GameState, tetherId: string) {
  const tether = state.objects[tetherId];
  if (!tether || !state.arena.includes(tetherId))
    throw new Error("Tether is not in the arena");
  const links = tether.attachments.filter((link) => link.kind === "gear");
  if (links.length !== 2 || links[0].hostId === links[1].hostId)
    throw new Error("Tether has invalid hosts");
  return links
    .filter((link) => !state.arena.includes(link.hostId))
    .map((link) => {
      const zones: DepartureZone[] = [
        "hand",
        "recycleBin",
        "purge",
        "cyberdeck",
        "ramDeck",
      ];
      const destination = zones.find((zone) =>
        state.players.some((player) =>
          player.zones[zone].includes(link.hostId),
        ),
      );
      if (!destination)
        throw new Error("Departed tether host has no supported destination");
      return { hostId: link.hostId, destination };
    });
}

/** Called for a tether identified by effective keyword evaluation, before departure events
 * are dispatched. CR 702.14a: one departed host follows automatically; two require choice.
 */
export function beginTetherFollow(
  state: GameState,
  tetherId: string,
  evaluated: TetherFollowEvaluation,
): GameState {
  if (state.outcome || state.pendingDecision)
    throw new Error("Tether following unavailable");
  const options = departedOptions(state, tetherId);
  if (!options.length) throw new Error("No tether host has departed");
  if (options.length === 1)
    return evaluated.move(
      structuredClone(state),
      tetherId,
      options[0].hostId,
      options[0].destination,
    );
  const next = structuredClone(state);
  next.pendingDecision = {
    type: "tether-follow",
    id: `tether-follow:${state.revision}:${tetherId}`,
    player: state.objects[tetherId].controller,
    sourceId: tetherId,
    options,
  };
  return next;
}

export function validateTetherContinuation(
  state: GameState,
  decision: TetherFollowDecision,
): void {
  const current = departedOptions(state, decision.sourceId);
  if (
    state.objects[decision.sourceId].controller !== decision.player ||
    decision.options.length !== 2 ||
    current.length !== 2 ||
    decision.options.some(
      (option, index) =>
        option.hostId !== current[index].hostId ||
        option.destination !== current[index].destination,
    )
  )
    throw new Error("Invalid tether follow continuation");
}

export function answerTetherFollow(
  state: GameState,
  userId: string,
  revision: number,
  decisionId: string,
  option: number,
  evaluated: TetherFollowEvaluation,
): GameState {
  const decision = state.pendingDecision;
  if (
    state.outcome ||
    state.revision !== revision ||
    decision?.type !== "tether-follow" ||
    decision.id !== decisionId
  )
    throw new Error("Tether follow decision unavailable");
  if (state.players[decision.player].userId !== userId)
    throw new Error("Not the deciding player");
  validateTetherContinuation(state, decision);
  if (
    !Number.isInteger(option) ||
    option < 0 ||
    option >= decision.options.length
  )
    throw new Error("Invalid tether follow option");
  const chosen = decision.options[option];
  const next = structuredClone(state);
  next.pendingDecision = null;
  const result = evaluated.move(
    next,
    decision.sourceId,
    chosen.hostId,
    chosen.destination,
  );
  result.revision++;
  return result;
}
