import { resolvePsychosis, type PsychosisEvaluation } from "./psychosis";
import { assertGameZones, type GameState } from "./game-state";
import { recordCardPlay } from "./card-play-history";
import type { CardCharacteristics } from "./characteristics";
import { payRam, moveCommittedRamToArena, availablePaymentRam } from "./ram";
import { addPriorityAction, canAct } from "./priority";
import type { Seat } from "./setup";
import { requireCurrentCardSource } from "./cache-source";
import { advanceObjectIncarnation } from "./object-incarnation";
import { meetsFactionRequirements } from "./synergy";
import {
  captureEventObservation,
  type EventObservation,
} from "./event-observation";
import {
  characterPlayReasons,
  type CharacterPlayProblem,
} from "./character-play-option";

export interface CharacterEvent extends Partial<EventObservation> {
  type: "character-played" | "character-entered";
  player: Seat;
  instanceId: string;
  factions: string[];
}
export interface CharacterPlayEvaluation {
  /** Server-evaluated permission; commands cannot grant this. Exact top is rechecked below. */
  fromCyberdeck?: boolean;
  characterRunCost?: {
    candidates: string[];
    count: number;
    psychosis: PsychosisEvaluation;
  };
  /** Trusted effective characteristics and permissions from the rules interpreter. */
  definitions: ReadonlyMap<string, CardCharacteristics>;
  /** Current object identities, including face-down and non-iconic copy effects. */
  characteristics?: ReadonlyMap<string, CardCharacteristics>;
  allowed: boolean;
  swift: boolean;
  ramCost: number;
  synergy: Readonly<Record<string, number>>;
}

export function permanentPlayOrigin(
  state: GameState,
  seat: Seat,
  id: string,
  evaluated: CharacterPlayEvaluation,
): "hand" | "cyberdeck" | null {
  if (state.players[seat].zones.hand.includes(id)) return "hand";
  return evaluated.fromCyberdeck &&
    state.players[seat].zones.cyberdeck[0] === id
    ? "cyberdeck"
    : null;
}

/** Shared preflight for authoritative play and its public option. No movement,
 * payment, random draws, or replacement execution happens during availability checks.
 */
export function handPermanentPlayProblems(
  state: GameState,
  seat: Seat,
  instanceId: string,
  evaluated: CharacterPlayEvaluation,
  kind: "character" | "gear" | "program",
  origin: "hand" | "recycleBin" | "cyberdeck" = "hand",
  additionalCostSupported = false,
): CharacterPlayProblem[] {
  if (!Number.isSafeInteger(evaluated.ramCost) || evaluated.ramCost < 0)
    throw new Error(`Invalid evaluated ${kind} cost`);
  const problems: CharacterPlayProblem[] = [];
  const priorityWindow = state.priorityWindow;
  if (
    state.outcome ||
    state.pendingDecision ||
    !state.triggersOrdered ||
    !priorityWindow ||
    !canAct(priorityWindow, seat) ||
    state.pendingRuleEvents.length ||
    state.pendingTriggers.length
  )
    problems.push("window");
  const object = state.objects[instanceId];
  const card = object && evaluated.definitions.get(object.definitionVersion);
  if (
    !card ||
    card.cardType !== kind ||
    !(origin === "recycleBin"
      ? state.players[seat].zones.recycleBin.includes(instanceId)
      : permanentPlayOrigin(state, seat, instanceId, evaluated))
  )
    return ["hand"];
  if (!evaluated.allowed) problems.push("prohibited");
  // CR 109.3 and 205.4b.1: controlled Iconic objects include cached cards.
  const identity = (id: string) =>
    evaluated.characteristics?.get(id) ??
    evaluated.definitions.get(state.objects[id].definitionVersion);
  const incoming = identity(instanceId)!;
  if (
    incoming.iconic &&
    [
      ...state.cache,
      ...state.arena,
      ...state.environment,
      ...state.players.flatMap((p) => [
        ...p.zones.mainframe,
        ...p.zones.ramBank,
      ]),
    ].some(
      (id) =>
        id !== instanceId &&
        state.objects[id].controller === seat &&
        identity(id)?.iconic &&
        identity(id)?.name === incoming.name,
    )
  )
    problems.push("prohibited");
  if (
    !evaluated.swift &&
    (state.turn.step !== "deploy" ||
      state.turn.activePlayer !== seat ||
      state.cache.length ||
      priorityWindow?.stack.length)
  )
    problems.push("timing");
  if (card.additionalPlayCostText && !additionalCostSupported)
    problems.push("additionalCost");
  if (!meetsFactionRequirements(evaluated.synergy, card.requirements))
    problems.push("synergy");
  if (
    availablePaymentRam(state, seat, evaluated.definitions).length <
    evaluated.ramCost
  )
    problems.push("ram");
  return problems;
}

export function handPermanentPlayProblem(
  state: GameState,
  seat: Seat,
  instanceId: string,
  evaluated: CharacterPlayEvaluation,
  kind: "character" | "gear" | "program",
  origin: "hand" | "recycleBin" | "cyberdeck" = "hand",
  additionalCostSupported = false,
): CharacterPlayProblem | null {
  return (
    handPermanentPlayProblems(
      state,
      seat,
      instanceId,
      evaluated,
      kind,
      origin,
      additionalCostSupported,
    )[0] ?? null
  );
}

