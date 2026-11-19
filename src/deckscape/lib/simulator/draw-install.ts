import type { Seat } from "./setup";
import type { EventObservation } from "./event-observation";

export interface DrawInstallState {
  activePlayer: Seat;
  remainingChoices: number;
  cyberdeck: string[];
  hand: string[];
  ramDeck: string[];
  ramBank: { instanceId: string; running: boolean }[];
}
export type DrawInstallEvent =
  | ({
      type: "card-drawn";
      player: Seat;
      instanceId: string;
    } & Partial<EventObservation>)
  | ({
      type: "ram-installed";
      player: Seat;
      instanceId: string;
    } & Partial<EventObservation>)
  | { type: "empty-deck"; player: Seat; deck: "cyberdeck" | "ram-deck" };

/** CR 103.6, 501.4: later choices are made after seeing the previous result. */
export function drawInstallChoices(turnNumber: number): number {
  if (!Number.isSafeInteger(turnNumber) || turnNumber < 1)
    throw new Error("Invalid turn number");
  return turnNumber === 1 ? 1 : 2;
}

/** Base turn-based action. Caller resolves replacement/prevention effects before using this
 * transition, and dispatches returned events before offering another decision.
 * A prohibition prevents choosing; an empty deck does not (CR 118.3, 119.9).
 */
export function applyDrawInstall(
  state: DrawInstallState,
  actor: Seat,
  choice: "draw" | "install",
  restrictions: { cannotDraw: boolean; cannotInstall: boolean },
): {
  accepted: boolean;
  state: DrawInstallState;
  events: DrawInstallEvent[];
  reason?: string;
} {
  const reject = (reason: string) => ({
    accepted: false,
    state,
    events: [],
    reason,
  });
  if (actor !== state.activePlayer) return reject("not-active-player");
  if (!Number.isInteger(state.remainingChoices) || state.remainingChoices < 1)
    return reject("no-choices-remaining");
  if (choice !== "draw" && choice !== "install")
    return reject("invalid-choice");
  if (choice === "draw" ? restrictions.cannotDraw : restrictions.cannotInstall)
    return reject("prohibited-choice");
  const next = structuredClone(state);
  next.remainingChoices--;
  const instanceId =
    choice === "draw" ? next.cyberdeck.shift() : next.ramDeck.shift();
  if (instanceId === undefined)
    return {
      accepted: true,
      state: next,
      events: [
        {
          type: "empty-deck",
          player: actor,
          deck: choice === "draw" ? "cyberdeck" : "ram-deck",
        },
      ],
    };
  if (choice === "draw") next.hand.push(instanceId);
  else next.ramBank.push({ instanceId, running: false });
  return {
    accepted: true,
    state: next,
    events: [
      {
        type: choice === "draw" ? "card-drawn" : "ram-installed",
        player: actor,
        instanceId,
      },
    ],
  };
}
