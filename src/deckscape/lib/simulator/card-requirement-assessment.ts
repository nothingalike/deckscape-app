import type { BattlefieldPresentationRuntime } from "./battlefield-presentation";
import type { GameCommandRuntime } from "./commands";
import type { GameState } from "./game-state";
import { legalGearHosts } from "./gear-attachment";
import {
  characterPlayReasons,
  type CharacterPlayProblem,
} from "./character-play-option";
import { gearPlayReasons } from "./gear-play-option";
import {
  characterPlayProblems,
  handPermanentPlayProblems,
  permanentPlayOrigin,
  type CharacterPlayEvaluation,
} from "./play-character";
import { programPlayOrigin } from "./program-replay";
import type { ProgramChoices } from "./program-choices";
import type { ProgramPlayEvaluation } from "./play-program";
import { availablePaymentRam } from "./ram";
import { evaluatePlayerSynergy } from "./synergy";
import type { PlayerGameView } from "./board-view";

export type RequirementBlockerCode =
  CharacterPlayProblem | "attachment" | "health" | "choices";

export interface CardRequirementBlocker {
  code: RequirementBlockerCode;
  message: string;
}

export interface CardRequirementAssessment {
  action: "play-character" | "play-gear" | "play-program";
  status: "ready" | "blocked" | "choices-required";
  choicesRequired: boolean;
  cost: number;
  availableRam: number;
  synergy: Record<string, { required: number; available: number }>;
  blockers: CardRequirementBlocker[];
}

const message = (
  code: RequirementBlockerCode,
  kind: "character" | "gear" | "program",
) =>
  code === "choices"
    ? "Choose this action's mode, targets, or variable values to confirm its final requirements."
    : code === "health"
      ? "Not enough health to pay this program's additional cost."
      : kind === "gear"
        ? gearPlayReasons[code]
        : code === "attachment"
          ? gearPlayReasons.attachment
          : kind === "program"
            ? {
                ...characterPlayReasons,
                hand: "Program is not in a zone you have permission to play from.",
                timing: "Non-swift program requires your empty deploy cache.",
                prohibited: "Program play is prohibited by a current effect.",
              }[code]
            : characterPlayReasons[code];

function fixedProgramEvaluation(
  state: GameState,
  id: string,
  runtime: GameCommandRuntime,
): { evaluated: ProgramPlayEvaluation; choices: ProgramChoices } | null {
  try {
    const variants = runtime.programVariants?.(structuredClone(state), id);
    if (!variants || variants.length !== 1) return null;
    const variant = variants[0];
    if (
      variant.targets.some(
        (group) => group.minimum !== 0 || group.maximum !== 0,
      ) ||
      (variant.x && variant.x.minimum !== variant.x.maximum) ||
      (variant.mainframes && variant.mainframes.length !== 1) ||
      (variant.playerTargets && variant.playerTargets.length !== 1) ||
      variant.runCharacters
    )
      return null;
    const choices: ProgramChoices = {
      modes: variant.modes,
      targets: [],
      reversed: variant.reversed,
      x: variant.x?.minimum ?? null,
      ...(variant.mainframes ? { mainframeTarget: variant.mainframes[0] } : {}),
      ...(variant.playerTargets
        ? { playerTarget: variant.playerTargets[0].player }
        : {}),
      ...(variant.cacheActionId
        ? { cacheActionId: variant.cacheActionId }
        : {}),
    };
    return {
      evaluated: runtime.program(structuredClone(state), id, choices),
      choices,
    };
  } catch {
    return null;
  }
}

function assessment(
  state: GameState,
  seat: 0 | 1,
  id: string,
  kind: "character" | "gear" | "program",
  evaluated: CharacterPlayEvaluation,
  problems: RequirementBlockerCode[],
  choicesRequired = false,
): CardRequirementAssessment {
  const object = state.objects[id];
  const card = object && evaluated.definitions.get(object.definitionVersion);
  const requirements =
    card && "requirements" in card ? card.requirements : ({} as const);
  const availableRam = availablePaymentRam(
    state,
    seat,
    evaluated.definitions,
  ).length;
  return {
    action: `play-${kind}`,
    status: problems.length
      ? "blocked"
      : choicesRequired
        ? "choices-required"
        : "ready",
    choicesRequired,
    cost: evaluated.ramCost,
    availableRam,
    synergy: Object.fromEntries(
      Object.entries(requirements).map(([faction, required]) => [
        faction,
        { required, available: evaluated.synergy[faction] ?? 0 },
      ]),
    ),
    blockers: problems.map((code) => ({ code, message: message(code, kind) })),
  };
}

