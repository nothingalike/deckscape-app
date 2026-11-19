import { duckyDecisionSchema } from "./ducky-contract";
import { validateDucky } from "./rubber-ducky";
import { towerDecisionSchema } from "./tower-contract";
import { validateTower } from "./the-tower";
import { eclipseDecisionSchema } from "./eclipse-contract";
import { validateEclipse } from "./eclipse-dropship";
import { enhanceDecisionSchema } from "./enhance-contract";
import { validateEnhance } from "./enhance";
import { validateWonderland } from "./wonderland";
import { bailoutDecisionSchema, validateBailoutDecision } from "./bailout";
import { judgementEffectSchema } from "./timed-trigger-effects";
import { timedControlSchema } from "./timed-control";
import { validateRamCostChoiceContinuation } from "./ram-cost-choice";
import { validateTriggerChoiceContinuation } from "./trigger-choice";
import { statEffectActive } from "./stat-effect-duration";
import { validateRetargetChoiceContinuation } from "./retarget-choice";
import { validateSpiritEntryContinuation } from "./spirit-entry-choice";
import { validateRedirectDecision } from "./redirect-ability";
import { validateShredDecision } from "./metal-head";
import { savedGameLogSchema } from "./game-log";
import { z } from "zod";
import {
  cardPlayRecordSchema,
  validateCardPlayHistory,
} from "./card-play-history";
import {
  programPlayRecordSchema,
  validateProgramHistory,
} from "./program-history";
import { validateOptionalTriggerContinuation } from "./optional-trigger";
import { validateFactionChoiceContinuation } from "./faction-choice";
import { validateHandChoiceContinuation } from "./hand-choice";
import { timedStatEffectSchema } from "./timed-stat-effects";
import { timedCombatEffectSchema } from "./timed-combat-effects";
import { timedTriggerEffectSchema } from "./timed-trigger-effects";
import { timedDamagePreventionSchema } from "./timed-damage-prevention";
import { delayedTriggerSchema } from "./delayed-triggers";
import { destructionProtectionSchema } from "./destruction-protection";
import { psychosisImmunitySchema } from "./psychosis-immunity";
import {
  resolutionContinuationSchema,
  validateResolutionContinuation,
} from "./resolution-continuation";
import { evaluateCharacterStats } from "./stat-layers";
import { validateRamBalanceContinuation } from "./ram-balance";
import {
  copyAbilityDecisionSchema,
  validateCopyAbilityDecision,
} from "./script-kiddie";
import {
  damagePreventionDecisionSchema,
  counterReplacementDecisionSchema,
} from "./counter-replacement-continuation";
import { gameCommandSchema } from "./commands";
import { validateTetherContinuation } from "./tether-follow";
import { assertGameZones, type GameState } from "./game-state";
import type { RuleEvent } from "./rule-events";
import { programChoicesSchema } from "./play-program";
import { abilityChoicesSchema } from "./activate-ability";
import { characteristicsSchema } from "./characteristics";
import { eventZonesSchema, playerZonesSchema } from "./event-zones";
import { gameObjectSchema as object } from "./game-object-schema";
import { validateDeckSearchContinuation } from "./deck-search";
import { validateTopCardsContinuation } from "./top-cards";
import { validTargetIncarnations } from "./action-targets";
import { isCurrentCardSource } from "./cache-source";
import { programReplayPermissionSchema } from "./program-replay";
import {
  triggerTargetSchema,
  validateTriggerTargetContinuation,
} from "./trigger-target";

const id = z.string().min(1),
  ids = z.array(id),
  integer = z.number().int(),
  nonnegative = integer.nonnegative();
