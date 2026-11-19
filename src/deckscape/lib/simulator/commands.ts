import { duckyAnswerSchema } from "./ducky-contract";
import { answerDucky, type DuckyEffects } from "./rubber-ducky";
import { towerAnswerSchema } from "./tower-contract";
import { answerTower } from "./the-tower";
import { eclipseAnswerSchema } from "./eclipse-contract";
import { answerEclipse, type EclipseEffects } from "./eclipse-dropship";
import { validateFreeCardPlay, consumeFreeCardPlay } from "./free-card-plays";
import { enhanceAnswerSchema } from "./enhance-contract";
import { answerEnhance } from "./enhance";
import { wonderlandAnswerSchema } from "./wonderland-contract";
import { answerWonderland } from "./wonderland";
import { answerBailout, type BailoutEffects } from "./bailout";
import {
  answerSpiritEntry,
  type SpiritEntryEffects,
} from "./spirit-entry-choice";
import {
  answerRamCostChoice,
  type RamCostChoiceEvaluation,
} from "./ram-cost-choice";
import { answerTriggerCards } from "./trigger-choice";
import { answerTriggerChoice, type TriggerChoices } from "./trigger-choice";
import {
  answerRetargetChoice,
  answerRetargetObjectChoice,
  type RetargetChoiceEvaluation,
} from "./retarget-choice";
import type { Seat } from "./setup";
import {
  answerRedirect,
  redirectSelectionSchema,
  type RedirectEvaluation,
} from "./redirect-ability";
import { answerShred, type ShredEvaluation } from "./metal-head";
import { z } from "zod";
import {
  DamagePreventionPause,
  damagePreventionDecisionSchema,
  CounterReplacementPause,
  counterReplacementDecisionSchema,
  withCounterReplacementAnswers,
  type CounterReplacementAnswer,
} from "./counter-replacement-continuation";
import { answerOptionalTrigger } from "./optional-trigger";
import { answerHandChoice, type HandChoiceEvaluation } from "./hand-choice";
import {
  answerFactionChoice,
  type FactionChoiceEvaluation,
} from "./faction-choice";
import {
  answerTriggerTarget,
  type TriggerTargetEvaluation,
} from "./trigger-target";
import type { ProgramPlayVariant } from "./program-play-option";
import type { ActivationAbilityOption } from "./activation-option";
import { answerDeckSearch, type DeckSearchEvaluation } from "./deck-search";
import { answerTopCards, type TopCardsEvaluation } from "./top-cards";
import { answerRamBalance, type RamBalanceEvaluation } from "./ram-balance";
import {
  answerTetherFollow,
  type TetherFollowEvaluation,
} from "./tether-follow";
import {
  answerCounterPayment,
  type CounterPaymentEvaluation,
} from "./conditional-counter";
import {
  activateAbility,
  abilityChoicesSchema,
  type ActivationEvaluation,
  type AbilityChoices,
} from "./activate-ability";
import {
  assertGameZones,
  concedeGame,
  abandonGame,
  type GameState,
} from "./game-state";
import { passPriority } from "./priority";
import { orderPendingTriggers } from "./rule-events";
import { chooseDrawInstall } from "./turn-actions";
import { chooseForceQuit, type ForceQuitEvaluation } from "./force-quit";
import {
  declareAttackers,
  declareBlockers,
  type CombatEvaluation,
} from "./combat";
import { resolveCombatDamage } from "./combat-damage";
import { playCharacter, type CharacterPlayEvaluation } from "./play-character";
import { playGear } from "./play-gear";
import type { AttachmentEvaluation } from "./gear-attachment";
import {
  playProgram,
  programChoicesSchema,
  type ProgramPlayEvaluation,
  type ProgramChoices,
} from "./play-program";

