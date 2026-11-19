import { z } from "zod";
import { recordObjectTargeting } from "./targeting-events";
import {
  captureEventObservation,
  type EventObservation,
} from "./event-observation";
import { programPlayOrigin, replayPermission } from "./program-replay";
import { captureTargetIncarnations } from "./action-targets";
import { advanceObjectIncarnation } from "./object-incarnation";
import { assertGameZones, type GameState } from "./game-state";
import { recordCardPlay } from "./card-play-history";
import { applyHealthChanges } from "./health";
import {
  handPermanentPlayProblem,
  type CharacterPlayEvaluation,
} from "./play-character";
import { validateProtocolTarget, type ProtocolEvaluation } from "./protocol";
import { payRam } from "./ram";
import { addPriorityAction } from "./priority";
import type { Seat } from "./setup";
import { resolvePsychosis, type PsychosisEvaluation } from "./psychosis";

export const programPlayReasons = {
  window: "No action window or priority for this play.",
  hand: "Program is not in a zone you have permission to play from.",
  prohibited: "Program play is prohibited by a current effect.",
  timing: "Non-swift program requires your empty deploy cache.",
  additionalCost: "This program's additional cost is not supported yet.",
  synergy: "Insufficient faction synergy.",
  ram: "Not enough available refreshed RAM.",
  health: "Not enough health to pay this program's additional cost.",
} as const;

import { programChoicesSchema, type ProgramChoices } from "./program-choices";
export { programChoicesSchema, type ProgramChoices } from "./program-choices";

export interface ProgramPlayEvaluation extends CharacterPlayEvaluation {
  /** Only a bound ability-targeting script may announce a pending ability target. */
  allowAbilityTarget?: boolean;
  additionalCost?: {
    validate(s: GameState, c: ProgramChoices): void;
    pay(s: GameState, c: ProgramChoices): GameState;
  };
  replayFromBin?: boolean;
  freeDrugEffects?: string[];
  healthCost?: { MF: number; BF: number };
  purgeOnResolution?: boolean;
  /** Selected characters run simultaneously with RAM payment; they are costs, not targets. */
  runCost?: { sources: readonly string[]; psychosis: PsychosisEvaluation };
  /** Effective announcement traits from the retained evaluator, before later effects can change them. */
  announcement?: { factions: string[]; tags: string[] };
  allowReversed: boolean;
  faceDown: boolean;
  protocol?: ProtocolEvaluation;
  /** Required card-specific validation of targets, X, and permitted choices. */
  validateChoices(
    state: GameState,
    instanceId: string,
    choices: ProgramChoices,
  ): void;
}
export interface ProgramEvent extends Partial<EventObservation> {
  type: "program-played";
  subtype: "script" | "protocol" | "environment";
  player: Seat;
  instanceId: string;
  factions: string[];
  tags: string[];
  reversed: boolean;
}

/** Validate announcement choices without payment, movement or effect resolution. */
export function validateProgramChoices(
  state: GameState,
  id: string,
  choices: ProgramChoices,
  evaluated: ProgramPlayEvaluation,
): void {
  if (choices.sacrificeCharacters !== undefined && !evaluated.additionalCost)
    throw Error("Unexpected character destruction cost");
  evaluated.additionalCost?.validate(state, choices);
  const object = state.objects[id];
  const card = object && evaluated.definitions.get(object.definitionVersion);
  if (card?.cardType !== "program") throw new Error("Card is not a program");
  if (choices.cacheActionId !== undefined && !evaluated.allowAbilityTarget)
    throw Error("Program cannot target a pending ability");
  if (choices.runCharacters !== undefined && !evaluated.runCost)
    throw new Error("Unexpected program run cost");
  if (
    evaluated.runCost &&
    (choices.runCharacters?.length !== evaluated.runCost.sources.length ||
      choices.runCharacters.some(
        (id, index) => id !== evaluated.runCost!.sources[index],
      ))
  )
    throw new Error("Program run cost does not match its choices");
  if (choices.reversed && !evaluated.allowReversed)
    throw new Error("Reversed play is not permitted");
  if (
    choices.modes.length !== (card.chooseModes ?? 0) ||
    new Set(choices.modes).size !== choices.modes.length ||
    choices.modes.some((i) => i >= (card.modes?.length ?? 0))
  )
    throw new Error("Invalid program modes");
  if (card.subtype === "protocol") {
    if (!choices.mainframeTarget || !evaluated.protocol)
      throw new Error("Protocol target required");
    validateProtocolTarget(
      state,
      id,
      choices.mainframeTarget,
      evaluated.protocol,
    );
  } else if (choices.mainframeTarget)
    throw new Error("Unexpected protocol target");
  evaluated.validateChoices(
    structuredClone(state),
    id,
    structuredClone(choices),
  );
}

/** Base program announcement/payment. Additional costs use dedicated payment handlers. */
export function programPlayProblem(
  state: GameState,
  seat: Seat,
  id: string,
  evaluated: ProgramPlayEvaluation,
) {
  const origin = programPlayOrigin(
    state,
    seat,
    id,
    evaluated.replayFromBin,
    evaluated.fromCyberdeck,
  );
  if (!origin) return "hand" as const;
  if (evaluated.healthCost) {
    const cost = evaluated.healthCost;
    if (![cost.MF, cost.BF].every((n) => Number.isSafeInteger(n) && n >= 0))
      throw Error("Invalid program health cost");
    if (
      state.players[seat].mainframeHealth < cost.MF ||
      state.players[seat].bioframeHealth < cost.BF
    )
      return "health" as const;
  }
  return handPermanentPlayProblem(
    state,
    seat,
    id,
    evaluated,
    "program",
    origin,
    evaluated.additionalCost !== undefined ||
      evaluated.runCost !== undefined ||
      evaluated.healthCost !== undefined,
  );
}