/** Participant-only, revision-bound diagnostics for cards whose identity is already visible. */
export function projectCardRequirementAssessments(
  state: GameState,
  view: PlayerGameView,
  runtime: GameCommandRuntime,
  presentation: BattlefieldPresentationRuntime,
): Record<string, CardRequirementAssessment> {
  if (
    state.revision !== view.revision ||
    state.engineVersion !== view.engineVersion ||
    state.rulesVersion !== view.rulesVersion
  )
    throw new Error("Requirement assessment does not match snapshot");
  // Once a game ends there are no playable cards to assess. In particular,
  // attachment validation rejects gear after an outcome has been recorded.
  if (state.outcome) return {};
  const seat = view.seat;
  const own = view.players.find((player) => player.seat === seat);
  if (!own?.hand) throw new Error("Own hand unavailable for assessment");
  const hand = new Set(own.hand.map((card) => card.instanceId));
  const top = own.cyberdeckTop?.instanceId;
  const visibleSources = new Set([
    ...own.hand.map((card) => card.instanceId),
    ...own.recycleBin.map((card) => card.instanceId),
    ...(top ? [top] : []),
  ]);
  const effective = presentation.characteristics(structuredClone(state));
  const effectiveDefinitions = new Map(
    Object.values(state.objects).flatMap((object) => {
      const card = effective.get(object.id);
      return card ? [[object.definitionVersion, card] as const] : [];
    }),
  );
  const fallbackSynergy = evaluatePlayerSynergy(state, effective)[seat]
    .factions;
  const result: Record<string, CardRequirementAssessment> = {};
  for (const id of visibleSources) {
    const object = state.objects[id];
    const card = object && effective.get(id);
    if (
      !object ||
      !card ||
      card.cardType === "mainframe" ||
      card.cardType === "ram"
    )
      continue;
    if (card.cardType === "character") {
      if (!hand.has(id)) continue;
      const evaluated = runtime.character(structuredClone(state), id);
      result[id] = assessment(
        state,
        seat,
        id,
        "character",
        evaluated,
        characterPlayProblems(state, seat, id, evaluated),
      );
      continue;
    }
    if (card.cardType === "gear") {
      if (!hand.has(id)) continue;
      const { play, attachment } = runtime.gear(structuredClone(state), id);
      const problems: RequirementBlockerCode[] = handPermanentPlayProblems(
        state,
        seat,
        id,
        play,
        "gear",
      );
      const candidate = structuredClone(state);
      const origin = permanentPlayOrigin(state, seat, id, play);
      if (origin) {
        candidate.players[seat].zones[origin] = candidate.players[seat].zones[
          origin
        ].filter((value) => value !== id);
        candidate.cache.push(id);
        candidate.objects[id].controller = seat;
        candidate.objects[id].faceDown = false;
        const hosts = legalGearHosts(candidate, id, attachment);
        const placement = attachment.tether
          ? new Set(hosts.map((host) => host.chain)).size >= 2
          : hosts.length > 0;
        if (!placement) problems.push("attachment");
      }
      result[id] = assessment(state, seat, id, "gear", play, [
        ...new Set(problems),
      ]);
      continue;
    }
    const origin = programPlayOrigin(
      state,
      seat,
      id,
      runtime.canReplayProgram?.(state, id),
      runtime.canPlayCyberdeckTop?.(state, id, seat),
    );
    if (!origin) continue;
    const fixed = fixedProgramEvaluation(state, id, runtime);
    if (fixed) {
      const problems: RequirementBlockerCode[] = handPermanentPlayProblems(
        state,
        seat,
        id,
        fixed.evaluated,
        "program",
        origin,
        fixed.evaluated.additionalCost !== undefined ||
          fixed.evaluated.runCost !== undefined ||
          fixed.evaluated.healthCost !== undefined,
      );
      if (
        fixed.evaluated.healthCost &&
        (state.players[seat].mainframeHealth < fixed.evaluated.healthCost.MF ||
          state.players[seat].bioframeHealth < fixed.evaluated.healthCost.BF)
      )
        problems.push("health");
      result[id] = assessment(state, seat, id, "program", fixed.evaluated, [
        ...new Set(problems),
      ]);
      continue;
    }
    const evaluated: CharacterPlayEvaluation = {
      allowed: true,
      swift: card.swift,
      ramCost: card.ramCost,
      synergy: fallbackSynergy,
      definitions: effectiveDefinitions,
      ...(origin === "cyberdeck" ? { fromCyberdeck: true } : {}),
    };
    result[id] = assessment(
      state,
      seat,
      id,
      "program",
      evaluated,
      handPermanentPlayProblems(
        state,
        seat,
        id,
        evaluated,
        "program",
        origin,
        true,
      ),
      true,
    );
  }
  return result;
}