const id = z.string().min(1);
const ids = z.array(id);
const assignment = z.object({ blockerId: id, attackerId: id }).strict();
export const gameCommandSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    action: z.discriminatedUnion("type", [
      eclipseAnswerSchema,
      enhanceAnswerSchema,
      towerAnswerSchema,
      duckyAnswerSchema,
      wonderlandAnswerSchema,
      z
        .object({ type: z.literal("answer-bailout"), decisionId: id, ram: ids })
        .strict(),
      z
        .object({ type: z.literal("answer-spirit-entry"), decisionId: id, id })
        .strict(),
      z
        .object({
          type: z.literal("answer-damage-prevention"),
          decisionId: id,
          replacement: id,
        })
        .strict(),
      z
        .object({
          type: z.literal("answer-counter-replacement"),
          decisionId: id,
          replacement: z.enum(["armor", "spirit", "fan", "decline"]),
        })
        .strict(),
      z
        .object({
          type: z.literal("answer-redirect-ability"),
          decisionId: id,
          selection: redirectSelectionSchema,
        })
        .strict(),
      z
        .object({
          type: z.literal("answer-copy-ability"),
          decisionId: id,
          index: z.number().int().nonnegative(),
        })
        .strict(),
      z
        .object({
          type: z.literal("answer-shred-transfer"),
          decisionId: id,
          option: z.number().int().nonnegative().nullable(),
        })
        .strict(),
      z
        .object({
          type: z.literal("answer-retarget-program"),
          decisionId: id,
          index: z.number().int().nonnegative(),
        })
        .strict(),
      z
        .object({
          type: z.literal("answer-retarget-program-slots"),
          decisionId: id,
          indices: z.array(z.number().int().nonnegative()).min(1),
        })
        .strict(),
      z
        .object({
          type: z.literal("answer-hand-choice"),
          decisionId: id,
          selected: id,
        })
        .strict(),
      z
        .object({
          type: z.literal("answer-ram-cost-choice"),
          decisionId: id,
          cost: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        })
        .strict(),
      z
        .object({
          type: z.literal("answer-faction-choice"),
          decisionId: id,
          faction: id,
        })
        .strict(),
      z
        .object({
          type: z.literal("answer-trigger-cards"),
          decisionId: id,
          cards: z
            .array(id)
            .min(1)
            .max(512)
            .refine((v) => new Set(v).size === v.length),
        })
        .strict(),
      z
        .object({
          type: z.literal("answer-trigger-choice"),
          decisionId: id,
          choice: id,
        })
        .strict(),
      z
        .object({
          type: z.literal("answer-optional-trigger"),
          decisionId: id,
          useEffect: z.boolean(),
        })
        .strict(),
      z
        .object({
          type: z.literal("answer-top-cards"),
          decisionId: id,
          selected: id.nullable(),
        })
        .strict(),
      z
        .object({
          type: z.literal("answer-deck-search"),
          decisionId: id,
          selected: id.nullable(),
        })
        .strict(),
      z.object({ type: z.literal("concede") }).strict(),
      z.object({ type: z.literal("abandon") }).strict(),
      z
        .object({
          type: z.literal("answer-ram-balance"),
          decisionId: id,
          allocations: z.array(z.object({ hostId: id, ram: ids }).strict()),
          detach: ids,
        })
        .strict(),
      z
        .object({
          type: z.literal("answer-tether-follow"),
          decisionId: id,
          option: z.number().int().nonnegative(),
        })
        .strict(),
      z
        .object({
          type: z.literal("answer-counter-payment"),
          decisionId: id,
          pay: z.boolean(),
          ram: ids,
        })
        .strict(),
      z
        .object({
          type: z.literal("activate"),
          id,
          abilityId: id,
          ram: ids,
          choices: abilityChoicesSchema,
        })
        .strict(),
      z.object({ type: z.literal("pass") }).strict(),
      z
        .object({
          type: z.literal("answer-trigger-target"),
          decisionId: id,
          option: z.number().int().nonnegative(),
        })
        .strict(),
      z
        .object({
          type: z.literal("order-triggers"),
          order: z.array(z.number().int().nonnegative()),
        })
        .strict(),
      z
        .object({
          type: z.literal("draw-install"),
          choice: z.enum(["draw", "install"]),
        })
        .strict(),
      z.object({ type: z.literal("force-quit"), ids }).strict(),
      z.object({ type: z.literal("attack"), ids }).strict(),
      z
        .object({ type: z.literal("block"), assignments: z.array(assignment) })
        .strict(),
      z
        .object({
          type: z.literal("assign-damage"),
          splits: z.array(
            z
              .object({
                attackerId: id,
                assignments: z.array(
                  z
                    .object({
                      blockerId: id,
                      amount: z.number().int().nonnegative(),
                    })
                    .strict(),
                ),
              })
              .strict(),
          ),
        })
        .strict(),
      z
        .object({
          type: z.literal("play-character"),
          freePlay: z.boolean().optional(),
          id,
          ram: ids,
          runCharacters: ids.optional(),
        })
        .strict(),
      z
        .object({
          type: z.literal("play-program"),
          freePlay: z.boolean().optional(),
          id,
          ram: ids,
          choices: programChoicesSchema,
        })
        .strict(),
      z
        .object({
          type: z.literal("play-gear"),
          freePlay: z.boolean().optional(),
          id,
          ram: ids,
          targets: z.array(
            z
              .object({
                hostId: id,
                port: z.enum(["head", "body", "leftArm", "rightArm"]),
              })
              .strict(),
          ),
        })
        .strict(),
    ]),
  })
  .strict();