export function playProgram(
  state: GameState,
  userId: string,
  revision: number,
  id: string,
  ram: string[],
  input: unknown,
  evaluated: ProgramPlayEvaluation,
): GameState {
  const choices = programChoicesSchema.parse(input);
  if (state.outcome || revision !== state.revision)
    throw new Error("Ended game or stale revision");
  const seat = state.players.findIndex((p) => p.userId === userId);
  if (seat !== 0 && seat !== 1) throw new Error("Not a match participant");
  const problem = programPlayProblem(state, seat, id, evaluated);
  if (problem) throw new Error(programPlayReasons[problem]);
  const object = state.objects[id];
  const card = object && evaluated.definitions.get(object.definitionVersion);
  if (card?.cardType !== "program") throw new Error("Card is not a program");
  validateProgramChoices(state, id, choices, evaluated);
  const announcement = z
    .object({
      factions: z.array(z.string().min(1)),
      tags: z.array(z.string().min(1)),
    })
    .strict()
    .parse(
      evaluated.announcement ?? { factions: card.factions, tags: card.tags },
    );
  const origin = programPlayOrigin(
    state,
    seat,
    id,
    evaluated.replayFromBin,
    evaluated.fromCyberdeck,
  )!;
  const replay =
    origin === "recycleBin" ? replayPermission(state, seat, id) : undefined;
  const next = structuredClone(state);
  next.players[seat].zones[origin] = next.players[seat].zones[origin].filter(
    (cardId) => cardId !== id,
  );
  next.cache.push(id);
  advanceObjectIncarnation(next, id, true);
  next.objects[id].controller = seat;
  next.objects[id].faceDown = evaluated.faceDown;
  if (evaluated.faceDown && card.tags.includes("TROJAN"))
    next.objects[id].trojanPlayedTurn = state.turn.number;
  if (evaluated.freeDrugEffects?.length)
    next.triggerEffects = next.triggerEffects.filter(
      (e) => !evaluated.freeDrugEffects!.includes(e.id),
    );
  const paymentEventStart = next.pendingRuleEvents.length;
  let paid = payRam(
    next,
    seat,
    evaluated.ramCost,
    ram,
    evaluated.definitions,
    undefined,
    evaluated.runCost?.sources,
  );
  if (evaluated.additionalCost)
    paid = evaluated.additionalCost.pay(paid, choices);
  if (evaluated.healthCost) {
    paid = applyHealthChanges(
      paid,
      id,
      (["MF", "BF"] as const).map((channel) => ({
        player: seat,
        channel,
        amount: evaluated.healthCost![channel],
        operation: "lose" as const,
        cause: "payment" as const,
      })),
    );
    for (let i = paymentEventStart; i < paid.pendingRuleEvents.length; i++)
      paid.pendingRuleEvents[i] = {
        ...paid.pendingRuleEvents[i],
        ...captureEventObservation(paid),
      };
  }
  paid.priorityWindow = addPriorityAction(state.priorityWindow!, {
    id: `play:${state.revision}:${id}`,
    kind: "card",
    controller: seat,
    sourceId: id,
    programChoices: choices,
    ...(replay || evaluated.purgeOnResolution
      ? { purgeOnResolution: true as const }
      : {}),
    sourceIncarnation: paid.objects[id].incarnation,
    targetIncarnations: captureTargetIncarnations(state, [
      ...choices.targets,
      ...(choices.mainframeTarget ? [choices.mainframeTarget] : []),
    ]),
    ...(choices.mainframeTarget
      ? { protocolTarget: choices.mainframeTarget }
      : {}),
  });
  paid.pendingRuleEvents.push({
    type: "program-played",
    subtype: card.subtype,
    ...captureEventObservation(paid),
    player: seat,
    instanceId: id,
    factions: [...new Set(announcement.factions)],
    tags: [...new Set(announcement.tags)],
    reversed: choices.reversed,
  });
  // A successfully paid announcement counts even if later countered. Quotes and failed plays do not.
  recordObjectTargeting(paid, id, seat, [
    ...choices.targets,
    ...(choices.mainframeTarget ? [choices.mainframeTarget] : []),
  ]);
  paid.programHistory?.push({
    turn: state.turn.number,
    player: seat,
    actionId: `play:${state.revision}:${id}`,
    instanceId: id,
    incarnation: paid.objects[id].incarnation,
    definitionVersion: object.definitionVersion,
    factions: [...new Set(announcement.factions)],
    tags: [...new Set(announcement.tags)],
  });
  recordCardPlay(paid, id, seat, { ...card, ...announcement });
  if (evaluated.runCost?.sources.length)
    // CR 702.11e: this program causes other characters to run; failed checks do not cancel it.
    paid = resolvePsychosis(
      paid,
      state,
      evaluated.runCost.sources,
      { type: "external-run" },
      evaluated.runCost.psychosis,
    );
  paid.revision++;
  assertGameZones(paid);
  return paid;
}