export function characterPlayProblem(
  state: GameState,
  seat: Seat,
  instanceId: string,
  evaluated: CharacterPlayEvaluation,
): CharacterPlayProblem | null {
  if (
    evaluated.characterRunCost &&
    evaluated.characterRunCost.candidates.length <
      evaluated.characterRunCost.count
  )
    return "additionalCost";
  return handPermanentPlayProblem(
    state,
    seat,
    instanceId,
    evaluated,
    "character",
    "hand",
    !!evaluated.characterRunCost,
  );
}

export function characterPlayProblems(
  state: GameState,
  seat: Seat,
  instanceId: string,
  evaluated: CharacterPlayEvaluation,
): CharacterPlayProblem[] {
  const runCostUnavailable =
    evaluated.characterRunCost &&
    evaluated.characterRunCost.candidates.length <
      evaluated.characterRunCost.count;
  return [
    ...(runCostUnavailable ? (["additionalCost"] as const) : []),
    ...handPermanentPlayProblems(
      state,
      seat,
      instanceId,
      evaluated,
      "character",
      "hand",
      !!evaluated.characterRunCost,
    ),
  ].filter((problem, index, all) => all.indexOf(problem) === index);
}

/** Base character play. Additional costs require their dedicated simultaneous-payment handler. */
export function playCharacter(
  state: GameState,
  userId: string,
  revision: number,
  instanceId: string,
  selectedRam: string[],
  evaluated: CharacterPlayEvaluation,
  runCharacters: string[] = [],
): GameState {
  if (state.outcome || revision !== state.revision)
    throw new Error("Ended game or stale revision");
  const seat = state.players.findIndex((player) => player.userId === userId);
  if (seat !== 0 && seat !== 1) throw new Error("Not a match participant");
  const problem = characterPlayProblem(state, seat, instanceId, evaluated);
  if (problem) throw new Error(characterPlayReasons[problem]);
  const object = state.objects[instanceId];
  const card = evaluated.definitions.get(object.definitionVersion)!;
  const runCost = evaluated.characterRunCost;
  if (
    runCharacters.length !== (runCost?.count ?? 0) ||
    new Set(runCharacters).size !== runCharacters.length ||
    runCharacters.some((id) => !runCost?.candidates.includes(id))
  )
    throw Error("Invalid character run cost");
  const next = structuredClone(state);
  next.objects[instanceId].controller = seat;
  next.objects[instanceId].faceDown = false;
  const origin = permanentPlayOrigin(state, seat, instanceId, evaluated)!;
  next.players[seat].zones[origin] = next.players[seat].zones[origin].filter(
    (id) => id !== instanceId,
  );
  next.cache.push(instanceId);
  advanceObjectIncarnation(next, instanceId, true);
  // All temporary movement/payment remains private to this transaction until every check succeeds.
  let paid = payRam(
    next,
    seat,
    evaluated.ramCost,
    selectedRam,
    evaluated.definitions,
    instanceId,
    runCharacters,
  );
  paid.priorityWindow = addPriorityAction(state.priorityWindow!, {
    id: `play:${state.revision}:${instanceId}`,
    kind: "card",
    controller: seat,
    sourceId: instanceId,
    sourceIncarnation: paid.objects[instanceId].incarnation,
  });
  paid.pendingRuleEvents.push({
    type: "character-played",
    ...captureEventObservation(paid),
    player: seat,
    instanceId,
    factions: [...card.factions],
  });
  recordCardPlay(paid, instanceId, seat, card);
  if (runCost)
    paid = resolvePsychosis(
      paid,
      state,
      runCharacters,
      { type: "external-run" },
      runCost.psychosis,
    );
  paid.revision++;
  assertGameZones(paid);
  return paid;
}

/** Called by the cache interpreter after applicable replacement decisions, before enter triggers. */
export function resolveCharacterEntry(
  state: GameState,
  definitions: ReadonlyMap<string, CardCharacteristics>,
  prepareEntry?: (state: GameState, id: string) => GameState,
): GameState {
  const action = state.priorityWindow?.resolving;
  if (
    state.outcome ||
    !action ||
    action.kind !== "card" ||
    state.pendingRuleEvents.length ||
    state.pendingTriggers.length
  )
    throw new Error("No character resolution ready");
  const object = state.objects[action.sourceId];
  requireCurrentCardSource(state, action);
  const card = object && definitions.get(object.definitionVersion);
  if (
    !card ||
    card.cardType !== "character" ||
    !state.cache.includes(object.id)
  )
    throw new Error("Resolving card is not a character");
  let next = structuredClone(state);
  next.cache = next.cache.filter((id) => id !== object.id);
  next.arena.push(object.id);
  advanceObjectIncarnation(next, object.id, true);
  next.objects[object.id].running = false;
  next.objects[object.id].abilitySpent = false;
  next = moveCommittedRamToArena(next, object.id);
  if (prepareEntry) next = prepareEntry(next, object.id);
  next.pendingRuleEvents.push({
    type: "character-entered",
    ...captureEventObservation(next),
    player: object.controller,
    instanceId: object.id,
    factions: [...card.factions],
  });
  assertGameZones(next);
  return next;
}
