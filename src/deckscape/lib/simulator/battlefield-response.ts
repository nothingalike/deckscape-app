import { duckyPromptSchema } from "./ducky-contract";
import { towerPromptSchema } from "./tower-contract";
import { eclipsePromptSchema } from "./eclipse-contract";
import { enhancePromptSchema } from "./enhance-contract";
import { wonderlandPromptSchema } from "./wonderland-contract";
import { logEntrySchema } from "./game-log";
import { z } from "zod";
import { cardInspectionSchema, artworkUrlSchema } from "./card-inspection";
import { programOptionsMatchView } from "./program-play-option";
import { activationOptionsMatchView } from "./activation-option";
import { activationVariantSchema } from "./activation-option";
import type { BattlefieldSnapshot } from "./match-client-session";
import { turnPromptSchema, turnPromptMatchesView } from "./turn-prompt";

const id = z.string().min(1);
const integer = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);
const count = integer.nonnegative();
const seat = z.union([z.literal(0), z.literal(1)]);
const port = z.enum(["head", "body", "leftArm", "rightArm"]);
const card = z
  .object({
    instanceId: id,
    token: z.boolean(),
    owner: seat,
    controller: seat,
    faceDown: z.boolean(),
    running: z.boolean(),
    abilitySpent: z.boolean(),
    damage: z.object({ MF: count, BF: count }).strict(),
    counters: z.record(id, count),
    attachments: z.array(
      z
        .object({
          hostId: id,
          kind: z.enum(["gear", "protocol", "ram"]),
          port: port.optional(),
        })
        .strict(),
    ),
    definitionVersion: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
const cards = z.array(card);
const host = z
  .object({ hostId: id, required: count, committed: z.array(id) })
  .strict();
const option = z
  .object({
    index: count,
    destination: z.enum([
      "hand",
      "recycleBin",
      "purge",
      "cyberdeck",
      "ramDeck",
    ]),
    hostId: id.optional(),
  })
  .strict();
const cacheAction = z
  .object({
    id,
    kind: z.enum(["card", "activated", "triggered"]),
    controller: seat,
    sourceId: id.optional(),
    unavailableTargetCount: count.optional(),
    targets: z.array(
      z.discriminatedUnion("type", [
        z
          .object({
            type: z.literal("object"),
            id,
            group: id,
            port: id.optional(),
          })
          .strict(),
        z
          .object({ type: z.literal("player"), player: seat, group: id })
          .strict(),
        z.object({ type: z.literal("cache-action"), id, group: id }).strict(),
      ]),
    ),
  })
  .strict();
const pending = z
  .object({
    type: z.enum([
      "wonderland",
      "bailout",
      "spirit-entry",
      "copy-ability",
      "damage-prevention",
      "counter-replacement",
      "counter-payment",
      "tether-follow",
      "ram-balance",
      "deck-search",
      "top-cards",
      "trigger-target",
      "optional-trigger",
      "trigger-choice",
      "faction-choice",
      "ram-cost-choice",
      "retarget-program",
      "redirect-ability",
      "eclipse-entry",
      "tower",
      "ducky-play",
      "deck-order",
      "hand-choice",
    ]),
    player: seat,
    sourceId: id.optional(),
    decisionId: id.optional(),
    ramCost: count.optional(),
    hosts: z.array(host).optional(),
    availableRam: z.array(id).optional(),
    options: z.array(option).optional(),
  })
  .strict();
const decision = z.discriminatedUnion("type", [
  eclipsePromptSchema,
  towerPromptSchema,
  duckyPromptSchema,
  enhancePromptSchema,
  wonderlandPromptSchema,
  z
    .object({
      type: z.literal("bailout"),
      decisionId: id,
      revision: count,
      sourceId: id,
      count: z.number().int().positive(),
      ram: z.array(id).min(2),
    })
    .strict(),
  z
    .object({
      type: z.literal("spirit-entry"),
      decisionId: id,
      revision: count,
      sourceId: id,
      name: id,
      groupIndex: count,
      totalGroups: count,
      confirmed: z.array(
        z
          .object({
            id,
            player: z.union([z.literal(0), z.literal(1)]),
            name: id,
          })
          .strict(),
      ),
      cards: z
        .array(
          cardInspectionSchema
            .extend({ id, eligible: z.literal(true) })
            .strict(),
        )
        .min(2),
    })
    .strict(),
  z
    .object({
      type: z.literal("redirect-ability"),
      decisionId: id,
      revision: count,
      sourceId: id,
      targetActionId: id,
      targetAbility: id,
      targetCount: count,
      originalTargets: z.array(id),
      originalPlayer: seat.optional(),
      variants: z.array(activationVariantSchema),
    })
    .strict(),
  z
    .object({
      type: z.literal("retarget-program"),
      decisionId: id,
      revision: count,
      sourceId: id,
      targetActionId: id,
      targetProgramId: id,
      originalTargets: z.array(id).optional(),
      objectSlots: z
        .array(
          z
            .object({
              options: z
                .array(
                  z
                    .object({
                      index: count,
                      label: id,
                      targetId: id.optional(),
                      card: cardInspectionSchema.optional(),
                    })
                    .strict(),
                )
                .min(1),
            })
            .strict(),
        )
        .min(1)
        .optional(),
      options: z.array(
        z
          .object({
            index: count,
            label: id,
            targetId: id.optional(),
            targetIds: z.array(id).optional(),
            player: seat.optional(),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      type: z.literal("copy-ability"),
      decisionId: id,
      revision: count,
      sourceId: id,
      targetId: id,
      options: z
        .array(
          z
            .object({ index: count, label: z.string().min(1).max(500) })
            .strict(),
        )
        .min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("damage-prevention"),
      decisionId: id,
      revision: count,
      sourceId: id,
      options: z.array(id).min(2),
    })
    .strict(),
  z
    .object({
      type: z.literal("counter-replacement"),
      options: z
        .array(z.enum(["armor", "spirit", "fan", "decline"]))
        .min(2)
        .optional(),
      decisionId: id,
      revision: count,
      sourceId: id,
    })
    .strict(),
  z
    .object({
      type: z.literal("hand-choice"),
      decisionId: id,
      revision: count,
      targetPlayer: seat,
      allowFail: z.literal(false),
      cards: z
        .array(
          z
            .object({
              id,
              ...cardInspectionSchema.shape,
              eligible: z.literal(true),
            })
            .strict(),
        )
        .min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("ram-cost-choice"),
      decisionId: id,
      revision: count,
    })
    .strict(),
  z
    .object({
      type: z.literal("faction-choice"),
      decisionId: id,
      revision: count,
      factions: z
        .array(z.string().trim().min(1).max(80))
        .min(1)
        .max(32)
        .refine((values) => new Set(values).size === values.length),
    })
    .strict(),
  z
    .object({
      type: z.literal("trigger-choice"),
      cardCount: z.number().int().positive().max(512).optional(),
      decisionId: id,
      revision: count,
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
  z
    .object({
      type: z.literal("optional-trigger"),
      decisionId: id,
      revision: count,
      prompt: z.string().trim().min(1).max(500),
    })
    .strict(),
  z
    .object({
      type: z.literal("top-cards"),
      decisionId: id,
      revision: count,
      kind: z.enum(["index", "divine", "look-bin", "tea-party"]),
      allowFail: z.boolean(),
      cards: z
        .array(
          z
            .object({
              id,
              ...cardInspectionSchema.shape,
              eligible: z.boolean(),
            })
            .strict(),
        )
        .min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("trigger-target"),
      cards: z
        .array(
          z
            .object({
              id,
              eligible: z.boolean(),
              ...cardInspectionSchema.shape,
            })
            .strict(),
        )
        .min(1)
        .optional(),
      decisionId: id,
      revision: count,
      sourceId: id,
      options: z
        .array(
          z.union([
            z.object({ index: count, characterId: id }).strict(),
            z.object({ index: count, ramId: id }).strict(),
            z.object({ index: count, programId: id }).strict(),
            z
              .object({
                index: count,
                player: z.enum(["you", "opponent"]),
                seat,
              })
              .strict(),
          ]),
        )
        .min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("deck-search"),
      decisionId: id,
      revision: count,
      allowFail: z.boolean(),
      cards: z.array(
        z
          .object({
            id,
            ...cardInspectionSchema.shape,
            eligible: z.boolean(),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      type: z.literal("counter-payment"),
      decisionId: id,
      revision: count,
      ramCost: count,
      ram: z.array(id),
    })
    .strict(),
  z
    .object({
      type: z.literal("tether-follow"),
      decisionId: id,
      revision: count,
      options: z.array(option),
    })
    .strict(),
  z
    .object({
      type: z.literal("ram-balance"),
      decisionId: id,
      revision: count,
      hosts: z.array(host),
      ram: z.array(z.object({ id, running: z.boolean() }).strict()),
    })
    .strict(),
]);
const presentation = z
  .object({
    name: id,
    rulesText: z.string(),
    artworkUrl: artworkUrlSchema.optional(),
    attack: integer.optional(),
    defence: integer.optional(),
    attackType: z.enum(["MF", "BF"]).optional(),
    effects: z
      .array(
        z
          .object({
            label: id,
            duration: z.enum(["until-end-of-turn", "while-source-in-play"]),
          })
          .strict(),
      )
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      [value.attack, value.defence, value.attackType].every(
        (part) => part === undefined,
      ) ||
      [value.attack, value.defence, value.attackType].every(
        (part) => part !== undefined,
      ),
  );
const requirementAssessment = z
  .object({
    action: z.enum(["play-character", "play-gear", "play-program"]),
    status: z.enum(["ready", "blocked", "choices-required"]),
    choicesRequired: z.boolean(),
    cost: count,
    availableRam: count,
    synergy: z.record(
      id,
      z.object({ required: count, available: count }).strict(),
    ),
    blockers: z.array(
      z
        .object({
          code: z.enum([
            "window",
            "hand",
            "prohibited",
            "timing",
            "additionalCost",
            "synergy",
            "ram",
            "attachment",
            "health",
            "choices",
          ]),
          message: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();
const contributorGroup = z
  .object({ current: count, cardIds: z.array(id), hiddenCount: count })
  .strict();
const synergyPresentation = z
  .object({
    seat,
    mainframeId: id,
    tiers: z.array(
      z
        .object({
          index: count,
          active: z.boolean(),
          replaced: z.boolean().optional(),
          operator: z.enum(["base", "independent", "or", "instead", "plus"]),
          text: id,
          persistents: z.object({ current: count, required: count }).strict(),
          factions: z.array(
            z.object({ faction: id, current: count, required: count }).strict(),
          ),
        })
        .strict(),
    ),
    contributors: z
      .object({
        persistents: contributorGroup,
        factions: z.record(id, contributorGroup),
      })
      .strict(),
    explanations: z.array(id),
  })
  .strict();

/** Browser-safe response schema; it imports no canonical engine implementation. */
export const battlefieldSnapshotSchema = z
  .object({
    view: z
      .object({
        gameLog: z.array(logEntrySchema).default([]),
        revision: count,
        reveals: z.array(
          z
            .object({
              player: seat,
              definitionVersion: z.string().regex(/^[a-f0-9]{64}$/),
              ...cardInspectionSchema.shape,
            })
            .strict(),
        ),
        seat,
        rulesVersion: id,
        engineVersion: id,
        triggerOrder: z
          .object({ player: seat, count: integer.min(2) })
          .strict()
          .nullable(),
        turn: z
          .object({
            number: integer.positive(),
            activePlayer: seat,
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
          .discriminatedUnion("type", [
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
        pendingDecision: pending.nullable(),
        players: z
          .array(
            z
              .object({
                seat,
                mainframeHealth: integer,
                bioframeHealth: integer,
                cyberdeckCount: count,
                ramDeckCount: count,
                handCount: count,
                mainframe: cards,
                ramBank: cards,
                recycleBin: cards,
                purge: cards,
                hand: cards.optional(),
                revealedHand: cards.optional(),
                cyberdeckTop: card.optional(),
              })
              .strict(),
          )
          .length(2),
        arena: cards,
        environment: cards,
        cache: cards,
        priority: z
          .object({
            player: seat.nullable(),
            mode: z.enum(["priority", "drain", "complete"]),
            stack: z.array(cacheAction),
            resolving: cacheAction.nullable(),
          })
          .strict()
          .nullable(),
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
            attackers: z.array(id),
            blockers: z.array(
              z.object({ blockerId: id, attackerId: id }).strict(),
            ),
          })
          .strict()
          .nullable(),
      })
      .strict(),
    presentations: z.record(id, presentation),
    requirements: z.record(id, requirementAssessment).optional(),
    synergy: z.array(synergyPresentation).length(2).optional(),
    decision: decision.nullable(),
    turnPrompt: turnPromptSchema.nullable(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const { view, decision: prompt } = snapshot;
    const invalid = () =>
      context.addIssue({
        code: "custom",
        message: "Inconsistent participant snapshot",
      });
    if (new Set(view.players.map((player) => player.seat)).size !== 2)
      invalid();
    for (const player of view.players) {
      if (
        player.revealedHand &&
        (player.seat === view.seat ||
          player.revealedHand.length !== player.handCount ||
          player.revealedHand.some(
            (card) => !card.definitionVersion || card.owner !== player.seat,
          ))
      )
        invalid();
      if (
        player.seat !== view.seat &&
        (player.hand !== undefined || player.cyberdeckTop !== undefined)
      )
        invalid();
      if (
        player.cyberdeckTop &&
        (!player.cyberdeckCount ||
          !player.cyberdeckTop.definitionVersion ||
          player.cyberdeckTop.owner !== player.seat)
      )
        invalid();
      if (
        player.seat === view.seat &&
        (!player.hand || player.hand.length !== player.handCount)
      )
        invalid();
    }
    const allCards = [
      ...view.arena,
      ...view.environment,
      ...view.cache,
      ...view.players.flatMap((player) => [
        ...player.mainframe,
        ...player.ramBank,
        ...player.recycleBin,
        ...player.purge,
        ...(player.hand ?? []),
        ...(player.revealedHand ?? []),
        ...(player.cyberdeckTop ? [player.cyberdeckTop] : []),
      ]),
    ];
    const visible = new Map(allCards.map((item) => [item.instanceId, item]));
    if (visible.size !== allCards.length) invalid();
    const known = (value: string) => visible.has(value);
    if (snapshot.synergy) {
      const groups = snapshot.synergy.flatMap((player) => [
        player.contributors.persistents,
        ...Object.values(player.contributors.factions),
      ]);
      if (
        new Set(snapshot.synergy.map((player) => player.seat)).size !== 2 ||
        snapshot.synergy.some(
          (player) =>
            !view.players
              .find((candidate) => candidate.seat === player.seat)
              ?.mainframe.some(
                (card) => card.instanceId === player.mainframeId,
              ) || player.tiers.some((tier, index) => tier.index !== index),
        ) ||
        groups.some(
          (group) =>
            group.cardIds.length + group.hiddenCount !== group.current ||
            new Set(group.cardIds).size !== group.cardIds.length ||
            group.cardIds.some(
              (cardId) => !visible.get(cardId)?.definitionVersion,
            ),
        )
      )
        invalid();
    }
    if (
      prompt?.type === "ducky-play" &&
      (!known(prompt.cardId) ||
        prompt.options.some(
          (o) => o.id !== prompt.cardId || o.freePlays !== undefined,
        ) ||
        !programOptionsMatchView(prompt.options, view))
    )
      invalid();
    if (
      prompt?.type === "tower" &&
      (prompt.stage === "choose"
        ? prompt.counts[0] + prompt.counts[1] > 4
        : new Set(prompt.cards.map((c) => c.id)).size !== prompt.cards.length)
    )
      invalid();
    if (prompt?.type === "eclipse-entry") {
      const hand = view.players.find((p) => p.seat === view.seat)?.hand ?? [];
      if (
        new Set(prompt.cards.map((c) => c.id)).size !== prompt.cards.length ||
        prompt.cards.some(
          (c) =>
            !hand.some((h) => h.instanceId === c.id) ||
            c.characteristics.cardType !== "character" ||
            !c.characteristics.factions.includes("DUSTRUNNER"),
        )
      )
        invalid();
    }
    if (prompt?.type === "deck-order") {
      const target = view.players.find((p) => p.seat === prompt.targetPlayer)!;
      if (
        prompt.targetPlayer === view.seat ||
        prompt.cards.length !== Math.min(5, target.cyberdeckCount) ||
        new Set(prompt.cards.map((c) => c.id)).size !== prompt.cards.length ||
        prompt.cards.some((c) => known(c.id))
      )
        invalid();
    }
    if (prompt?.type === "bailout") {
      if (
        new Set(prompt.ram).size !== prompt.ram.length ||
        prompt.count !== Math.floor(prompt.ram.length / 2) ||
        prompt.ram.some(
          (id) => !known(id) || visible.get(id)?.controller !== view.seat,
        )
      )
        invalid();
    }
    if (prompt?.type === "spirit-entry") {
      const owner = view.players.find((p) => p.seat === view.seat);
      if (
        prompt.groupIndex >= prompt.totalGroups ||
        prompt.confirmed.length !== prompt.groupIndex ||
        new Set(prompt.confirmed.map((c) => c.id)).size !==
          prompt.confirmed.length ||
        prompt.confirmed.some(
          (c) =>
            prompt.cards.some((option) => option.id === c.id) ||
            !view.players
              .find((p) => p.seat === c.player)
              ?.recycleBin.some((o) => o.instanceId === c.id),
        ) ||
        new Set(prompt.cards.map((c) => c.id)).size !== prompt.cards.length ||
        prompt.cards.some(
          (c) => !owner?.recycleBin.some((o) => o.instanceId === c.id),
        )
      )
        invalid();
    }
    if (prompt?.type === "retarget-program") {
      if (
        !view.cache.some((c) => c.instanceId === prompt.sourceId) ||
        !view.cache.some((c) => c.instanceId === prompt.targetProgramId) ||
        Boolean(prompt.options.length) === Boolean(prompt.objectSlots?.length)
      )
        invalid();
      if (
        prompt.objectSlots &&
        (prompt.originalTargets ||
          prompt.objectSlots.some((slot) =>
            slot.options.some((o, i) => o.index !== i || (i > 0 && !o.card)),
          ))
      )
        invalid();
    }
    const turnPrompt = snapshot.turnPrompt;
    if (
      view.triggerOrder &&
      (view.outcome || view.triggerOrder.player !== view.turn.activePlayer)
    )
      invalid();
    if (
      view.triggerOrder?.player === view.seat &&
      !view.pendingDecision &&
      turnPrompt?.type !== "order-triggers"
    )
      invalid();
    if (turnPrompt) {
      if (
        turnPrompt.type === "pass" &&
        turnPrompt.activations &&
        !activationOptionsMatchView(turnPrompt.activations, view)
      )
        invalid();
      if (
        turnPrompt.type === "pass" &&
        turnPrompt.programs &&
        !programOptionsMatchView(turnPrompt.programs, view)
      )
        invalid();
      if (prompt || !turnPromptMatchesView(turnPrompt, view)) invalid();
      if (turnPrompt.type === "pass" && turnPrompt.gear) {
        const own = view.players.find((player) => player.seat === view.seat)!;
        const hand = new Set([
          ...(own.hand ?? []).map((card) => card.instanceId),
          ...(own.cyberdeckTop ? [own.cyberdeckTop.instanceId] : []),
        ]);
        const bank = new Map(
          own.ramBank.map((card) => [card.instanceId, card]),
        );
        const arena = new Set(view.arena.map((card) => card.instanceId));
        if (
          new Set(turnPrompt.gear.map((option) => option.id)).size !==
          turnPrompt.gear.length
        )
          invalid();
        for (const option of turnPrompt.gear) {
          const placement = option.tether
            ? new Set(option.hosts.map((host) => host.chain)).size >= 2
            : option.hosts.length > 0;
          if (
            !hand.has(option.id) ||
            new Set(option.ram).size !== option.ram.length ||
            option.ram.some((id) => {
              const card = bank.get(id);
              return (
                !card ||
                card.controller !== view.seat ||
                card.running ||
                card.attachments.length > 0
              );
            }) ||
            new Set(option.hosts.map((host) => host.hostId)).size !==
              option.hosts.length ||
            option.hosts.some(
              (host) =>
                !arena.has(host.hostId) ||
                new Set(host.ports).size !== host.ports.length ||
                (option.tether &&
                  host.ports.some(
                    (port) => port !== "leftArm" && port !== "rightArm",
                  )),
            ) ||
            (option.unavailable === null &&
              (!placement || option.ram.length < option.cost)) ||
            (option.unavailable === "ram" &&
              option.ram.length >= option.cost) ||
            (option.unavailable === "attachment" && placement)
          )
            invalid();
        }
      }
      if (turnPrompt.type === "pass" && turnPrompt.characters) {
        const own = view.players.find((player) => player.seat === view.seat)!;
        const hand = new Set([
          ...(own.hand ?? []).map((card) => card.instanceId),
          ...(own.cyberdeckTop ? [own.cyberdeckTop.instanceId] : []),
        ]);
        const ram = new Map(own.ramBank.map((card) => [card.instanceId, card]));
        if (
          new Set(turnPrompt.characters.map((option) => option.id)).size !==
          turnPrompt.characters.length
        )
          invalid();
        for (const option of turnPrompt.characters) {
          if (
            option.runCharacters &&
            (new Set(option.runCharacters.candidates).size !==
              option.runCharacters.candidates.length ||
              option.runCharacters.candidates.some(
                (id) =>
                  !view.arena.some(
                    (c) =>
                      c.instanceId === id &&
                      c.controller === view.seat &&
                      !c.running,
                  ),
              ) ||
              (option.unavailable === null &&
                option.runCharacters.candidates.length <
                  option.runCharacters.count))
          )
            invalid();
          if (
            !hand.has(option.id) ||
            snapshot.presentations[option.id]?.attack === undefined ||
            new Set(option.ram).size !== option.ram.length ||
            option.ram.some((id) => {
              const card = ram.get(id);
              return (
                !card ||
                card.controller !== view.seat ||
                card.running ||
                card.attachments.length > 0
              );
            }) ||
            (option.unavailable === null && option.ram.length < option.cost) ||
            (option.unavailable === "ram" && option.ram.length >= option.cost)
          )
            invalid();
        }
      }
      if (
        turnPrompt.type === "order-triggers" &&
        (turnPrompt.triggers.length !== view.triggerOrder?.count ||
          turnPrompt.triggers.some(
            (trigger, index) =>
              trigger.index !== index ||
              (trigger.sourceId !== undefined && !known(trigger.sourceId)),
          ))
      )
        invalid();
      {
        if (turnPrompt.type === "force-quit") {
          const inPlay = new Set(
            [
              ...view.arena,
              ...view.environment,
              ...view.players.flatMap((player) => player.ramBank),
            ].map((card) => card.instanceId),
          );
          if (
            new Set(turnPrompt.candidates).size !==
              turnPrompt.candidates.length ||
            turnPrompt.candidates.some(
              (id) =>
                !inPlay.has(id) || visible.get(id)?.controller !== view.seat,
            )
          )
            invalid();
        }
        const arena = new Map(
          view.arena.map((card) => [card.instanceId, card]),
        );
        const unique = (ids: string[]) => new Set(ids).size === ids.length;
        const ownRefreshed = (id: string) =>
          arena.get(id)?.controller === view.seat && !arena.get(id)?.running;
        if (
          turnPrompt.type === "attack" &&
          (!unique(turnPrompt.candidates) ||
            turnPrompt.candidates.some((id) => !ownRefreshed(id)))
        )
          invalid();
        if (
          turnPrompt.type === "attack" &&
          turnPrompt.required &&
          (!unique(turnPrompt.required) ||
            turnPrompt.required.some(
              (id) => !turnPrompt.candidates.includes(id),
            ))
        )
          invalid();
        if (turnPrompt.type === "block") {
          const requiredBlockers = turnPrompt.requiredBlockers ?? [];
          if (
            !unique(requiredBlockers) ||
            requiredBlockers.some(
              (id) => !turnPrompt.blockers.some((b) => b.blockerId === id),
            )
          )
            invalid();
          const minimums = turnPrompt.minimumBlockers ?? [];
          if (
            !unique(minimums.map((e) => e.attackerId)) ||
            minimums.some((e) => !view.combat?.attackers.includes(e.attackerId))
          )
            invalid();
          if (!unique(turnPrompt.blockers.map((entry) => entry.blockerId)))
            invalid();
          for (const entry of turnPrompt.blockers)
            if (
              !ownRefreshed(entry.blockerId) ||
              !unique(entry.attackers) ||
              entry.attackers.some(
                (id) =>
                  !view.combat?.attackers.includes(id) ||
                  arena.get(id)?.controller !== view.turn.activePlayer,
              )
            )
              invalid();
        }
        if (turnPrompt.type === "assign-damage") {
          const automatic = turnPrompt.overrun ?? [];
          if (
            !unique(automatic.map((entry) => entry.attackerId)) ||
            automatic.some((entry) =>
              turnPrompt.splits.some(
                (split) => split.attackerId === entry.attackerId,
              ),
            )
          )
            invalid();
          for (const entry of automatic) {
            if (
              !view.combat?.attackers.includes(entry.attackerId) ||
              arena.get(entry.attackerId)?.controller !== view.seat ||
              !unique(entry.blockers.map((blocker) => blocker.id)) ||
              entry.blockers.some(
                (blocker) =>
                  !view.combat?.blockers.some(
                    (link) =>
                      link.attackerId === entry.attackerId &&
                      link.blockerId === blocker.id,
                  ) ||
                  arena.get(blocker.id)?.controller === view.seat ||
                  !arena.has(blocker.id) ||
                  arena.get(blocker.id)?.running,
              )
            )
              invalid();
          }
          if (!unique(turnPrompt.splits.map((entry) => entry.attackerId)))
            invalid();
          for (const entry of turnPrompt.splits) {
            if (
              !view.combat?.attackers.includes(entry.attackerId) ||
              arena.get(entry.attackerId)?.controller !== view.seat ||
              !unique(entry.blockers) ||
              entry.blockers.some(
                (id) =>
                  arena.get(id)?.controller !== 1 - view.seat ||
                  arena.get(id)?.running ||
                  !view.combat?.blockers.some(
                    (link) =>
                      link.attackerId === entry.attackerId &&
                      link.blockerId === id,
                  ),
              )
            )
              invalid();
            const attack = snapshot.presentations[entry.attackerId]?.attack;
            if (attack !== undefined && entry.total !== Math.max(0, attack))
              invalid();
          }
        }
      }
    }
    for (const item of allCards) {
      if (item.attachments.some((link) => !known(link.hostId))) invalid();
      if (
        item.definitionVersion &&
        !Object.hasOwn(snapshot.presentations, item.instanceId)
      )
        invalid();
    }
    for (const key of Object.keys(snapshot.presentations))
      if (!visible.get(key)?.definitionVersion) invalid();
    const own = view.players.find((player) => player.seat === view.seat);
    const assessable = new Set([
      ...(own?.hand ?? []).map((card) => card.instanceId),
      ...(own?.recycleBin ?? []).map((card) => card.instanceId),
      ...(own?.cyberdeckTop ? [own.cyberdeckTop.instanceId] : []),
    ]);
    for (const key of Object.keys(snapshot.requirements ?? {}))
      if (!assessable.has(key) || !visible.get(key)?.definitionVersion)
        invalid();
    for (const action of [
      ...(view.priority?.stack ?? []),
      ...(view.priority?.resolving ? [view.priority.resolving] : []),
    ])
      if (action.sourceId && !known(action.sourceId)) invalid();
    if (
      view.combat &&
      (view.combat.attackers.some((value) => !known(value)) ||
        view.combat.blockers.some(
          (item) => !known(item.attackerId) || !known(item.blockerId),
        ))
    )
      invalid();
    const choice = view.pendingDecision;
    if (choice) {
      if (
        (choice.type === "copy-ability" ||
          choice.type === "damage-prevention" ||
          choice.type === "counter-replacement" ||
          choice.type === "deck-search" ||
          choice.type === "top-cards" ||
          choice.type === "trigger-target" ||
          choice.type === "trigger-choice" ||
          choice.type === "optional-trigger" ||
          choice.type === "hand-choice" ||
          choice.type === "faction-choice" ||
          choice.type === "ram-cost-choice") &&
        (choice.ramCost !== undefined ||
          choice.hosts !== undefined ||
          choice.availableRam !== undefined ||
          choice.options !== undefined)
      )
        invalid();
      if (
        choice.type === "counter-payment" &&
        (choice.ramCost === undefined ||
          choice.hosts !== undefined ||
          choice.availableRam !== undefined ||
          choice.options !== undefined)
      )
        invalid();
      if (
        choice.type === "tether-follow" &&
        (choice.ramCost !== undefined ||
          choice.hosts !== undefined ||
          choice.availableRam !== undefined)
      )
        invalid();
      if (
        choice.type === "ram-balance" &&
        (choice.ramCost !== undefined || choice.options !== undefined)
      )
        invalid();
    }
    if (view.outcome && (choice || prompt)) invalid();
    if (choice?.sourceId && !known(choice.sourceId)) invalid();
    if (
      choice &&
      choice.player !== view.seat &&
      (choice.decisionId !== undefined ||
        choice.hosts !== undefined ||
        choice.availableRam !== undefined ||
        choice.options !== undefined)
    )
      invalid();
    if (choice?.player === view.seat && !prompt) invalid();
    if (prompt) {
      if (
        !choice ||
        choice.player !== view.seat ||
        choice.type !== prompt.type ||
        choice.decisionId !== prompt.decisionId ||
        prompt.revision !== view.revision
      )
        invalid();
      if (prompt.type === "wonderland") {
        const own = view.players.find((p) => p.seat === view.seat)!;
        if (
          !known(prompt.sourceId) ||
          prompt.candidates.some(
            (id) => !view.arena.some((c) => c.instanceId === id),
          ) ||
          new Set(prompt.candidates).size !== prompt.candidates.length
        )
          invalid();
        if (prompt.stage === "play") {
          if (
            !prompt.cardId ||
            own.cyberdeckTop?.instanceId !== prompt.cardId ||
            !prompt.play ||
            prompt.candidates.length ||
            prompt.roll < 18
          )
            invalid();
          const options = [
            ...(prompt.play?.characters ?? []),
            ...(prompt.play?.gear ?? []),
            ...(prompt.play?.programs ?? []),
          ];
          if (
            options.length !== 1 ||
            options.some((o) => o.id !== prompt.cardId)
          )
            invalid();
          if (!programOptionsMatchView(prompt.play?.programs ?? [], view))
            invalid();
          for (const o of [
            ...(prompt.play?.characters ?? []),
            ...(prompt.play?.gear ?? []),
          ])
            if (
              o.ram.some(
                (id) =>
                  !own.ramBank.some((c) => c.instanceId === id && !c.running),
              )
            )
              invalid();
          for (const o of prompt.play?.gear ?? [])
            if (
              o.hosts.some(
                (h) => !view.arena.some((c) => c.instanceId === h.hostId),
              )
            )
              invalid();
        } else if (
          prompt.cardId ||
          prompt.play ||
          !prompt.candidates.length ||
          (prompt.stage === "destroy"
            ? prompt.roll > 3 ||
              prompt.candidates.some(
                (id) => visible.get(id)?.controller !== view.seat,
              )
            : prompt.roll < 4 || prompt.roll > 17)
        )
          invalid();
      } else if (prompt.type === "copy-ability") {
        if (
          !known(prompt.sourceId) ||
          !known(prompt.targetId) ||
          prompt.sourceId !== choice?.sourceId ||
          prompt.options.some((o, i) => o.index !== i)
        )
          invalid();
      } else if (prompt.type === "damage-prevention") {
        if (
          !known(prompt.sourceId) ||
          prompt.sourceId !== choice?.sourceId ||
          new Set(prompt.options).size !== prompt.options.length ||
          (!prompt.options.includes(prompt.sourceId) &&
            !prompt.options.some((id) => /^justice:effect:\d+$/.test(id))) ||
          prompt.options.some(
            (id) =>
              id !== "other-prevention" &&
              !/^justice:effect:\d+$/.test(id) &&
              !known(id),
          )
        )
          invalid();
      } else if (prompt.type === "counter-replacement") {
        if (!known(prompt.sourceId) || prompt.sourceId !== choice?.sourceId)
          invalid();
      } else if (prompt.type === "counter-payment") {
        const bank =
          view.players.find((player) => player.seat === view.seat)?.ramBank ??
          [];
        if (
          choice?.ramCost !== prompt.ramCost ||
          new Set(prompt.ram).size !== prompt.ram.length ||
          prompt.ram.some(
            (value) =>
              !bank.some(
                (item) =>
                  item.instanceId === value &&
                  item.controller === view.seat &&
                  !item.running &&
                  !item.attachments.length,
              ),
          )
        )
          invalid();
      } else if (prompt.type === "tether-follow") {
        if (
          JSON.stringify(prompt.options) !== JSON.stringify(choice?.options) ||
          prompt.options.some((item) => item.hostId && !known(item.hostId))
        )
          invalid();
      } else if (prompt.type === "trigger-target") {
        const recycled = view.players.flatMap((p) => p.recycleBin);
        if (
          prompt.cards &&
          (new Set(prompt.cards.map((c) => c.id)).size !==
            prompt.cards.length ||
            prompt.cards.some(
              (c) =>
                !recycled.some((r) => r.instanceId === c.id) ||
                !prompt.options.some(
                  (o) => "characterId" in o && o.characterId === c.id,
                ),
            ))
        )
          invalid();
        const keys = prompt.options.map((item) =>
          "characterId" in item
            ? `character:${item.characterId}`
            : "programId" in item
              ? `program:${item.programId}`
              : "ramId" in item
                ? `ram:${item.ramId}`
                : `player:${item.player}`,
        );
        if (
          new Set(keys).size !== keys.length ||
          prompt.options.some(
            (item, index) =>
              item.index !== index ||
              ("characterId" in item &&
                ![...view.arena, ...(prompt.cards ? recycled : [])].some(
                  (card) => card.instanceId === item.characterId,
                )) ||
              ("programId" in item &&
                ![...view.arena, ...view.environment].some(
                  (card) => card.instanceId === item.programId,
                )) ||
              ("ramId" in item &&
                ![
                  ...view.arena,
                  ...view.players.flatMap((player) => player.ramBank),
                ].some((card) => card.instanceId === item.ramId)),
          )
        )
          invalid();
      } else if (prompt.type === "hand-choice") {
        const target = view.players.find(
          (player) => player.seat === prompt.targetPlayer,
        )!;
        if (
          prompt.cards.length !== target.handCount ||
          new Set(prompt.cards.map((card) => card.id)).size !==
            prompt.cards.length ||
          prompt.cards.some((card) =>
            prompt.targetPlayer === view.seat
              ? !target.hand?.some((held) => held.instanceId === card.id)
              : known(card.id) &&
                !target.revealedHand?.some(
                  (held) => held.instanceId === card.id,
                ),
          )
        )
          invalid();
      } else if (prompt.type === "top-cards") {
        const own = view.players.find((player) => player.seat === view.seat)!;
        if (
          prompt.cards.length > own.cyberdeckCount ||
          new Set(prompt.cards.map((card) => card.id)).size !==
            prompt.cards.length ||
          prompt.cards.some(
            (card) =>
              known(card.id) && card.id !== own.cyberdeckTop?.instanceId,
          ) ||
          prompt.allowFail !==
            (prompt.kind !== "divine" && prompt.kind !== "tea-party") ||
          (prompt.kind === "divine" &&
            prompt.cards.some((card) => !card.eligible))
        )
          invalid();
      } else if (prompt.type === "deck-search") {
        const own = view.players.find((player) => player.seat === view.seat)!;
        if (
          prompt.cards.length !== own.cyberdeckCount ||
          new Set(prompt.cards.map((card) => card.id)).size !==
            prompt.cards.length ||
          prompt.cards.some(
            (card) =>
              known(card.id) && card.id !== own.cyberdeckTop?.instanceId,
          )
        )
          invalid();
      } else if (prompt.type === "ram-balance") {
        if (
          JSON.stringify(prompt.hosts) !== JSON.stringify(choice?.hosts) ||
          JSON.stringify(prompt.ram.map((item) => item.id)) !==
            JSON.stringify(choice?.availableRam)
        )
          invalid();
        if (
          prompt.hosts.some(
            (item) =>
              !known(item.hostId) ||
              item.committed.some((value) => !known(value)),
          ) ||
          prompt.ram.some((item) => !known(item.id))
        )
          invalid();
      }
    }
  });

/** Public spectator snapshots share the board wire shape but carry no player controls. */
export const spectatorBattlefieldSnapshotSchema = z
  .object({
    view: battlefieldSnapshotSchema.shape.view,
    presentations: battlefieldSnapshotSchema.shape.presentations,
    synergy: battlefieldSnapshotSchema.shape.synergy,
    decision: z.null(),
    turnPrompt: z.null(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const visibleCards = [
      ...snapshot.view.arena,
      ...snapshot.view.environment,
      ...snapshot.view.cache,
      ...snapshot.view.players.flatMap((player) => [
        ...player.mainframe,
        ...player.ramBank,
        ...player.recycleBin,
        ...player.purge,
        ...(player.revealedHand ?? []),
      ]),
    ];
    const visible = new Map(
      visibleCards.map((card) => [card.instanceId, card]),
    );
    const invalidSynergy = snapshot.synergy?.some((player) => {
      const groups = [
        player.contributors.persistents,
        ...Object.values(player.contributors.factions),
      ];
      return (
        !snapshot.view.players
          .find((candidate) => candidate.seat === player.seat)
          ?.mainframe.some((card) => card.instanceId === player.mainframeId) ||
        player.tiers.some((tier, index) => tier.index !== index) ||
        groups.some(
          (group) =>
            group.cardIds.length + group.hiddenCount !== group.current ||
            new Set(group.cardIds).size !== group.cardIds.length ||
            group.cardIds.some(
              (cardId) => !visible.get(cardId)?.definitionVersion,
            ),
        )
      );
    });
    const privateZone = snapshot.view.players.some(
      (player) => player.hand || player.cyberdeckTop,
    );
    const privateDecision =
      snapshot.view.pendingDecision &&
      ("decisionId" in snapshot.view.pendingDecision ||
        "hosts" in snapshot.view.pendingDecision ||
        "availableRam" in snapshot.view.pendingDecision ||
        "options" in snapshot.view.pendingDecision);
    if (
      privateZone ||
      privateDecision ||
      invalidSynergy ||
      (snapshot.synergy &&
        new Set(snapshot.synergy.map((player) => player.seat)).size !== 2)
    )
      context.addIssue({
        code: "custom",
        message: "Spectator snapshot contains private information",
      });
  });

export const battlefieldResponseSchema = z
  .object({ matchId: z.uuid(), snapshot: battlefieldSnapshotSchema })
  .strict();
export const commandResponseSchema = z.discriminatedUnion("status", [
  z
    .object({
      matchId: z.uuid(),
      commandId: z.uuid(),
      status: z.literal("accepted"),
      acceptedRevision: count,
    })
    .strict(),
  z
    .object({
      matchId: z.uuid(),
      commandId: z.uuid(),
      status: z.literal("rejected"),
      message: z.string().min(1).max(500),
    })
    .strict(),
]);
