import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { CardCharacteristics } from "./characteristics";
const player = (s: Seat) => `Player ${s + 1}`;

export function ensureGameLog(state: GameState) {
  return (state.gameLog ??= {
    entries: [],
    pendingRecorded: 0,
    position: "",
    outcomeRecorded: false,
  });
}
export function appendGameLog(
  state: GameState,
  message: string,
  privateDetail?: { player: Seat; message: string },
) {
  const log = ensureGameLog(state);
  log.entries.push({
    id: log.entries.length + 1,
    turn: state.turn.number,
    step: state.turn.step,
    message,
    ...(privateDetail ? { privateDetail } : {}),
  });
}

/** Only public in-play recipients and source names enter the saved log. */
export function recordPsychosisGrant(
  state: GameState,
  sourceId: string,
  targetId: string,
  amount: number,
  duration: "turn" | "in-play",
  current: ReadonlyMap<string, CardCharacteristics>,
) {
  const name = (id: string) =>
    state.objects[id]?.faceDown
      ? "a face-down card"
      : (current.get(id)?.name ?? "a card");
  appendGameLog(
    state,
    name(sourceId) +
      " gives " +
      player(state.objects[targetId].controller) +
      "'s " +
      name(targetId) +
      " +" +
      amount +
      " PSYCHOSIS " +
      (duration === "turn"
        ? "until end of turn."
        : "while the source remains in play."),
  );
}
