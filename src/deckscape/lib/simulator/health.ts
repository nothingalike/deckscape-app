import type { GameState } from "./game-state";
import type { Seat } from "./setup";

export interface HealthAmount {
  player: Seat;
  channel: "MF" | "BF";
  amount: number;
}
export interface HealthChange extends HealthAmount {
  operation: "gain" | "lose";
  cause: "effect" | "damage" | "payment";
}
export interface HealthChangedEvent extends HealthAmount {
  type: "health-gained" | "health-lost";
  sourceId: string;
  cause: HealthChange["cause"];
  before: number;
  after: number;
}

function pool(item: Pick<HealthAmount, "player" | "channel">) {
  if (
    (item.player !== 0 && item.player !== 1) ||
    !["MF", "BF"].includes(item.channel)
  )
    throw new Error("Invalid health recipient");
  return item.channel === "MF" ? "mainframeHealth" : "bioframeHealth";
}

/** CR 116.2–5: apply already evaluated health changes, without damage prevention or
 * outcome checks. The owning interpreter resolves replacements before this operation,
 * and performs SBAs at the required checkpoint (including after finalized damage).
 */
export function applyHealthChanges(
  state: GameState,
  sourceId: string,
  changes: readonly HealthChange[],
): GameState {
  if (state.outcome || !sourceId) throw new Error("Health change unavailable");
  const next = structuredClone(state);
  for (const change of changes) {
    const key = pool(change);
    if (
      !Number.isSafeInteger(change.amount) ||
      change.amount < 0 ||
      !["gain", "lose"].includes(change.operation) ||
      !["effect", "damage", "payment"].includes(change.cause) ||
      (change.operation === "gain" && change.cause !== "effect")
    )
      throw new Error("Invalid evaluated health change");
    const before = next.players[change.player][key];
    const after =
      before + (change.operation === "gain" ? change.amount : -change.amount);
    if (!Number.isSafeInteger(before) || !Number.isSafeInteger(after))
      throw new Error("Health total exceeds supported range");
    if (!change.amount) continue;
    next.players[change.player][key] = after;
    next.pendingRuleEvents.push({
      type: change.operation === "gain" ? "health-gained" : "health-lost",
      sourceId,
      player: change.player,
      channel: change.channel,
      amount: change.amount,
      cause: change.cause,
      before,
      after,
    });
  }
  return next;
}

/** CR 116.5: setting a total proposes the corresponding gain or loss. Feed these
 * intents through health replacements before applying them; setting is not a bypass.
 */
export function healthChangesToSetTotals(
  state: GameState,
  totals: readonly HealthAmount[],
): HealthChange[] {
  if (state.outcome) throw new Error("Game already ended");
  const seen = new Set<string>();
  return totals.map((item) => {
    const key = pool(item),
      identity = `${item.player}:${key}`;
    const before = state.players[item.player][key];
    const difference = item.amount - before;
    if (
      seen.has(identity) ||
      !Number.isSafeInteger(item.amount) ||
      !Number.isSafeInteger(before) ||
      !Number.isSafeInteger(difference)
    )
      throw new Error("Invalid health total assignment");
    seen.add(identity);
    return {
      player: item.player,
      channel: item.channel,
      amount: Math.abs(difference),
      operation: difference < 0 ? "lose" : "gain",
      cause: "effect",
    };
  });
}

/** CR 116.4: validate the entire cost against each separate pool before paying.
 * Multiple entries cannot spend the same health twice. Paying zero is always legal.
 */
export function payPlayerHealth(
  state: GameState,
  sourceId: string,
  payments: readonly HealthAmount[],
): GameState {
  const required = new Map<string, number>();
  for (const payment of payments) {
    const key = pool(payment),
      identity = `${payment.player}:${key}`;
    const total = (required.get(identity) ?? 0) + payment.amount;
    if (
      !Number.isSafeInteger(payment.amount) ||
      payment.amount < 0 ||
      !Number.isSafeInteger(total) ||
      (total > 0 && state.players[payment.player][key] < total)
    )
      throw new Error("Cannot pay health cost");
    required.set(identity, total);
  }
  return applyHealthChanges(
    state,
    sourceId,
    payments.map((payment) => ({
      ...payment,
      operation: "lose",
      cause: "payment",
    })),
  );
}

export function playersAtZeroHealth(state: GameState): Seat[] {
  return ([0, 1] as const).filter(
    (seat) =>
      state.players[seat].mainframeHealth <= 0 ||
      state.players[seat].bioframeHealth <= 0,
  );
}

/** CR 104.5/116.6/705.6c: simultaneous losses after the runtime has evaluated loss
 * replacements. The runtime may remove a prevented loss or replace the event entirely.
 */
export function applyHealthLosses(
  state: GameState,
  losingPlayers: readonly Seat[],
): GameState {
  if (state.outcome) throw new Error("Game already ended");
  const candidates = playersAtZeroHealth(state);
  if (
    new Set(losingPlayers).size !== losingPlayers.length ||
    losingPlayers.some((seat) => !candidates.includes(seat))
  )
    throw new Error("Invalid evaluated health loss");
  const next = structuredClone(state);
  if (losingPlayers.length === 2)
    next.outcome = { type: "draw", reason: "simultaneous-loss" };
  else if (losingPlayers.length === 1)
    next.outcome = {
      type: "win",
      winner: (1 - losingPlayers[0]) as Seat,
      reason: "health",
    };
  return next;
}
