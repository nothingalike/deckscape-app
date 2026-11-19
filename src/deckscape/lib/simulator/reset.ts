import { assertGameZones, type GameState } from "./game-state";
import { expireTimedStatEffects } from "./timed-stat-effects";
import { expireTimedCombatEffects } from "./timed-combat-effects";
import { expireTimedTriggerEffects } from "./timed-trigger-effects";
import { expireTimedDamagePrevention } from "./timed-damage-prevention";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";

export interface EndTurnEvent {
  type: "combat-ended" | "turn-ending";
  player: Seat;
  observers?: import("./game-state").GameObject[];
}
function requireSettled(state: GameState): void {
  if (
    state.outcome ||
    state.cache.length ||
    state.priorityWindow ||
    state.pendingRuleEvents.length ||
    state.pendingTriggers.length
  )
    throw new Error("End-step effects are pending or game has ended");
}

/** Called after damage events and all state-based actions have finished. */
export function beginCombatEnd(state: GameState): GameState {
  requireSettled(state);
  if (state.turn.step !== "combat" || state.combat?.stage !== "damage-applied")
    throw new Error("Combat damage has not finished");
  const next = structuredClone(state);
  next.combat!.stage = "end";
  next.pendingRuleEvents.push({
    type: "combat-ended",
    player: state.turn.activePlayer,
  });
  return next;
}

export function enterReset(state: GameState): GameState {
  requireSettled(state);
  if (state.turn.step !== "combat" || state.combat?.stage !== "end")
    throw new Error("Combat end has not finished");
  const next = structuredClone(state);
  next.combat = null;
  next.turn.step = "reset";
  next.pendingRuleEvents.push({
    type: "turn-ending",
    player: state.turn.activePlayer,
  });
  return next;
}

/** CR 505.3-4: clear character damage after end triggers, then expire turn effects. */
export function performResetCleanup(
  state: GameState,
  characteristics: ReadonlyMap<string, CardCharacteristics>,
  expireTurnEffects: (state: GameState) => GameState,
): GameState {
  requireSettled(state);
  if (state.turn.step !== "reset" || state.turn.resetComplete)
    throw new Error("Reset cleanup is not pending");
  let next = structuredClone(state);
  for (const id of state.arena) {
    const card = characteristics.get(id);
    if (!card) throw new Error(`Missing reset characteristics for ${id}`);
    if (card.cardType === "character") {
      next.objects[id].damage = { MF: 0, BF: 0 };
      next.objects[id].lastDamageSourceId = null;
      delete next.objects[id].lastDamageController;
    }
  }
  next = expireTurnEffects(
    expireTimedTriggerEffects(
      expireTimedDamagePrevention(
        expireTimedCombatEffects(expireTimedStatEffects(next)),
      ),
    ),
  );
  next.programReplayPermissions = next.programReplayPermissions.filter(
    (p) => p.expiresAfterTurn > state.turn.number,
  );
  if (next.effectUses)
    next.effectUses = next.effectUses.filter(
      (use) => use.turn > state.turn.number,
    );
  next.turn.resetComplete = true;
  if (next.timedControl)
    next.timedControl = next.timedControl.filter(
      (e) => e.expiresAfterTurn > state.turn.number,
    );
  assertGameZones(next);
  return next;
}

/** Extra turns are a stack (CR 500.5) and do not consume the next regular turn. */
export function beginNextTurn(state: GameState): GameState {
  requireSettled(state);
  if (state.turn.step !== "reset" || !state.turn.resetComplete)
    throw new Error("Reset has not finished");
  if (!Number.isSafeInteger(state.turn.number + 1))
    throw new Error("Turn number exceeds supported range");
  const next = structuredClone(state);
  const extra = next.extraTurns.pop();
  next.turn.activePlayer = extra ?? next.turn.nextRegularPlayer;
  if (extra === undefined)
    next.turn.nextRegularPlayer = (1 - next.turn.activePlayer) as Seat;
  next.turn.number++;
  next.programHistory = [];
  next.cardPlayHistory = [];
  next.turn.step = "system-check";
  next.turn.systemCheckComplete = false;
  next.turn.forceQuitComplete = false;
  next.turn.resetComplete = false;
  next.drawInstallRemaining = 0;
  next.triggerOrderStart = 0;
  return next;
}
