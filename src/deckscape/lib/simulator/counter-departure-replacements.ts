import { createHash } from "node:crypto";
import { z } from "zod";
import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { PersistentDeparture } from "./destruction";
import type { Seat } from "./setup";
import { captureEventObservation } from "./event-observation";
import { recordArmorReplacement } from "./game-log";

const seat = z.union([z.literal(0), z.literal(1)]);
const id = z.string().min(1);
const departure = z.discriminatedUnion("kind", [
  z
    .object({
      id,
      kind: z.literal("destroy"),
      sourceId: id.nullable(),
      destroyedBy: seat.nullable().optional(),
      reason: z.enum(["normal", "force-quit", "cost"]),
    })
    .strict(),
  z.object({ id, kind: z.literal("bin") }).strict(),
  z
    .object({
      id,
      kind: z.literal("move"),
      destination: z.enum([
        "hand",
        "recycleBin",
        "purge",
        "cyberdeck",
        "ramDeck",
      ]),
      position: z.enum(["top", "bottom"]).optional(),
      replacement: z.enum(["spirit", "zen-garden"]).optional(),
    })
    .strict(),
]);
const choice = z
  .object({ id, player: seat, replacement: z.enum(["armor", "spirit"]) })
  .strict();
export const counterDepartureTransactionSchema = z
  .object({
    version: z.literal(1),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    intents: z.array(departure),
    choices: z.array(choice),
  })
  .strict();
export type CounterDepartureTransaction = z.infer<
  typeof counterDepartureTransactionSchema
>;
type Cards = ReadonlyMap<string, CardCharacteristics>;

// Stable across JSONB key reordering. This is a stale-state guard, not a signature:
// transactions are server-owned and must never be accepted from a client's payload.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function fingerprint(state: GameState, cards: Cards): string {
  return createHash("sha256")
    .update(canonical({ state, cards: Object.fromEntries(cards) }))
    .digest("hex");
}
function counters(state: GameState, id: string) {
  const values = state.objects[id].counters;
  const armor = values.ARMOR ?? 0,
    spirit = values.SPIRIT ?? 0;
  if (![armor, spirit].every((v) => Number.isSafeInteger(v) && v >= 0))
    throw Error("Invalid replacement counter count");
  return { armor, spirit };
}
function validate(
  state: GameState,
  intents: readonly PersistentDeparture[],
  cards: Cards,
) {
  if (state.outcome || state.pendingDecision)
    throw Error("Replacement transaction unavailable");
  const inPlay = new Set([
    ...state.arena,
    ...state.environment,
    ...state.players.flatMap((p) => p.zones.ramBank),
  ]);
  if (new Set(intents.map((i) => i.id)).size !== intents.length)
    throw Error("Duplicate replacement target");
  for (const item of intents) {
    if (!inPlay.has(item.id) || !state.objects[item.id] || !cards.has(item.id))
      throw Error("Replacement target is not in play");
    if (
      item.kind === "move" &&
      ((["cyberdeck", "ramDeck"].includes(item.destination) &&
        !item.position) ||
        (item.replacement !== undefined && item.destination !== "purge"))
    )
      throw Error("Invalid replacement departure");
    if (
      state.arena.includes(item.id) &&
      cards.get(item.id)?.cardType === "character"
    )
      counters(state, item.id);
  }
}

/** Prepare only: no counters, damage, attachments or departures change while choosing.
 * The caller must pause its complete effect and retain this server-owned transaction.
 * This is not yet a GameState pendingDecision or a general replacement solver.
 */
export function beginCounterDepartures(
  state: GameState,
  intents: readonly PersistentDeparture[],
  cards: Cards,
): CounterDepartureTransaction {
  validate(state, intents, cards);
  return counterDepartureTransactionSchema.parse({
    version: 1,
    fingerprint: fingerprint(state, cards),
    intents,
    choices: [],
  });
}

