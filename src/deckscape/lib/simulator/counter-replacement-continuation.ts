import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";
import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { CardCharacteristics } from "./characteristics";
import type { PersistentDeparture } from "./destruction";
import {
  beginCounterDepartures,
  chooseCounterReplacement,
  pendingCounterReplacement,
  finishCounterDepartures,
} from "./counter-departure-replacements";

const id = z.string().min(1);
const seat = z.union([z.literal(0), z.literal(1)]);
const answer = z
  .object({
    fingerprint: id,
    id,
    player: seat,
    replacement: id,
  })
  .strict();
export const counterReplacementDecisionSchema = z
  .object({
    type: z.literal("counter-replacement"),
    id,
    sourceId: id,
    player: seat,
    fingerprint: id,
    options: z
      .array(z.enum(["armor", "spirit", "fan", "decline"]))
      .min(2)
      .optional(),
    // Opaque server-only command checkpoint. Never projected into a game response.
    checkpoint: z.string().min(1).max(4_000_000),
    command: z.string().min(1).max(100_000),
    actor: seat,
    answers: z.array(answer).max(1000),
  })
  .strict();
export type CounterReplacementDecision = z.infer<
  typeof counterReplacementDecisionSchema
>;
export type CounterReplacementAnswer = z.infer<typeof answer>;
export const damagePreventionDecisionSchema =
  counterReplacementDecisionSchema.extend({
    type: z.literal("damage-prevention"),
    options: z.array(id).min(2),
  });
export type DamagePreventionDecision = z.infer<
  typeof damagePreventionDecisionSchema
>;
export class DamagePreventionPause extends Error {
  constructor(
    public state: GameState,
    public pending: { id: string; player: Seat },
    public fingerprint: string,
    public options: string[],
  ) {
    super("Damage prevention choice required");
  }
}

/** Share the deterministic command replay scope with destruction replacements so
 * a damage choice followed by an ARMOR/SPIRIT choice preserves both answers. */
export function chooseDamagePrevention(
  state: GameState,
  player: Seat,
  sourceId: string,
  fingerprint: string,
  options: string[],
): string {
  if (options.length === 1) return options[0];
  const scope = context.getStore();
  if (!scope) throw Error("Damage prevention needs a command checkpoint");
  const supplied = scope.answers[scope.cursor];
  if (!supplied)
    throw new DamagePreventionPause(
      structuredClone(state),
      { id: sourceId, player },
      fingerprint,
      options,
    );
  if (
    supplied.fingerprint !== fingerprint ||
    supplied.id !== sourceId ||
    supplied.player !== player ||
    !options.includes(supplied.replacement)
  )
    throw Error("Damage prevention replay diverged from its checkpoint");
  scope.cursor++;
  return supplied.replacement;
}
const context = new AsyncLocalStorage<{
  answers: CounterReplacementAnswer[];
  cursor: number;
}>();

export class CounterReplacementPause extends Error {
  constructor(
    public state: GameState,
    public pending: { id: string; player: Seat },
    public fingerprint: string,
    public options?: ("armor" | "spirit" | "fan" | "decline")[],
  ) {
    super("Counter replacement choice required");
  }
}

/** Command handlers are deterministic pure state transitions. Replay from a server
 * checkpoint replaces the partial state; it never applies earlier instructions to
 * the partial state again. Scope answers per synchronous execution, not per runtime.
 */
export function withCounterReplacementAnswers<T>(
  answers: CounterReplacementAnswer[],
  run: () => T,
): T {
  return context.run({ answers, cursor: 0 }, () => {
    const result = run();
    if (context.getStore()!.cursor !== answers.length)
      throw Error("Unused replacement answers");
    return result;
  });
}

export function resolveCounterDepartures(
  state: GameState,
  intents: readonly PersistentDeparture[],
  cards: ReadonlyMap<string, CardCharacteristics>,
) {
  let tx = beginCounterDepartures(state, intents, cards);
  for (;;) {
    const pending = pendingCounterReplacement(state, tx, cards);
    if (!pending) return finishCounterDepartures(state, tx, cards);
    const scope = context.getStore();
    if (!scope) throw Error("Counter replacement needs a command checkpoint");
    const supplied = scope.answers[scope.cursor];
    if (!supplied)
      throw new CounterReplacementPause(
        structuredClone(state),
        pending,
        tx.fingerprint,
      );
    if (
      supplied.fingerprint !== tx.fingerprint ||
      supplied.id !== pending.id ||
      supplied.player !== pending.player
    )
      throw Error("Replacement replay diverged from its checkpoint");
    if (supplied.replacement !== "armor" && supplied.replacement !== "spirit")
      throw Error("Invalid counter replacement answer");
    tx = chooseCounterReplacement(
      state,
      tx,
      cards,
      supplied.player,
      supplied.replacement,
    );
    scope.cursor++;
  }
}

/** Optional departure replacements share the deterministic replay checkpoint. */
export function chooseOptionalDeparture(
  state: GameState,
  id: string,
  player: Seat,
  fingerprint: string,
): boolean {
  const scope = context.getStore();
  if (!scope) throw Error("Departure replacement needs a command checkpoint");
  const supplied = scope.answers[scope.cursor];
  if (!supplied)
    throw new CounterReplacementPause(
      structuredClone(state),
      { id, player },
      fingerprint,
      ["fan", "decline"],
    );
  if (
    supplied.id !== id ||
    supplied.player !== player ||
    supplied.fingerprint !== fingerprint ||
    !["fan", "decline"].includes(supplied.replacement)
  )
    throw Error("Departure replacement replay diverged");
  scope.cursor++;
  return supplied.replacement === "fan";
}
