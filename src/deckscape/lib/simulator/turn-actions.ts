import { applyDrawInstall, drawInstallChoices } from "./draw-install";
import { advanceObjectIncarnation } from "./object-incarnation";
import { assertGameZones, type GameState } from "./game-state";
import { captureEventObservation } from "./event-observation";

/** Called after refresh and its effects finish, never directly from a client command. */
export function enterDrawInstall(state: GameState): GameState {
  if (
    state.outcome ||
    state.turn.step !== "refresh" ||
    state.cache.length ||
    state.pendingRuleEvents.length ||
    state.pendingTriggers.length ||
    state.priorityWindow
  )
    throw new Error("Refresh must finish before draw/install");
  const next = structuredClone(state);
  next.turn.step = "draw-install";
  next.drawInstallRemaining = drawInstallChoices(next.turn.number);
  return next;
}

/** Restrictions are evaluated by the server rules interpreter, not supplied by the player.
 * Pending events deliberately prevent another choice until triggered effects are handled.
 */
export function chooseDrawInstall(
  state: GameState,
  userId: string,
  expectedRevision: number,
  choice: "draw" | "install",
  restrictions: { cannotDraw: boolean; cannotInstall: boolean },
): { accepted: boolean; state: GameState; reason?: string } {
  const reject = (reason: string) => ({ accepted: false, state, reason });
  if (state.outcome) return reject("game-ended");
  if (expectedRevision !== state.revision) return reject("stale-revision");
  const seat = state.players.findIndex((player) => player.userId === userId);
  if (seat !== 0 && seat !== 1) return reject("not-a-participant");
  if (state.turn.step !== "draw-install") return reject("wrong-step");
  if (
    state.cache.length ||
    state.pendingRuleEvents.length ||
    state.pendingTriggers.length ||
    state.priorityWindow
  )
    return reject("effects-pending");
  const zones = state.players[state.turn.activePlayer].zones;
  const result = applyDrawInstall(
    {
      activePlayer: state.turn.activePlayer,
      remainingChoices: state.drawInstallRemaining,
      cyberdeck: zones.cyberdeck,
      hand: zones.hand,
      ramDeck: zones.ramDeck,
      ramBank: zones.ramBank.map((instanceId) => ({
        instanceId,
        running: state.objects[instanceId].running,
      })),
    },
    seat,
    choice,
    restrictions,
  );
  if (!result.accepted) return reject(result.reason ?? "invalid-choice");
  const next = structuredClone(state);
  const updated = next.players[seat].zones;
  updated.cyberdeck = result.state.cyberdeck;
  updated.hand = result.state.hand;
  updated.ramDeck = result.state.ramDeck;
  updated.ramBank = result.state.ramBank.map((card) => card.instanceId);
  for (const event of result.events) {
    if ("instanceId" in event) advanceObjectIncarnation(next, event.instanceId);
    if (event.type === "ram-installed") {
      const object = next.objects[event.instanceId];
      object.running = false;
      object.faceDown = false;
      object.controller = seat;
    }
  }
  next.drawInstallRemaining = result.state.remainingChoices;
  next.pendingRuleEvents.push(
    ...result.events.map((event) =>
      event.type === "empty-deck"
        ? event
        : { ...event, ...captureEventObservation(next) },
    ),
  );
  next.revision++;
  assertGameZones(next);
  return { accepted: true, state: next };
}

/** Dispatcher calls this after the final draw/install event and cache have resolved. */
export function finishDrawInstall(state: GameState): GameState {
  if (
    state.outcome ||
    state.turn.step !== "draw-install" ||
    state.drawInstallRemaining !== 0 ||
    state.pendingRuleEvents.length ||
    state.pendingTriggers.length ||
    state.cache.length ||
    state.priorityWindow
  )
    throw new Error("Draw/install is not finished");
  const next = structuredClone(state);
  next.turn.step = "force-quit";
  return next;
}
