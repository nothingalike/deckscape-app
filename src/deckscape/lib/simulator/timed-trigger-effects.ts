import { z } from "zod";
import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { PendingTrigger } from "./rule-events";
import { takeEffectTimestamp } from "./effect-timestamp";

const environmentTriggerEffectSchema = z
  .object({
    id: z.string().min(1),
    timestamp: z.number().int().nonnegative(),
    sourceId: z.string().min(1),
    expiresAfterTurn: z.number().int().positive(),
    kind: z.literal("additional-environment-trigger"),
    faction: z.string().min(1),
  })
  .strict();
export const judgementEffectSchema = environmentTriggerEffectSchema
  .omit({ kind: true, faction: true })
  .extend({
    kind: z.literal("judgement"),
    sourceDefinitionVersion: z.string().regex(/^[a-f0-9]{64}$/),
    controller: z.union([z.literal(0), z.literal(1)]),
    reversed: z.boolean(),
    handler: z.string().min(1),
  })
  .strict();
export type JudgementEffect = z.infer<typeof judgementEffectSchema>;
export const timedTriggerEffectSchema = z.union([
  environmentTriggerEffectSchema,
  judgementEffectSchema,
  environmentTriggerEffectSchema
    .omit({ kind: true, faction: true })
    .extend({
      kind: z.enum(["floor-score", "bailout"]),
      controller: z.union([z.literal(0), z.literal(1)]),
    })
    .strict(),
]);
export type TimedTriggerEffect = z.infer<typeof timedTriggerEffectSchema>;

/** This changes the rules for triggering until cleanup. It has no fixed recipient:
 * later environments qualify, and the activating source need not stay in play. */
export function addUntilTurnEndEnvironmentTrigger(
  state: GameState,
  sourceId: string,
  faction: string,
): GameState {
  if (state.outcome) throw new Error("Game already ended");
  const next = structuredClone(state),
    timestamp = takeEffectTimestamp(next);
  next.triggerEffects.push(
    timedTriggerEffectSchema.parse({
      id: `effect:${timestamp}`,
      timestamp,
      sourceId,
      expiresAfterTurn: state.turn.number,
      kind: "additional-environment-trigger",
      faction,
    }),
  );
  return next;
}

export type TriggerCharacteristics = (
  observation: GameState,
) => ReadonlyMap<string, CardCharacteristics>;

/** Called once per original trigger, using captured event-time facts. Each effect
 * adds one independent trigger; the added triggers do not recursively multiply. */
export function additionalEnvironmentTriggers(
  observation: GameState,
  trigger: PendingTrigger,
  characteristics?: TriggerCharacteristics,
): PendingTrigger[] {
  const effects = observation.triggerEffects.filter(
    (effect): effect is z.infer<typeof environmentTriggerEffectSchema> =>
      effect.kind === "additional-environment-trigger" &&
      effect.expiresAfterTurn >= observation.turn.number,
  );
  if (!effects.length) return [];
  if (!observation.environment.includes(trigger.sourceId)) return [];
  if (!("zonesAtEvent" in trigger.event) || !trigger.event.zonesAtEvent)
    throw new Error("Trigger modifier event observation unavailable");
  if (!characteristics)
    throw new Error("Trigger modifier characteristics unavailable");
  const card = characteristics(structuredClone(observation)).get(
    trigger.sourceId,
  );
  if (!card) throw new Error("Trigger source characteristics unavailable");
  if (card.cardType !== "program" || card.subtype !== "environment") return [];
  return effects
    .filter((effect) => card.factions.includes(effect.faction))
    .map(() => structuredClone(trigger));
}

export function expireTimedTriggerEffects(state: GameState): GameState {
  const next = structuredClone(state);
  next.triggerEffects = next.triggerEffects.filter(
    (effect) => effect.expiresAfterTurn > state.turn.number,
  );
  return next;
}