export type GameCommand = z.infer<typeof gameCommandSchema>;

/** Trusted engine bindings. Clients supply choices only, never evaluated permissions or costs. */
export interface GameCommandRuntime {
  tower?(
    s: GameState,
  ): ReadonlyMap<string, import("./characteristics").CardCharacteristics>;
  ducky?(): DuckyEffects;
  eclipse?(): EclipseEffects;
  enhance?(
    state: GameState,
  ): ReadonlyMap<string, import("./characteristics").CardCharacteristics>;
  wonderland?(state: GameState): import("./wonderland").WonderlandEffects;
  quoteDuringResolution?(
    state: GameState,
    user: string,
    request: import("./program-quote-contract").ProgramQuoteRequest,
  ): import("./program-quote-contract").ProgramQuote;
  bailout?(state: GameState): BailoutEffects;
  ramCostChoice?(state: GameState): RamCostChoiceEvaluation;
  factionChoice?(state: GameState): FactionChoiceEvaluation;
  retargetChoice?(state: GameState): RetargetChoiceEvaluation;
  spiritEntry?(state: GameState): SpiritEntryEffects;
  redirectChoice?(state: GameState): RedirectEvaluation;
  copyAbilityChoice?(
    state: GameState,
    user: string,
    revision: number,
    decisionId: string,
    index: number,
  ): GameState;
  shredChoice?(state: GameState): ShredEvaluation;
  handChoice?(state: GameState): HandChoiceEvaluation;
  optionalTrigger?(state: GameState): string | null;
  triggerChoice?(state: GameState): TriggerChoices | null;
  triggerTarget?(state: GameState): TriggerTargetEvaluation;
  deckSearch?(state: GameState): DeckSearchEvaluation;
  topCards?(state: GameState): TopCardsEvaluation;
  /** Explicit public choice descriptions from the pinned card bindings. */
  canPlayCyberdeckTop?(state: GameState, id: string, player: Seat): boolean;
  canReplayProgram?(state: GameState, id: string): boolean;
  programVariants?(state: GameState, id: string): ProgramPlayVariant[];
  activationOptions?(state: GameState, id: string): ActivationAbilityOption[];
  ramBalance?(state: GameState): RamBalanceEvaluation;
  tetherFollow?(state: GameState): TetherFollowEvaluation;
  counterPayment?(state: GameState): CounterPaymentEvaluation;
  activation?(
    state: GameState,
    id: string,
    abilityId: string,
    choices: AbilityChoices,
  ): ActivationEvaluation;
  recordCommand?(
    state: GameState,
    action: GameCommand["action"],
    actor: Seat,
  ): GameState;
  settle(state: GameState): GameState;
  drawRestrictions(state: GameState): {
    cannotDraw: boolean;
    cannotInstall: boolean;
  };
  forceQuit(state: GameState): ForceQuitEvaluation;
  combat(state: GameState): CombatEvaluation;
  damage(state: GameState): Parameters<typeof resolveCombatDamage>[4];
  character(state: GameState, id: string): CharacterPlayEvaluation;
  gear(
    state: GameState,
    id: string,
  ): { play: CharacterPlayEvaluation; attachment: AttachmentEvaluation };
  /** Choices are already schema-validated; the evaluator validates their rules and derives costs. */
  program(
    state: GameState,
    id: string,
    choices: ProgramChoices,
  ): ProgramPlayEvaluation;
}

