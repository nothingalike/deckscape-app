import { z } from "zod";
import type { GameState } from "./game-state";
import type { ActivatedAction } from "./resolve-ability";
import type { ScriptAction } from "./resolve-script";
import type { PendingTrigger, RuleEvent } from "./rule-events";
import { takeEffectTimestamp } from "./effect-timestamp";

const destroyTriggerSchema = z
  .object({
    kind: z.literal("next-turn-end-destroy"),
    id: z.string().min(1),
    timestamp: z.number().int().nonnegative(),
    createdTurn: z.number().int().positive(),
    sourceId: z.string().min(1),
    sourceDefinitionVersion: z.string().regex(/^[a-f0-9]{64}$/),
    controller: z.union([z.literal(0), z.literal(1)]),
    handler: z.string().min(1),
    targetId: z.string().min(1),
    targetIncarnation: z.number().int().nonnegative(),
  })
  .strict();
const purgeCopiesTriggerSchema = destroyTriggerSchema
  .omit({ kind: true, targetId: true, targetIncarnation: true })
  .extend({
    kind: z.literal("next-turn-end-purge-copies"),
    targets: z
      .array(
        z
          .object({
            id: z.string().min(1),
            incarnation: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.targets.map((t) => t.id)).size === value.targets.length,
    "Duplicate delayed copy target",
  );
const purgeSourceTriggerSchema = destroyTriggerSchema
  .extend({
    kind: z.literal("next-turn-end-purge-source"),
  })
  .strict();
const purgeTargetTriggerSchema = destroyTriggerSchema
  .extend({ kind: z.literal("next-turn-end-purge-target") })
  .strict();
const linkedDestructionSchema = destroyTriggerSchema
  .omit({ kind: true, targetId: true, targetIncarnation: true })
  .extend({
    kind: z.literal("linked-character-destruction"),
    targets: z
      .array(
        z
          .object({
            id: z.string().min(1),
            incarnation: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .length(2),
  })
  .strict()
  .refine(
    (v) => v.targets[0].id !== v.targets[1].id,
    "Linked characters must differ",
  );
const destroyRamTriggerSchema = destroyTriggerSchema
  .omit({ kind: true, targetId: true, targetIncarnation: true })
  .extend({
    kind: z.literal("next-turn-end-destroy-ram"),
    count: z.number().int().positive().max(512),
  })
  .strict();
const returnCharacterTriggerSchema = destroyTriggerSchema
  .extend({ kind: z.literal("next-turn-end-return-character") })
  .strict();
export const delayedTriggerSchema = z.union([
  returnCharacterTriggerSchema,
  purgeTargetTriggerSchema,
  destroyRamTriggerSchema,
  destroyTriggerSchema,
  purgeCopiesTriggerSchema,
  purgeSourceTriggerSchema,
  linkedDestructionSchema,
]);
export type DelayedTrigger = z.infer<typeof delayedTriggerSchema>;

export function scheduleActivatedTargetPurge(
  state: GameState,
  action: ActivatedAction,
  version: string,
  handler: string,
  targetId: string,
): GameState {
  const next = structuredClone(state),
    timestamp = takeEffectTimestamp(next);
  next.delayedTriggers.push(
    purgeTargetTriggerSchema.parse({
      kind: "next-turn-end-purge-target",
      id: `effect:${timestamp}`,
      timestamp,
      createdTurn: state.turn.number,
      sourceId: action.sourceId,
      sourceDefinitionVersion: version,
      controller: action.controller,
      handler,
      targetId,
      targetIncarnation: state.objects[targetId].incarnation,
    }),
  );
  return next;
}

/** Retain a script's selected object; later destruction is not another targeting event. */
export function scheduleScriptTargetDestruction(
  state: GameState,
  action: ScriptAction,
  handler: string,
  targetId: string,
): GameState {
  const next = structuredClone(state),
    timestamp = takeEffectTimestamp(next);
  next.delayedTriggers.push(
    destroyTriggerSchema.parse({
      kind: "next-turn-end-destroy",
      id: `effect:${timestamp}`,
      timestamp,
      createdTurn: state.turn.number,
      sourceId: action.sourceId,
      sourceDefinitionVersion: state.objects[action.sourceId].definitionVersion,
      controller: action.controller,
      handler,
      targetId,
      targetIncarnation: action.targetIncarnations?.[targetId],
    }),
  );
  return next;
}

/** The RAM are chosen when this instruction resolves, not when the script plays. */
export function scheduleTurnEndRamDestruction(
  state: GameState,
  action: ScriptAction,
  handler: string,
  count: number,
): GameState {
  const next = structuredClone(state),
    timestamp = takeEffectTimestamp(next);
  next.delayedTriggers.push(
    destroyRamTriggerSchema.parse({
      kind: "next-turn-end-destroy-ram",
      id: `effect:${timestamp}`,
      timestamp,
      createdTurn: state.turn.number,
      sourceId: action.sourceId,
      sourceDefinitionVersion: state.objects[action.sourceId].definitionVersion,
      controller: action.controller,
      handler,
      count,
    }),
  );
  return next;
}

/** One delayed instruction purges the group simultaneously even if its creating
 * gear has left. Retain incarnations so other objects cannot inherit the purge. */
export function scheduleCopiedTokenPurge(
  state: GameState,
  trigger: PendingTrigger,
  sourceDefinitionVersion: string,
  targets: readonly string[],
): GameState {
  const next = structuredClone(state),
    timestamp = takeEffectTimestamp(next);
  if (
    targets.some((id) => !next.objects[id]?.token || !next.arena.includes(id))
  )
    throw Error("Invalid copied-token purge targets");
  next.delayedTriggers.push(
    purgeCopiesTriggerSchema.parse({
      kind: "next-turn-end-purge-copies",
      id: `effect:${timestamp}`,
      timestamp,
      createdTurn: state.turn.number,
      sourceId: trigger.sourceId,
      sourceDefinitionVersion,
      controller: trigger.controller,
      handler: trigger.handler,
      targets: targets.map((id) => ({
        id,
        incarnation: next.objects[id].incarnation,
      })),
    }),
  );
  return next;
}

/** CR 609: source-independent, one-shot trigger. Keep the referenced incarnation
 * even if its object leaves play or a departed token is later removed. */
export function scheduleTurnEndDestruction(
  state: GameState,
  action: ActivatedAction,
): GameState {
  if (state.outcome) return state;
  const next = structuredClone(state),
    timestamp = takeEffectTimestamp(next);
  next.delayedTriggers.push(
    delayedTriggerSchema.parse({
      kind: "next-turn-end-destroy",
      id: `effect:${timestamp}`,
      timestamp,
      createdTurn: state.turn.number,
      sourceId: action.sourceId,
      sourceDefinitionVersion: action.activatedAbility.source.definitionVersion,
      controller: action.controller,
      handler: action.activatedAbility.handler,
      targetId: action.activatedAbility.source.id,
      targetIncarnation: action.activatedAbility.source.incarnation,
    }),
  );
  return next;
}

/** Retain the activated source's incarnation, even if it departs while resolving.
 * Purging is distinct from destruction and must not consume ARMOR instead. */
export function scheduleTurnEndSourcePurge(
  state: GameState,
  action: ActivatedAction,
): GameState {
  if (state.outcome) return state;
  const next = structuredClone(state),
    timestamp = takeEffectTimestamp(next);
  next.delayedTriggers.push(
    purgeSourceTriggerSchema.parse({
      kind: "next-turn-end-purge-source",
      id: `effect:${timestamp}`,
      timestamp,
      createdTurn: state.turn.number,
      sourceId: action.sourceId,
      sourceDefinitionVersion:
        action.activatedAbility.source.copiedAbility?.definitionVersion ??
        action.activatedAbility.source.definitionVersion,
      controller: action.controller,
      handler: action.activatedAbility.handler,
      targetId: action.activatedAbility.source.id,
      targetIncarnation: action.activatedAbility.source.incarnation,
    }),
  );
  return next;
}

/** The Lovers creates one source-independent delayed trigger, not a turn-long
 * continuous ability. Keep both announced incarnations even if one target failed. */
export function scheduleLinkedDestruction(
  state: GameState,
  action: ScriptAction,
  handler: string,
): GameState {
  const next = structuredClone(state),
    timestamp = takeEffectTimestamp(next);
  next.delayedTriggers.push(
    linkedDestructionSchema.parse({
      kind: "linked-character-destruction",
      id: `effect:${timestamp}`,
      timestamp,
      createdTurn: state.turn.number,
      sourceId: action.sourceId,
      sourceDefinitionVersion: state.objects[action.sourceId].definitionVersion,
      controller: action.controller,
      handler,
      targets: action.programChoices.targets.map((id) => ({
        id,
        incarnation: action.targetIncarnations?.[id],
      })),
    }),
  );
  return next;
}

/** Called once by event dispatch, separately from in-play card observers. */
export function delayedTriggersForEvent(
  state: GameState,
  event: RuleEvent,
  alreadyFired: ReadonlySet<string>,
): PendingTrigger[] {
  if (event.type !== "turn-ending" && event.type !== "persistent-destroyed")
    return [];
  return state.delayedTriggers
    .filter(
      (delay) =>
        delay.createdTurn <= state.turn.number &&
        !alreadyFired.has(delay.id) &&
        (delay.kind === "linked-character-destruction"
          ? event.type === "persistent-destroyed" &&
            delay.targets.some(
              (t) =>
                t.id === event.instanceId &&
                t.incarnation === event.previous.incarnation,
            )
          : event.type === "turn-ending"),
    )
    .map((delay) => ({
      sourceId: delay.sourceId,
      controller: delay.controller,
      handler: delay.handler,
      delayed: structuredClone(delay),
      event: structuredClone(event),
    }));
}