const seat = z.union([z.literal(0), z.literal(1)]);
const port = z.enum(["head", "body", "leftArm", "rightArm"]);
const departureZone = z.enum([
  "hand",
  "recycleBin",
  "purge",
  "cyberdeck",
  "ramDeck",
]);
const eventCard = { player: seat, instanceId: id };
const eventObservation = {
  observers: z.array(object),
  statEffectsBefore: z.array(timedStatEffectSchema),
  zonesAtEvent: eventZonesSchema,
};
const optionalEventObservation = {
  observers: eventObservation.observers.optional(),
  statEffectsBefore: eventObservation.statEffectsBefore.optional(),
  zonesAtEvent: eventObservation.zonesAtEvent.optional(),
};
const damage = {
  sourceId: id,
  player: seat,
  channel: z.enum(["MF", "BF"]),
  amount: nonnegative,
};
const ruleEvent: z.ZodType<RuleEvent> = z.union([
  z
    .object({
      type: z.literal("ability-retargeted"),
      sourceId: id,
      player: seat,
      abilityName: id,
      playerTarget: seat.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("gear-attached"),
      instanceId: id,
      player: seat,
      hostId: id,
      hostIncarnation: nonnegative,
      hostController: seat,
      observers: z.array(object),
    })
    .strict(),
  z
    .object({
      type: z.literal("wheel-of-fortune-revealed"),
      sourceId: id,
      player: seat,
      namedCost: nonnegative,
      revealed: id.nullable(),
      revealedCost: nonnegative.nullable(),
      matched: z.boolean(),
      ...eventObservation,
    })
    .strict(),
  z
    .object({
      type: z.literal("yacht-party-resolved"),
      sourceId: id,
      player: seat,
      revealed: ids,
      selected: id.nullable(),
      ...eventObservation,
    })
    .strict(),
  z
    .object({
      type: z.literal("hand-revealed"),
      sourceId: id,
      player: seat,
      instanceIds: ids,
      ...eventObservation,
    })
    .strict(),
  z
    .object({
      type: z.enum(["card-discarded", "recycle-card-purged"]),
      sourceId: id,
      ...eventCard,
      ...eventObservation,
    })
    .strict(),
  z
    .object({
      type: z.enum([
        "cyberdeck-card-binned",
        "setu-character-returned",
        "recycle-ram-returned",
        "cache-program-returned",
      ]),
      sourceId: id,
      ...eventCard,
      ...eventObservation,
    })
    .strict(),
  z
    .object({
      type: z.enum(["health-gained", "health-lost"]),
      ...damage,
      cause: z.enum(["effect", "damage", "payment"]),
      before: integer,
      after: integer,
    })
    .strict()
    .superRefine((event, ctx) => {
      const expected =
        event.before +
        (event.type === "health-gained" ? event.amount : -event.amount);
      if (
        event.amount <= 0 ||
        event.after !== expected ||
        (event.type === "health-gained" && event.cause !== "effect")
      )
        ctx.addIssue({ code: "custom", message: "Inconsistent health event" });
    }),
  z
    .object({
      type: z.literal("control-changed"),
      zonesAtEvent: eventZonesSchema,
      ...eventCard,
      sourceId: id,
      previousController: seat,
      observers: z.array(object),
      statEffectsBefore: z.array(timedStatEffectSchema),
    })
    .strict(),
  z
    .object({
      type: z.literal("counters-added"),
      zonesAtEvent: eventZonesSchema,
      ...eventCard,
      counter: id,
      amount: nonnegative,
      sourceId: id,
      observers: z.array(object),
      statEffectsBefore: z.array(timedStatEffectSchema),
    })
    .strict(),
  z
    .object({
      type: z.literal("object-targeted"),
      ...eventCard,
      ...eventObservation,
      sourceId: id,
      sourceController: seat,
      incarnation: nonnegative,
    })
    .strict(),
  z
    .object({
      type: z.literal("counters-removed"),
      ...eventCard,
      ...eventObservation,
      counter: id,
      amount: integer.positive(),
      sourceId: id,
    })
    .strict(),
  z
    .object({
      type: z.literal("ram-commitments-changed"),
      player: seat,
      attached: z.array(z.object({ ramId: id, hostId: id }).strict()),
      detached: z.array(z.object({ ramId: id, hostId: id }).strict()),
      ...optionalEventObservation,
      before: z.object(eventObservation).strict().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("token-created"),
      ...eventCard,
      sourceId: id,
      ...optionalEventObservation,
    })
    .strict(),
  z
    .object({
      type: z.literal("cache-action-countered"),
      player: seat,
      sourceId: id,
      targetId: id,
      kind: z.enum(["card", "activated", "triggered"]),
    })
    .strict(),
  z.object({ type: z.literal("ability-activated"), ...eventCard }).strict(),
  z
    .object({
      type: z.enum(["object-ran", "object-refreshed", "object-rebooted"]),
      zonesAtEvent: eventZonesSchema.optional(),
      ...eventCard,
      sourceId: id.nullable().optional(),
      observers: z.array(object).optional(),
      statEffectsBefore: z.array(timedStatEffectSchema).optional(),
      batch: z
        .object({
          index: nonnegative,
          operations: z
            .array(
              z
                .object({
                  type: z.enum([
                    "object-ran",
                    "object-refreshed",
                    "object-rebooted",
                  ]),
                  instanceId: id,
                })
                .strict(),
            )
            .min(1),
          before: z.object(eventObservation).strict(),
        })
        .strict()
        .optional(),
    })
    .strict()
    .superRefine((event, ctx) => {
      if (!event.batch) return;
      const selected = event.batch.operations[event.batch.index];
      const keys = event.batch.operations.map((item) =>
        JSON.stringify([item.type, item.instanceId]),
      );
      if (
        !selected ||
        selected.type !== event.type ||
        selected.instanceId !== event.instanceId ||
        new Set(keys).size !== keys.length
      )
        ctx.addIssue({
          code: "custom",
          message: "Invalid captured status batch",
        });
    }),
  z
    .object({
      type: z.enum([
        "card-drawn",
        "ram-installed",
        "gear-entered",
        "gear-failed-attachment",
        "environment-entered",
        "environment-binned",
      ]),
      ...eventCard,
      ...optionalEventObservation,
    })
    .strict(),
  z
    .object({
      type: z.literal("gear-played"),
      ...eventCard,
      ...eventObservation,
      subtype: id,
    })
    .strict(),
  z
    .object({
      type: z.literal("empty-deck"),
      player: seat,
      deck: z.enum(["cyberdeck", "ram-deck"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("player-damaged"),
      ...damage,
      combat: z.literal(true).optional(),
      ...optionalEventObservation,
    })
    .strict(),
  z
    .object({
      type: z.literal("character-damaged"),
      sourceController: seat.nullable().optional(),
      ...damage,
      instanceId: id,
      combat: z.literal(true).optional(),
      ...optionalEventObservation,
    })
    .strict(),
  z
    .object({
      type: z.enum(["character-played", "character-entered"]),
      ...optionalEventObservation,
      ...eventCard,
      factions: ids,
    })
    .strict(),
  z
    .object({
      type: z.enum(["protocol-entered", "protocol-binned", "protocol-moved"]),
      ...optionalEventObservation,
      ...eventCard,
      mainframeId: id,
    })
    .strict(),
  z
    .object({
      type: z.literal("program-played"),
      subtype: z.enum(["script", "protocol", "environment"]),
      ...optionalEventObservation,
      ...eventCard,
      factions: ids,
      tags: ids,
      reversed: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.enum(["script-binned", "script-purged"]),
      ...eventCard,
      reason: z.enum(["resolved", "all-targets-illegal"]),
    })
    .strict()
    .refine(
      (event) => event.type !== "script-purged" || event.reason === "resolved",
      "Only resolved replay scripts are purged",
    ),
  z
    .object({
      type: z.literal("environment-destroyed"),
      zonesAtEvent: eventZonesSchema,
      statEffectsBefore: z.array(timedStatEffectSchema),
      ...eventCard,
      sourceId: id,
      previous: object,
      observers: z.array(object),
    })
    .strict(),
  z
    .object({
      type: z.literal("persistent-destroyed"),
      destructionBatch: z
        .array(
          z.object({ instanceId: id, destroyedBy: seat.nullable() }).strict(),
        )
        .optional(),
      zonesAtEvent: eventZonesSchema,
      statEffectsBefore: z.array(timedStatEffectSchema),
      ...eventCard,
      sourceId: id.nullable(),
      destroyedBy: seat.nullable(),
      previous: object,
      observers: z.array(object),
    })
    .strict(),
  z
    .object({
      type: z.literal("persistent-binned"),
      zonesAtEvent: eventZonesSchema,
      statEffectsBefore: z.array(timedStatEffectSchema),
      ...eventCard,
      previous: object,
      observers: z.array(object),
    })
    .strict(),
  z
    .object({
      type: z.literal("persistent-moved"),
      replacement: z.enum(["spirit", "zen-garden"]).optional(),
      zonesAtEvent: eventZonesSchema,
      statEffectsBefore: z.array(timedStatEffectSchema),
      ...eventCard,
      destination: departureZone,
      previous: object,
      observers: z.array(object),
    })
    .strict()
    .refine(
      (event) => !event.replacement || event.destination === "purge",
      "SPIRIT replacement must purge",
    ),
  z
    .object({
      type: z.literal("system-checked"),
      ...optionalEventObservation,
      player: seat,
      underfunded: ids,
    })
    .strict(),
  z
    .object({
      type: z.literal("instability-rolled"),
      ...eventObservation,
      ...eventCard,
      value: integer,
    })
    .strict(),
  z
    .object({
      type: z.literal("psychosis-rolled"),
      ...eventCard,
      ...eventObservation,
      cause: z.enum(["attack", "activation-run", "external-run"]),
      threshold: integer.positive(),
      value: integer,
      failed: z.boolean(),
    })
    .strict()
    .superRefine((event, context) => {
      if (event.failed !== event.value < event.threshold)
        context.addIssue({
          code: "custom",
          message: "Inconsistent psychosis result",
        });
    }),
  z
    .object({
      type: z.enum([
        "deploy-started",
        "netcheck-started",
        "combat-started",
        "combat-ended",
        "turn-ending",
      ]),
      player: seat,
      ...optionalEventObservation,
    })
    .strict(),
  z
    .object({
      type: z.literal("character-attacked"),
      ...eventCard,
      ...optionalEventObservation,
      defendingPlayer: seat,
    })
    .strict(),
  z
    .object({
      type: z.literal("card-die-rolled"),
      outcome: z.string().optional(),
      sourceId: id,
      player: seat,
      sides: z.literal(20),
      result: z
        .number()
        .int()
        .min(Number.MIN_SAFE_INTEGER)
        .max(Number.MAX_SAFE_INTEGER),
      ...eventObservation,
    })
    .strict(),
  z
    .object({
      type: z.literal("character-blocked"),
      ...eventCard,
      attackerId: id,
      blockingGroup: z.array(id).optional(),
      blockingBatch: z
        .array(z.object({ blockerId: id, attackerId: id }).strict())
        .optional(),
      ...eventObservation,
    })
    .strict(),
]);
const action = z
  .object({
    id,
    kind: z.enum(["card", "activated", "triggered"]),
    controller: seat,
    sourceId: id,
    gearTargets: z.array(z.object({ hostId: id, port }).strict()).optional(),
    purgeOnResolution: z.literal(true).optional(),
    sourceIncarnation: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    targetIncarnations: z
      .record(id, z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER))
      .optional(),
    protocolTarget: id.optional(),
    programChoices: programChoicesSchema.optional(),
    activatedAbility: z
      .object({
        abilityId: id,
        handler: id,
        choices: abilityChoicesSchema,
        source: object,
        characteristics: characteristicsSchema,
        destroyedCharacterAttacks: z
          .array(z.object({ id, attack: integer }).strict())
          .optional(),
        departedSourceCharacteristics: characteristicsSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    validTargetIncarnations,
    "Missing or inconsistent target incarnations",
  )
  .refine(
    (value) => value.kind !== "card" || value.sourceIncarnation !== undefined,
    "Missing cached source incarnation",
  )
  .refine(
    (value) =>
      !value.purgeOnResolution ||
      (value.kind === "card" && value.programChoices !== undefined),
    "Replay purge requires a program card action",
  );
const player = z
  .object({
    userId: id,
    mainframeHealth: integer,
    bioframeHealth: integer,
    zones: playerZonesSchema,
  })
  .strict();

const pendingTrigger = z
  .object({
    judgement: judgementEffectSchema.optional(),
    departedSourceCounters: z.record(z.string().min(1), nonnegative).optional(),
    departedSourceHosts: z
      .array(z.object({ id, incarnation: nonnegative }).strict())
      .optional(),
    sourceId: id,
    controller: seat,
    handler: id,
    event: ruleEvent,
    target: triggerTargetSchema.nullable().optional(),
    optionalChoice: z.boolean().optional(),
    placementChoice: z.string().trim().min(1).max(100).optional(),
    choice: z.string().trim().min(1).max(100).optional(),
    selectedCards: z
      .array(id)
      .min(1)
      .max(512)
      .refine((v) => new Set(v).size === v.length)
      .optional(),
    optionalPlayer: seat.optional(),
    delayed: delayedTriggerSchema.optional(),
  })
  .strict();

export const gameStateSchema: z.ZodType<GameState> = z
  .object({
    schemaVersion: z.literal(1),
    revision: nonnegative,
    nextTokenNumber: nonnegative,
    nextEffectNumber: nonnegative,
    statEffects: z.array(timedStatEffectSchema),
    combatEffects: z.array(timedCombatEffectSchema),
    triggerEffects: z.array(timedTriggerEffectSchema).default([]),
    effectUses: z
      .array(
        z
          .object({
            sourceId: id,
            incarnation: integer,
            handler: id,
            turn: integer.positive(),
          })
          .strict(),
      )
      .optional(),
    damagePreventions: z.array(timedDamagePreventionSchema).default([]),
    freeCardPlays: z.array(freeCardPlaySchema).optional(),
    timedControl: z.array(timedControlSchema).optional(),
    attachmentControl: z
      .array(
        z
          .object({
            hostId: id,
            incarnation: z.number().int().nonnegative(),
            controller: seat,
          })
          .strict(),
      )
      .optional(),
    resolutionContinuation: resolutionContinuationSchema.nullable(),
    delayedTriggers: z.array(delayedTriggerSchema),
    destructionProtections: z.array(destructionProtectionSchema).default([]),
    psychosisImmunities: z.array(psychosisImmunitySchema).default([]),
    programReplayPermissions: z.array(programReplayPermissionSchema),
    programHistory: z.array(programPlayRecordSchema).nullable().default(null),
    cardPlayHistory: z.array(cardPlayRecordSchema).nullable().default(null),
    reveals: z.array(
      z
        .object({
          player: seat,
          definitionVersion: z.string().regex(/^[a-f0-9]{64}$/),
          characteristics: characteristicsSchema,
        })
        .strict(),
    ),
    engineVersion: id,
    rulesVersion: id,
    random: z
      .object({
        algorithm: z.literal("hmac-sha256-counter-v1"),
        seed: z.string().regex(/^[a-f0-9]{64}$/),
        counter: nonnegative,
      })
      .strict(),
    objects: z.record(id, object),
    players: z.tuple([player, player]),
    arena: ids,
    environment: ids,
    cache: ids,
    priorityWindow: z
      .object({
        activePlayer: seat,
        origin: z.enum(["deploy", "combat", "netcheck"]),
        swiftCheck: z.boolean(),
        priority: seat.nullable(),
        consecutivePasses: nonnegative.max(2),
        stack: z.array(action),
        triggers: z.array(action),
        resolving: action.nullable(),
        resolutionApplied: z.boolean(),
        mode: z.enum(["priority", "drain", "complete"]),
      })
      .strict()
      .nullable(),
    gameLog: savedGameLogSchema.optional(),
    pendingRuleEvents: z.array(ruleEvent),
    pendingTriggers: z.array(pendingTrigger),
    triggersOrdered: z.boolean(),
    triggerOrderStart: nonnegative,
    drawInstallRemaining: nonnegative.max(2),
    combat: z
      .object({
        stage: z.enum([
          "attackers-window",
          "attackers",
          "blockers-window",
          "blockers",
          "damage-window",
          "damage",
          "damage-applied",
          "end",
        ]),
        attackers: ids,
        blockers: z.array(z.object({ blockerId: id, attackerId: id }).strict()),
      })
      .strict()
      .nullable(),
    extraTurns: z.array(seat),
    pendingDecision: z
      .union([
        eclipseDecisionSchema,
        enhanceDecisionSchema,
        towerDecisionSchema,
        duckyDecisionSchema,
        z
          .object({
            type: z.literal("wonderland"),
            id,
            sourceId: id,
            player: seat,
            startedAtRevision: z.number().int().nonnegative(),
            trigger: pendingTrigger,
            remaining: z.number().int().min(0).max(1),
            roll: z.number().int(),
            stage: z.enum(["destroy", "invert", "play"]),
            candidates: z.array(id),
            cardId: id.optional(),
          })
          .strict(),
        bailoutDecisionSchema,
        z
          .object({
            type: z.literal("spirit-entry"),
            id,
            sourceId: id,
            player: seat,
            startedAtRevision: z.number().int().nonnegative(),
            trigger: pendingTrigger,
            entries: z.array(
              z
                .object({
                  id,
                  player: seat,
                  incarnation: z.number().int().nonnegative(),
                })
                .strict(),
            ),
            groups: z
              .array(
                z
                  .object({
                    player: seat,
                    name: id,
                    candidates: z.array(id).min(2),
                  })
                  .strict(),
              )
              .min(1),
            selected: z.array(id),
          })
          .strict(),
        z
          .object({
            type: z.literal("trigger-choice"),
            timing: z.literal("placement").optional(),
            cardCount: z.number().int().positive().max(512).optional(),
            id,
            player: seat,
            sourceId: id,
            triggerIndex: nonnegative,
            prompt: z.string().trim().min(1).max(500),
            options: z
              .array(
                z
                  .object({
                    id: z.string().trim().min(1).max(100),
                    label: z.string().trim().min(1).max(200),
                    cardId: id.optional(),
                  })
                  .strict(),
              )
              .min(1)
              .max(512)
              .refine((v) => new Set(v.map((o) => o.id)).size === v.length),
          })
          .strict(),
        copyAbilityDecisionSchema,
        damagePreventionDecisionSchema,
        counterReplacementDecisionSchema,
        z
          .object({
            type: z.literal("ram-cost-choice"),
            id,
            sourceId: id,
            player: seat,
            actionId: id,
            handler: id,
          })
          .strict(),
        z
          .object({
            type: z.literal("faction-choice"),
            id,
            sourceId: id,
            player: seat,
            actionId: id,
            handler: id,
            factions: z.array(z.string().trim().min(1).max(80)).min(1).max(32),
          })
          .strict(),
        z
          .object({
            type: z.literal("shred-transfer"),
            mandatory: z.literal(true).optional(),
            id,
            sourceId: id,
            actionId: id,
            gearId: id,
            player: seat,
            options: z
              .array(
                z
                  .array(
                    z
                      .object({
                        hostId: id,
                        port: z.enum(["head", "body", "leftArm", "rightArm"]),
                      })
                      .strict(),
                  )
                  .min(1)
                  .max(2),
              )
              .min(1),
          })
          .strict(),
        z
          .object({
            type: z.literal("retarget-program"),
            id,
            sourceId: id,
            actionId: id,
            targetActionId: id,
            player: seat,
            objectSlots: z
              .array(
                z
                  .array(z.object({ id, incarnation: nonnegative }).strict())
                  .min(1),
              )
              .min(1)
              .optional(),
            options: z.array(
              z
                .object({
                  choices: programChoicesSchema,
                  targetIncarnations: z.record(id, nonnegative),
                })
                .strict(),
            ),
          })
          .strict(),
        z
          .object({
            type: z.literal("redirect-ability"),
            scriptDefinitionVersion: z
              .string()
              .regex(/^[a-f0-9]{64}$/)
              .optional(),
            id,
            sourceId: id,
            actionId: id,
            targetActionId: id,
            player: seat,
          })
          .strict(),
        z
          .object({
            type: z.literal("hand-choice"),
            id,
            sourceId: id,
            actionId: id,
            handler: id,
            player: seat,
            targetPlayer: seat,
            inspected: ids.min(1),
            incarnations: z.record(id, nonnegative),
          })
          .strict(),
        z
          .object({
            type: z.literal("optional-trigger"),
            id,
            player: seat,
            sourceId: id,
            triggerIndex: nonnegative,
            prompt: z.string().trim().min(1).max(500),
          })
          .strict(),
        z
          .object({
            type: z.literal("top-cards"),
            id,
            player: seat,
            sourceId: id,
            actionId: id,
            handler: id,
            kind: z.enum(["index", "divine", "look-bin", "tea-party"]),
            trigger: pendingTrigger.optional(),
            sequence: z
              .object({
                total: z.number().int().positive(),
                remaining: z.number().int().positive(),
              })
              .strict()
              .optional(),
            count: z.number().int().positive(),
            inspected: ids.min(1),
            candidates: ids,
          })
          .strict(),
        z
          .object({
            type: z.literal("trigger-target"),
            id,
            player: seat,
            sourceId: id,
            triggerIndex: nonnegative,
            candidates: z.array(triggerTargetSchema).min(1),
          })
          .strict(),
        z
          .object({
            type: z.literal("deck-search"),
            id,
            player: seat,
            sourceId: id,
            actionId: id,
            handler: id,
            inspected: ids,
            candidates: ids,
            allowFail: z.boolean(),
          })
          .strict(),
        z
          .object({
            type: z.literal("ram-balance"),
            id,
            player: seat,
            sourceId: id,
            hosts: z
              .array(
                z
                  .object({ hostId: id, required: nonnegative, committed: ids })
                  .strict(),
              )
              .min(1),
            available: ids,
          })
          .strict(),
        z
          .object({
            type: z.literal("counter-payment"),
            id,
            player: seat,
            ramCost: nonnegative,
            sourceId: id,
            targetActionId: id,
          })
          .strict(),
        z
          .object({
            type: z.literal("tether-follow"),
            id,
            player: seat,
            sourceId: id,
            options: z
              .array(
                z.object({ hostId: id, destination: departureZone }).strict(),
              )
              .length(2),
          })
          .strict(),
      ])
      .nullable(),
    turn: z
      .object({
        number: integer.positive(),
        activePlayer: seat,
        systemCheckComplete: z.boolean(),
        forceQuitComplete: z.boolean(),
        resetComplete: z.boolean(),
        nextRegularPlayer: seat,
        step: z.enum([
          "system-check",
          "refresh",
          "draw-install",
          "force-quit",
          "deploy",
          "netcheck",
          "combat",
          "reset",
        ]),
      })
      .strict(),
    outcome: z
      .union([
        z
          .object({
            type: z.literal("win"),
            winner: seat,
            reason: z.enum(["concession", "health", "card-effect"]),
          })
          .strict(),
        z
          .object({
            type: z.literal("draw"),
            reason: z.enum(["simultaneous-loss", "mandatory-loop"]),
          })
          .strict(),
        z.object({ type: z.literal("abandoned"), by: seat }).strict(),
      ])
      .nullable(),
  })
  .strict();

/** Validates current schema only. Old versions need their pinned decoder, not guessed defaults. */
export function decodeGameState(
  input: unknown,
  allowReplacementCheckpoint = true,
): GameState {
  const state = gameStateSchema.parse(input);
  if (
    state.pendingDecision?.type === "counter-replacement" ||
    state.pendingDecision?.type === "damage-prevention"
  ) {
    if (!allowReplacementCheckpoint)
      throw Error("Nested replacement checkpoint");
    const saved = state.pendingDecision;
    const before = decodeGameState(JSON.parse(saved.checkpoint), false);
    const command = gameCommandSchema.parse(JSON.parse(saved.command));
    if (
      command.action.type === "answer-counter-replacement" ||
      command.action.type === "answer-damage-prevention" ||
      command.expectedRevision !== before.revision ||
      before.revision >= state.revision ||
      before.engineVersion !== state.engineVersion ||
      before.rulesVersion !== state.rulesVersion ||
      before.players.some((p, i) => p.userId !== state.players[i].userId) ||
      !state.arena.includes(saved.sourceId) ||
      (saved.type === "counter-replacement" &&
        state.objects[saved.sourceId].controller !== saved.player) ||
      (saved.type === "counter-replacement" &&
        !saved.options &&
        ((state.objects[saved.sourceId].counters.ARMOR ?? 0) < 1 ||
          (state.objects[saved.sourceId].counters.SPIRIT ?? 0) < 1)) ||
      (saved.type === "counter-replacement" &&
        saved.options !== undefined &&
        (JSON.stringify(saved.options) !== JSON.stringify(["fan", "decline"]) ||
          state.players[saved.player].mainframeHealth < 2 ||
          state.players[saved.player].bioframeHealth < 2)) ||
      (saved.type === "damage-prevention" &&
        (new Set(saved.options).size !== saved.options.length ||
          (!saved.options.includes(saved.sourceId) &&
            !saved.options.some((id) => id.startsWith("justice:"))) ||
          saved.options.some(
            (id) =>
              id !== "other-prevention" &&
              (id.startsWith("justice:")
                ? !state.damagePreventions.some(
                    (d) =>
                      `justice:${d.id}` === id &&
                      d.kind === "justice" &&
                      d.player === saved.player &&
                      d.expiresAfterTurn >= state.turn.number,
                  )
                : !state.arena.includes(id) ||
                  state.objects[id].controller !== saved.player),
          )))
    )
      throw Error("Invalid replacement checkpoint");
  }
  for (const object of Object.values(state.objects)) {
    if (
      object.setRamCost !== undefined &&
      !state.arena.includes(object.id) &&
      !state.environment.includes(object.id) &&
      !state.cache.includes(object.id)
    )
      throw Error("RAM cost setting survived a zone change");
  }
  for (const object of Object.values(state.objects))
    if (
      object.trojanPlayedTurn !== undefined &&
      (object.trojanPlayedTurn > state.turn.number ||
        (!state.cache.includes(object.id) && !state.arena.includes(object.id)))
    )
      throw new Error("Invalid retained Trojan play turn");
  if (
    state.gameLog &&
    (state.gameLog.pendingRecorded > state.pendingRuleEvents.length ||
      state.gameLog.entries.some(
        (entry, index) =>
          entry.id !== index + 1 || entry.turn > state.turn.number,
      ))
  )
    throw new Error("Invalid stored game log");
  assertGameZones(state);
  validateProgramHistory(state);
  validateCardPlayHistory(state);
  const replayTargets = new Set<string>();
  for (const permission of state.programReplayPermissions) {
    if (
      replayTargets.has(permission.targetId) ||
      !state.players[permission.player].zones.recycleBin.includes(
        permission.targetId,
      ) ||
      state.objects[permission.targetId]?.incarnation !==
        permission.targetIncarnation ||
      permission.expiresAfterTurn < state.turn.number
    )
      throw new Error("Invalid stored program replay permission");
    replayTargets.add(permission.targetId);
  }
  if (
    new Set(state.statEffects.map((item) => item.effect.id)).size !==
    state.statEffects.length
  )
    throw new Error("Duplicate stored stat effect");
  // A played script copy ceases outside the cache; its independent effects retain their source identity in play history.
  const knownEffectSource = (id: string) =>
    !!state.objects[id] ||
    (id.startsWith("script-copy:") &&
      !!state.programHistory?.some((p) => p.instanceId === id));
  for (const item of state.statEffects) {
    if (
      (item.targetId !== null && !state.arena.includes(item.targetId)) ||
      !knownEffectSource(item.sourceId) ||
      item.effect.timestamp >= state.nextEffectNumber ||
      !statEffectActive(state, item)
    )
      throw new Error("Invalid stored stat effect");
    evaluateCharacterStats({ attack: 0, defence: 0 }, {}, [item.effect]);
  }
  const combatEffectIds = new Set(
    state.statEffects.map((item) => item.effect.id),
  );
  for (const effect of state.combatEffects) {
    if (
      combatEffectIds.has(effect.id) ||
      (effect.targetId !== null &&
        (!state.arena.includes(effect.targetId) ||
          state.objects[effect.targetId]?.incarnation !==
            effect.targetIncarnation)) ||
      effect.timestamp >= state.nextEffectNumber ||
      (effect.expiresAfterTurn !== null &&
        effect.expiresAfterTurn < state.turn.number) ||
      (effect.expiresAfterTurn === null &&
        (!state.arena.includes(effect.sourceId) ||
          state.objects[effect.sourceId]?.incarnation !==
            effect.sourceIncarnation))
    )
      throw new Error("Invalid stored combat effect");
    combatEffectIds.add(effect.id);
  }
  for (const effect of state.triggerEffects) {
    if (
      combatEffectIds.has(effect.id) ||
      effect.timestamp >= state.nextEffectNumber ||
      effect.expiresAfterTurn < state.turn.number
    )
      throw new Error("Invalid stored trigger effect");
    combatEffectIds.add(effect.id);
  }
  const controlTimestamps = new Set<number>();
  for (const effect of state.timedControl ?? []) {
    if (
      controlTimestamps.has(effect.timestamp) ||
      effect.timestamp >= state.nextEffectNumber ||
      effect.expiresAfterTurn < state.turn.number ||
      !knownEffectSource(effect.sourceId) ||
      !state.arena.includes(effect.targetId) ||
      state.objects[effect.targetId]?.incarnation !== effect.incarnation
    )
      throw Error("Invalid stored temporary control effect");
    controlTimestamps.add(effect.timestamp);
  }
  for (const effect of state.destructionProtections ?? []) {
    if (
      combatEffectIds.has(effect.id) ||
      effect.timestamp >= state.nextEffectNumber ||
      effect.expiresAfterTurn < state.turn.number ||
      ![...state.arena, ...state.environment].includes(effect.targetId) ||
      state.objects[effect.targetId]?.incarnation !== effect.targetIncarnation
    )
      throw Error("Invalid stored destruction protection");
    combatEffectIds.add(effect.id);
  }
  for (const effect of state.psychosisImmunities ?? []) {
    if (
      combatEffectIds.has(effect.id) ||
      effect.timestamp >= state.nextEffectNumber ||
      effect.grantedTurn > state.turn.number ||
      !state.objects[effect.sourceId] ||
      !state.arena.includes(effect.targetId) ||
      state.objects[effect.targetId]?.incarnation !== effect.targetIncarnation
    )
      throw Error("Invalid stored psychosis immunity");
    combatEffectIds.add(effect.id);
  }
  for (const delay of state.delayedTriggers) {
    if (
      combatEffectIds.has(delay.id) ||
      delay.timestamp >= state.nextEffectNumber ||
      delay.createdTurn > state.turn.number
    )
      throw new Error("Invalid stored delayed trigger");
    combatEffectIds.add(delay.id);
  }
  for (const effect of state.damagePreventions) {
    if (
      combatEffectIds.has(effect.id) ||
      effect.timestamp >= state.nextEffectNumber ||
      effect.expiresAfterTurn < state.turn.number
    )
      throw new Error("Invalid stored damage prevention effect");
    combatEffectIds.add(effect.id);
  }
  for (const effect of state.freeCardPlays ?? []) {
    if (
      combatEffectIds.has(effect.id) ||
      !state.objects[effect.sourceId] ||
      effect.timestamp >= state.nextEffectNumber ||
      effect.expiresAfterTurn < state.turn.number
    )
      throw Error("Invalid stored free card play");
    combatEffectIds.add(effect.id);
  }
  for (const trigger of state.pendingTriggers) {
    const delay = trigger.delayed;
    if (!delay) continue;
    if (
      combatEffectIds.has(delay.id) ||
      delay.timestamp >= state.nextEffectNumber ||
      delay.createdTurn > state.turn.number ||
      delay.sourceId !== trigger.sourceId ||
      delay.controller !== trigger.controller ||
      delay.handler !== trigger.handler ||
      trigger.event.type !== "turn-ending"
    )
      throw new Error("Invalid pending delayed trigger");
    combatEffectIds.add(delay.id);
  }
  if (state.players[0].userId === state.players[1].userId)
    throw new Error("Duplicate match participants");
  if ((state.turn.step === "combat") !== (state.combat !== null))
    throw new Error("Inconsistent combat phase");
  if (
    !state.triggersOrdered &&
    state.pendingTriggers.length - state.triggerOrderStart < 2
  )
    throw new Error("Invalid trigger-order boundary");
  const window = state.priorityWindow;
  if (state.resolutionContinuation) {
    validateResolutionContinuation(state);
    if (!state.priorityWindow?.resolutionApplied)
      throw new Error(
        "Invalid saved resolution continuation: initial instruction not applied",
      );
  }
  if (state.pendingDecision?.type === "trigger-target")
    validateTriggerTargetContinuation(state);
  if (state.pendingDecision?.type === "eclipse-entry") validateEclipse(state);
  if (state.pendingDecision?.type === "ducky-play") validateDucky(state);
  if (state.pendingDecision?.type === "tower") validateTower(state);
  if (state.pendingDecision?.type === "deck-order") validateEnhance(state);
  if (state.pendingDecision?.type === "wonderland") validateWonderland(state);
  if (state.pendingDecision?.type === "bailout") validateBailoutDecision(state);
  if (state.pendingDecision?.type === "spirit-entry")
    validateSpiritEntryContinuation(state);
  if (state.pendingDecision?.type === "trigger-choice")
    validateTriggerChoiceContinuation(state);
  if (state.pendingDecision?.type === "optional-trigger")
    validateOptionalTriggerContinuation(state);
  if (state.pendingDecision?.type === "ram-cost-choice")
    validateRamCostChoiceContinuation(state);
  if (state.pendingDecision?.type === "faction-choice")
    validateFactionChoiceContinuation(state);
  if (state.pendingDecision?.type === "retarget-program")
    validateRetargetChoiceContinuation(state);
  if (state.pendingDecision?.type === "redirect-ability")
    validateRedirectDecision(state);
  if (state.pendingDecision?.type === "copy-ability")
    validateCopyAbilityDecision(state);
  if (state.pendingDecision?.type === "shred-transfer")
    validateShredDecision(state);
  if (state.pendingDecision?.type === "hand-choice")
    validateHandChoiceContinuation(state);
  if (state.pendingDecision?.type === "top-cards")
    validateTopCardsContinuation(state, state.pendingDecision);
  if (state.pendingDecision?.type === "deck-search")
    validateDeckSearchContinuation(state, state.pendingDecision);
  if (state.pendingDecision?.type === "ram-balance")
    validateRamBalanceContinuation(state, state.pendingDecision);
  if (state.pendingDecision?.type === "tether-follow")
    validateTetherContinuation(state, state.pendingDecision);
  if (state.pendingDecision?.type === "counter-payment") {
    const decision = state.pendingDecision;
    const target = window?.stack.find(
      (item) => item.id === decision.targetActionId,
    );
    if (
      !window ||
      window.mode !== "drain" ||
      window.priority !== null ||
      window.resolving?.kind !== "card" ||
      window.resolving.sourceId !== decision.sourceId ||
      !state.cache.includes(decision.sourceId) ||
      target?.kind !== "card" ||
      target.controller !== decision.player ||
      !state.cache.includes(target.sourceId)
    )
      throw new Error("Invalid counter payment continuation");
    if (
      !isCurrentCardSource(state, window.resolving!) ||
      !isCurrentCardSource(state, target)
    )
      throw new Error("Invalid counter payment source incarnation");
  }
  if (window) {
    if (
      window.activePlayer !== state.turn.activePlayer ||
      (window.resolutionApplied && !window.resolving)
    )
      throw new Error("Invalid priority state");
    const actions = [
      ...window.stack,
      ...window.triggers,
      ...(window.resolving ? [window.resolving] : []),
    ];
    if (new Set(actions.map((item) => item.id)).size !== actions.length)
      throw new Error("Duplicate cache action");
    if (
      [...window.stack, ...window.triggers].some(
        (item) => item.kind === "card" && !isCurrentCardSource(state, item),
      )
    )
      throw new Error("Pending cached source is absent or a different object");
  }
  if (
    state.combat &&
    (new Set(state.combat.attackers).size !== state.combat.attackers.length ||
      new Set(state.combat.blockers.map((item) => item.blockerId)).size !==
        state.combat.blockers.length)
  )
    throw new Error("Duplicate combat assignment");
  return state;
}
import { freeCardPlaySchema } from "./free-card-plays";