/** One atomic player command plus automatic resolution produces exactly one new revision.
 * Throws without modifying canonical input; persistence commits only the returned state.
 */
export function dispatchGameCommand(
  state: GameState,
  authenticatedUserId: string,
  input: unknown,
  runtime: GameCommandRuntime,
): GameState {
  const command = gameCommandSchema.parse(input);
  if (command.expectedRevision !== state.revision)
    throw Error("Stale revision");
  if (state.outcome) throw Error("Game already ended");
  const player = state.players.findIndex(
    (p) => p.userId === authenticatedUserId,
  );
  if (player !== 0 && player !== 1) throw Error("Not a match participant");
  if (!Number.isSafeInteger(state.revision + 1))
    throw Error("Revision exceeds supported range");
  let before = state,
    original = command;
  let actor: Seat = player;
  let answers: CounterReplacementAnswer[] = [];
  const saved = state.pendingDecision;
  if (
    command.action.type === "answer-counter-replacement" ||
    command.action.type === "answer-damage-prevention"
  ) {
    if (
      (saved?.type !== "counter-replacement" &&
        saved?.type !== "damage-prevention") ||
      command.action.type !== `answer-${saved.type}` ||
      saved.id !== command.action.decisionId ||
      saved.player !== player
    )
      throw Error("Replacement decision is not authorized");
    before = JSON.parse(saved.checkpoint) as GameState;
    original = gameCommandSchema.parse(JSON.parse(saved.command));
    actor = saved.actor;
    if (
      before.pendingDecision?.type === "counter-replacement" ||
      before.pendingDecision?.type === "damage-prevention" ||
      original.action.type === "answer-counter-replacement" ||
      original.action.type === "answer-damage-prevention" ||
      before.revision >= state.revision ||
      before.engineVersion !== state.engineVersion ||
      before.rulesVersion !== state.rulesVersion ||
      before.players.some((p, i) => p.userId !== state.players[i].userId) ||
      original.expectedRevision !== before.revision
    )
      throw Error("Invalid replacement checkpoint");
    answers = [
      ...saved.answers,
      {
        fingerprint: saved.fingerprint,
        id: saved.sourceId,
        player,
        replacement: command.action.replacement,
      },
    ];
  }
  try {
    const result = withCounterReplacementAnswers(answers, () =>
      dispatchGameCommandCore(
        before,
        before.players[actor].userId,
        original,
        runtime,
      ),
    );
    result.revision = state.revision + 1;
    return result;
  } catch (error) {
    if (
      !(error instanceof CounterReplacementPause) &&
      !(error instanceof DamagePreventionPause)
    )
      throw error;
    const next = error.state;
    const prevention = error instanceof DamagePreventionPause;
    next.pendingDecision = (
      prevention
        ? damagePreventionDecisionSchema
        : counterReplacementDecisionSchema
    ).parse({
      type: prevention ? "damage-prevention" : "counter-replacement",
      ...(error.options ? { options: error.options } : {}),
      id: `${prevention ? "damage-prevention" : "counter-replacement"}:${state.revision + 1}:${answers.length}`,
      sourceId: error.pending.id,
      player: error.pending.player,
      fingerprint: error.fingerprint,
      checkpoint: JSON.stringify(before),
      command: JSON.stringify(original),
      actor,
      answers,
    });
    next.revision = state.revision + 1;
    assertGameZones(next);
    return next;
  }
}