export function pendingCounterReplacement(
  state: GameState,
  saved: CounterDepartureTransaction,
  cards: Cards,
) {
  const tx = counterDepartureTransactionSchema.parse(saved);
  validate(state, tx.intents, cards);
  if (tx.fingerprint !== fingerprint(state, cards))
    throw Error("Stale replacement transaction");
  const conflicts = tx.intents
    .filter((i) => {
      if (
        i.kind !== "destroy" ||
        i.reason === "cost" ||
        !state.arena.includes(i.id) ||
        cards.get(i.id)?.cardType !== "character"
      )
        return false;
      const c = counters(state, i.id);
      return c.armor > 0 && c.spirit > 0;
    })
    .sort(
      (a, b) =>
        Number(state.objects[a.id].controller !== state.turn.activePlayer) -
        Number(state.objects[b.id].controller !== state.turn.activePlayer),
    );
  if (tx.choices.length > conflicts.length)
    throw Error("Excess replacement choices");
  for (const [index, answer] of tx.choices.entries()) {
    const expected = conflicts[index];
    if (
      answer.id !== expected.id ||
      answer.player !== state.objects[expected.id].controller
    )
      throw Error("Invalid replacement choice order or controller");
  }
  const next = conflicts[tx.choices.length];
  return next
    ? {
        id: next.id,
        player: state.objects[next.id].controller,
        options: ["armor", "spirit"] as const,
      }
    : null;
}

export function chooseCounterReplacement(
  state: GameState,
  saved: CounterDepartureTransaction,
  cards: Cards,
  player: Seat,
  replacement: "armor" | "spirit",
): CounterDepartureTransaction {
  const pending = pendingCounterReplacement(state, saved, cards);
  if (
    !pending ||
    player !== pending.player ||
    !pending.options.includes(replacement)
  )
    throw Error("Replacement choice is not authorized");
  const next = counterDepartureTransactionSchema.parse(saved);
  next.choices.push({ id: pending.id, player, replacement });
  return next;
}

/** Finalize once all choices are saved. Pass the resulting departures together to
 * the ordinary departure primitive before SBAs, triggers or further instructions.
 * ARMOR consumes one counter per destruction; SPIRIT converts departure to purge.
 */
export function finishCounterDepartures(
  state: GameState,
  saved: CounterDepartureTransaction,
  cards: Cards,
): { state: GameState; departures: PersistentDeparture[] } {
  if (pendingCounterReplacement(state, saved, cards))
    throw Error("Replacement choice still pending");
  const next = structuredClone(state),
    departures: PersistentDeparture[] = [];
  for (const intent of saved.intents) {
    if (
      (intent.kind === "destroy" && intent.reason === "cost") ||
      !state.arena.includes(intent.id) ||
      cards.get(intent.id)?.cardType !== "character"
    ) {
      departures.push(structuredClone(intent));
      continue;
    }
    const { armor, spirit } = counters(state, intent.id);
    const selected = saved.choices.find((c) => c.id === intent.id)?.replacement;
    if (
      intent.kind === "destroy" &&
      armor > 0 &&
      (spirit === 0 || selected === "armor")
    ) {
      const object = next.objects[intent.id];
      if (armor === 1) delete object.counters.ARMOR;
      else object.counters.ARMOR = armor - 1;
      object.damage = { MF: 0, BF: 0 };
      object.lastDamageSourceId = null;
      object.lastDamageController = null;
      recordArmorReplacement(
        next,
        object.controller,
        object.faceDown ? "a face-down character" : cards.get(intent.id)!.name,
      );
    } else if (
      spirit > 0 &&
      !(intent.kind === "move" && intent.destination === "purge")
    )
      departures.push({
        id: intent.id,
        kind: "move",
        destination: "purge",
        replacement: "spirit",
      });
    else departures.push(structuredClone(intent));
  }
  // Observe all removals after the whole replacement batch, not one object at a time.
  const observed = captureEventObservation(next);
  for (const intent of saved.intents)
    if (
      (state.objects[intent.id].counters.ARMOR ?? 0) >
      (next.objects[intent.id].counters.ARMOR ?? 0)
    )
      next.pendingRuleEvents.push({
        type: "counters-removed",
        sourceId: intent.id,
        instanceId: intent.id,
        player: state.objects[intent.id].controller,
        counter: "ARMOR",
        amount: 1,
        ...structuredClone(observed),
      });
  return { state: next, departures };
}