function dispatchGameCommandCore(
  state: GameState,
  authenticatedUserId: string,
  input: unknown,
  runtime: GameCommandRuntime,
): GameState {
  const seat = state.players.findIndex(
    (player) => player.userId === authenticatedUserId,
  );
  if (seat !== 0 && seat !== 1) throw new Error("Not a match participant");
  const command = gameCommandSchema.parse(input);
  if (command.expectedRevision !== state.revision)
    throw new Error("Stale revision");
  if (state.outcome) throw new Error("Game already ended");
  if (!Number.isSafeInteger(state.revision + 1))
    throw new Error("Revision exceeds supported range");
  let next = structuredClone(state);
  const action = command.action;
  if (
    state.pendingDecision &&
    action.type !== "answer-counter-payment" &&
    action.type !== "answer-tether-follow" &&
    action.type !== "answer-ram-balance" &&
    action.type !== "answer-deck-search" &&
    action.type !== "answer-top-cards" &&
    action.type !== "answer-trigger-target" &&
    action.type !== "answer-trigger-cards" &&
    action.type !== "answer-trigger-choice" &&
    action.type !== "answer-optional-trigger" &&
    action.type !== "answer-ram-cost-choice" &&
    action.type !== "answer-faction-choice" &&
    action.type !== "answer-retarget-program" &&
    action.type !== "answer-retarget-program-slots" &&
    action.type !== "answer-redirect-ability" &&
    action.type !== "answer-eclipse-entry" &&
    action.type !== "answer-deck-order" &&
    action.type !== "answer-tower" &&
    action.type !== "answer-ducky" &&
    action.type !== "answer-wonderland" &&
    action.type !== "answer-bailout" &&
    action.type !== "answer-spirit-entry" &&
    action.type !== "answer-copy-ability" &&
    action.type !== "answer-shred-transfer" &&
    action.type !== "answer-hand-choice" &&
    action.type !== "concede" &&
    action.type !== "abandon"
  )
    throw new Error("A resolution decision must be answered first");
  const user = authenticatedUserId,
    revision = state.revision;
  switch (action.type) {
    case "answer-eclipse-entry": {
      if (!runtime.eclipse) throw Error("Eclipse runtime unavailable");
      next = answerEclipse(
        next,
        user,
        action.decisionId,
        action.selected,
        runtime.eclipse(),
      );
      break;
    }
    case "answer-ducky": {
      if (!runtime.ducky) throw Error("Ducky runtime unavailable");
      next = answerDucky(
        next,
        user,
        action.decisionId,
        action.choices,
        action.skip,
        runtime.ducky(),
      );
      break;
    }
    case "answer-tower": {
      if (!runtime.tower) throw Error("Tower runtime unavailable");
      runtime.tower(next);
      next = answerTower(
        next,
        user,
        action.decisionId,
        action.firstPile,
        action.pile,
      );
      break;
    }
    case "answer-deck-order": {
      if (!runtime.enhance) throw Error("Enhance runtime unavailable");
      runtime.enhance(next);
      next = answerEnhance(next, user, action.decisionId, action.order);
      break;
    }
    case "answer-wonderland": {
      if (!runtime.wonderland) throw Error("Wonderland runtime unavailable");
      next = answerWonderland(next, user, action, runtime.wonderland(next));
      break;
    }
    case "answer-bailout": {
      if (!runtime.bailout) throw Error("Bailout runtime unavailable");
      next = answerBailout(
        next,
        user,
        revision,
        action.decisionId,
        action.ram,
        runtime.bailout(next),
      );
      break;
    }
    case "answer-spirit-entry": {
      if (!runtime.spiritEntry) throw Error("SPIRIT entry runtime unavailable");
      next = answerSpiritEntry(
        next,
        user,
        revision,
        action.decisionId,
        action.id,
        runtime.spiritEntry(next),
      );
      break;
    }
    case "answer-damage-prevention":
    case "answer-counter-replacement":
      throw Error("Replacement answer requires its command checkpoint");
    case "answer-redirect-ability": {
      if (!runtime.redirectChoice) throw Error("Redirect runtime unavailable");
      next = answerRedirect(
        next,
        user,
        revision,
        action.decisionId,
        action.selection,
        runtime.redirectChoice(next),
      );
      break;
    }
    case "answer-copy-ability": {
      if (!runtime.copyAbilityChoice) throw Error("CTRL+C runtime unavailable");
      next = runtime.copyAbilityChoice(
        next,
        user,
        revision,
        action.decisionId,
        action.index,
      );
      break;
    }
    case "answer-shred-transfer": {
      if (!runtime.shredChoice) throw new Error("SHRED runtime unavailable");
      next = answerShred(
        next,
        user,
        revision,
        action.decisionId,
        action.option,
        runtime.shredChoice(structuredClone(next)),
      );
      break;
    }
    case "answer-retarget-program": {
      if (!runtime.retargetChoice)
        throw new Error("Retarget runtime unavailable");
      next = answerRetargetChoice(
        next,
        user,
        revision,
        action.decisionId,
        action.index,
        runtime.retargetChoice(structuredClone(next)),
      );
      break;
    }
    case "answer-retarget-program-slots": {
      if (!runtime.retargetChoice) throw Error("Retarget runtime unavailable");
      next = answerRetargetObjectChoice(
        next,
        user,
        revision,
        action.decisionId,
        action.indices,
        runtime.retargetChoice(structuredClone(next)),
      );
      break;
    }
    case "answer-hand-choice": {
      if (!runtime.handChoice)
        throw new Error("Hand choice runtime unavailable");
      next = answerHandChoice(
        next,
        user,
        revision,
        action.decisionId,
        action.selected,
        runtime.handChoice(structuredClone(next)),
      );
      break;
    }
    case "answer-ram-cost-choice": {
      if (!runtime.ramCostChoice)
        throw Error("RAM cost choice runtime unavailable");
      next = answerRamCostChoice(
        next,
        user,
        revision,
        action.decisionId,
        action.cost,
        runtime.ramCostChoice(structuredClone(next)),
      );
      break;
    }
    case "answer-faction-choice": {
      if (!runtime.factionChoice)
        throw new Error("Faction choice runtime unavailable");
      next = answerFactionChoice(
        next,
        user,
        revision,
        action.decisionId,
        action.faction,
        runtime.factionChoice(structuredClone(next)),
      );
      break;
    }
    case "answer-trigger-cards": {
      if (!runtime.triggerChoice)
        throw Error("Trigger choice runtime unavailable");
      next = answerTriggerCards(
        next,
        user,
        revision,
        action.decisionId,
        action.cards,
        runtime.triggerChoice(structuredClone(next)),
      );
      break;
    }
    case "answer-trigger-choice": {
      if (!runtime.triggerChoice)
        throw Error("Trigger choice runtime unavailable");
      next = answerTriggerChoice(
        next,
        user,
        revision,
        action.decisionId,
        action.choice,
        runtime.triggerChoice(structuredClone(next)),
      );
      break;
    }
    case "answer-optional-trigger": {
      if (!runtime.optionalTrigger)
        throw new Error("Optional trigger runtime unavailable");
      next = answerOptionalTrigger(
        next,
        user,
        revision,
        action.decisionId,
        action.useEffect,
        runtime.optionalTrigger(structuredClone(next)),
      );
      break;
    }
    case "answer-top-cards": {
      if (!runtime.topCards) throw new Error("Top-card runtime unavailable");
      next = answerTopCards(
        next,
        user,
        revision,
        action.decisionId,
        action.selected,
        runtime.topCards(structuredClone(next)),
      );
      break;
    }
    case "answer-trigger-target": {
      if (!runtime.triggerTarget)
        throw new Error("Trigger target runtime unavailable");
      next = answerTriggerTarget(
        next,
        user,
        revision,
        action.decisionId,
        action.option,
        runtime.triggerTarget(structuredClone(next)),
      );
      break;
    }
    case "answer-deck-search": {
      if (!runtime.deckSearch)
        throw new Error("Deck search runtime unavailable");
      next = answerDeckSearch(
        next,
        user,
        revision,
        action.decisionId,
        action.selected,
        runtime.deckSearch(structuredClone(next)),
      );
      break;
    }
    case "answer-ram-balance": {
      if (!runtime.ramBalance)
        throw new Error("RAM balance runtime is unavailable");
      next = answerRamBalance(
        next,
        user,
        revision,
        action.decisionId,
        action.allocations,
        action.detach,
        runtime.ramBalance(structuredClone(next)),
      );
      break;
    }
    case "answer-tether-follow": {
      if (!runtime.tetherFollow)
        throw new Error("Tether follow runtime is unavailable");
      next = answerTetherFollow(
        next,
        user,
        revision,
        action.decisionId,
        action.option,
        runtime.tetherFollow(structuredClone(next)),
      );
      break;
    }
    case "answer-counter-payment": {
      if (!runtime.counterPayment)
        throw new Error("Counter payment runtime is unavailable");
      next = answerCounterPayment(
        next,
        user,
        revision,
        action.decisionId,
        action.pay,
        action.ram,
        runtime.counterPayment(structuredClone(next)),
      );
      break;
    }
    case "activate": {
      if (!runtime.activation)
        throw new Error("Activated ability runtime is unavailable");
      next = activateAbility(
        next,
        user,
        revision,
        action.id,
        action.abilityId,
        action.ram,
        action.choices,
        runtime.activation(
          structuredClone(next),
          action.id,
          action.abilityId,
          structuredClone(action.choices),
        ),
      );
      break;
    }
    case "concede":
      next = concedeGame(next, user);
      break;
    case "abandon":
      next = abandonGame(next, user);
      break;
    case "pass":
      if (
        !next.priorityWindow ||
        next.pendingRuleEvents.length ||
        next.pendingTriggers.length
      )
        throw new Error("Priority pass unavailable");
      next.priorityWindow = passPriority(next.priorityWindow, seat);
      break;
    case "order-triggers":
      next = orderPendingTriggers(next, user, action.order);
      break;
    case "draw-install": {
      const result = chooseDrawInstall(
        next,
        user,
        revision,
        action.choice,
        runtime.drawRestrictions(structuredClone(next)),
      );
      if (!result.accepted)
        throw new Error(result.reason ?? "Draw/install rejected");
      next = result.state;
      break;
    }
    case "force-quit":
      next = chooseForceQuit(
        next,
        user,
        revision,
        action.ids,
        runtime.forceQuit(structuredClone(next)),
      );
      break;
    case "attack":
      next = declareAttackers(
        next,
        user,
        revision,
        action.ids,
        runtime.combat(structuredClone(next)),
      );
      break;
    case "block":
      next = declareBlockers(
        next,
        user,
        revision,
        action.assignments,
        runtime.combat(structuredClone(next)),
      );
      break;
    case "assign-damage":
      next = resolveCombatDamage(
        next,
        user,
        revision,
        action.splits,
        runtime.damage(structuredClone(next)),
      );
      break;
    case "play-character": {
      if (action.freePlay) validateFreeCardPlay(next, seat);
      const evaluated = runtime.character(structuredClone(next), action.id);
      next = playCharacter(
        next,
        user,
        revision,
        action.id,
        action.ram,
        action.freePlay ? { ...evaluated, ramCost: 0 } : evaluated,
        action.runCharacters,
      );
      break;
    }
    case "play-program": {
      if (action.freePlay) validateFreeCardPlay(next, seat, action.choices.x);
      const evaluated = runtime.program(
        structuredClone(next),
        action.id,
        structuredClone(action.choices),
      );
      next = playProgram(
        next,
        user,
        revision,
        action.id,
        action.ram,
        action.choices,
        action.freePlay
          ? { ...evaluated, ramCost: 0, freeDrugEffects: [] }
          : evaluated,
      );
      break;
    }
    case "play-gear": {
      if (action.freePlay) validateFreeCardPlay(next, seat);
      const evaluated = runtime.gear(structuredClone(next), action.id);
      next = playGear(
        next,
        user,
        revision,
        action.id,
        action.ram,
        action.targets,
        action.freePlay ? { ...evaluated.play, ramCost: 0 } : evaluated.play,
        evaluated.attachment,
      );
      break;
    }
  }
  if (
    (action.type === "play-character" ||
      action.type === "play-gear" ||
      action.type === "play-program") &&
    action.freePlay
  )
    next = consumeFreeCardPlay(next, seat);
  if (runtime.recordCommand) next = runtime.recordCommand(next, action, seat);
  if (!next.outcome) next = runtime.settle(next);
  next.revision = state.revision + 1;
  assertGameZones(next);
  return next;
}
