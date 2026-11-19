import { projectBotCombat } from "./project-bot-combat";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  dispatchGameCommand,
  gameCommandSchema,
  type GameCommandRuntime,
  type GameCommand,
} from "./commands";
import { projectGame, type GameVisibility } from "./game-view";
import { assertGameZones, type GameState } from "./game-state";
import { projectSavedDecision } from "./project-decision";
import { projectTurnPrompt } from "./project-turn-prompt";
import { projectCharacterPlays } from "./project-character-plays";
import { projectGearPlays } from "./project-gear-plays";
import { projectProgramPlays } from "./project-program-plays";
import { projectActivations } from "./project-activations";
import { quoteProgramPlay } from "./program-quote";
import { quoteActivation } from "./activation-quote";
import {
  projectBattlefield,
  type BattlefieldPresentationRuntime,
} from "./battlefield-presentation";
import { projectCardRequirementAssessments } from "./card-requirement-assessment";

export interface StoredMatch {
  id: string;
  player0: string;
  player1: string;
  engineVersion: string;
  rulesVersion: string;
  revision: number;
  state: unknown;
}

export class MatchUnavailable extends Error {
  constructor() {
    super("Match unavailable");
  }
}
/** Only emitted before a commit is attempted; safe to return as a definitive rejection. */
export class MatchCommandRejected extends Error {
  constructor(message: string) {
    super(message);
  }
}
export interface CommandReceipt {
  actorId: string;
  expectedRevision: number;
  revision: number;
  command: unknown;
}
export interface MatchStore {
  load(id: string): Promise<StoredMatch | null>;
  receipt(matchId: string, commandId: string): Promise<CommandReceipt | null>;
  commit(
    matchId: string,
    commandId: string,
    actorId: string,
    command: GameCommand,
    next: GameState,
  ): Promise<{ applied: boolean; acceptedRevision: number }>;
}
export interface MatchRuntime {
  decodeState(input: unknown): GameState;
  commands: GameCommandRuntime;
  visibility: GameVisibility;
  battlefield?: BattlefieldPresentationRuntime;
}
export type MatchRuntimeResolver = (
  engineVersion: string,
  rulesVersion: string,
) => MatchRuntime;

async function authorizedMatch(
  store: MatchStore,
  matchId: string,
  userId: string,
): Promise<StoredMatch> {
  const match = await store.load(z.uuid().parse(matchId));
  if (!match || (match.player0 !== userId && match.player1 !== userId))
    throw new MatchUnavailable();
  return match;
}
/** Shared persistence boundary for participant reads and deployment recovery audits. */
export function decodeStoredMatch(
  match: StoredMatch,
  runtime: MatchRuntime,
): GameState {
  const state = runtime.decodeState(match.state);
  if (
    state.revision !== match.revision ||
    state.engineVersion !== match.engineVersion ||
    state.rulesVersion !== match.rulesVersion ||
    state.players[0].userId !== match.player0 ||
    state.players[1].userId !== match.player1
  )
    throw new Error("Invalid stored match");
  assertGameZones(state);
  return state;
}

/** Server-only service. userId must come from authenticated session verification, never request JSON. */
export async function readMatchView(
  store: MatchStore,
  resolveRuntime: MatchRuntimeResolver,
  matchId: string,
  userId: string,
) {
  const match = await authorizedMatch(store, matchId, userId);
  const runtime = resolveRuntime(match.engineVersion, match.rulesVersion);
  return projectGame(
    decodeStoredMatch(match, runtime),
    userId,
    runtime.visibility,
  );
}

/** Returns participant ids only after proving the caller belongs to the match. */
export async function readMatchParticipantIds(
  store: MatchStore,
  matchId: string,
  userId: string,
): Promise<readonly [string, string]> {
  const match = await authorizedMatch(store, matchId, userId);
  return [match.player0, match.player1];
}

/** One authorized snapshot supplies both board state and effective presentations. */
export async function readMatchBattlefield(
  store: MatchStore,
  resolveRuntime: MatchRuntimeResolver,
  matchId: string,
  userId: string,
  options: { botCombat?: boolean } = {},
) {
  const match = await authorizedMatch(store, matchId, userId);
  const runtime = resolveRuntime(match.engineVersion, match.rulesVersion);
  if (!runtime.battlefield)
    throw new Error("Pinned battlefield runtime unavailable");
  const state = decodeStoredMatch(match, runtime);
  const battlefield = projectBattlefield(
    state,
    userId,
    runtime.visibility,
    runtime.battlefield,
  );
  const turnPrompt = projectTurnPrompt(
    state,
    battlefield.view,
    runtime.commands,
    runtime.battlefield.triggerLabels,
  );
  if (turnPrompt?.type === "pass")
    turnPrompt.characters = projectCharacterPlays(
      state,
      battlefield.view,
      runtime.commands,
      runtime.battlefield,
    );
  if (turnPrompt?.type === "pass")
    turnPrompt.gear = projectGearPlays(
      state,
      battlefield.view,
      runtime.commands,
      runtime.battlefield,
    );
  if (turnPrompt?.type === "pass")
    turnPrompt.programs = projectProgramPlays(
      state,
      battlefield.view,
      runtime.commands,
      runtime.battlefield,
    );
  if (turnPrompt?.type === "pass")
    turnPrompt.activations = projectActivations(
      state,
      battlefield.view,
      runtime.commands,
      runtime.battlefield,
    );
  return {
    ...battlefield,
    ...(options.botCombat &&
    (turnPrompt?.type === "attack" || turnPrompt?.type === "block")
      ? { botCombat: projectBotCombat(state, battlefield, runtime.commands) }
      : {}),
    requirements: projectCardRequirementAssessments(
      state,
      battlefield.view,
      runtime.commands,
      runtime.battlefield,
    ),
    turnPrompt,
    decision: state.pendingDecision
      ? projectSavedDecision(
          state,
          battlefield.view,
          runtime.commands,
          runtime.battlefield,
        )
      : null,
  };
}

/** Participant-only, version-pinned preview; never accesses receipts or commits state. */
export async function readProgramPlayQuote(
  store: MatchStore,
  resolveRuntime: MatchRuntimeResolver,
  matchId: string,
  userId: string,
  input: unknown,
) {
  const match = await authorizedMatch(store, matchId, userId);
  const runtime = resolveRuntime(match.engineVersion, match.rulesVersion);
  return quoteProgramPlay(
    decodeStoredMatch(match, runtime),
    userId,
    input,
    runtime.commands,
  );
}

/** Participant-only activation preview; no receipts or persistent state changes. */
export async function readActivationQuote(
  store: MatchStore,
  resolveRuntime: MatchRuntimeResolver,
  matchId: string,
  userId: string,
  input: unknown,
) {
  const match = await authorizedMatch(store, matchId, userId);
  const runtime = resolveRuntime(match.engineVersion, match.rulesVersion);
  return quoteActivation(
    decodeStoredMatch(match, runtime),
    userId,
    input,
    runtime.commands,
  );
}

/** Deduplicate before engine execution, including after an accepted command ended the match.
 * A concurrent race is checked again by the database commit operation.
 */
export async function submitMatchCommand(
  store: MatchStore,
  resolveRuntime: MatchRuntimeResolver,
  matchId: string,
  userId: string,
  commandId: string,
  input: unknown,
) {
  z.uuid().parse(commandId);
  const match = await authorizedMatch(store, matchId, userId);
  const command = gameCommandSchema.parse(input);
  const prior = await store.receipt(matchId, commandId);
  if (prior) {
    if (
      prior.actorId !== userId ||
      prior.expectedRevision !== command.expectedRevision ||
      !isDeepStrictEqual(prior.command, command)
    )
      throw new MatchCommandRejected(
        "Command id was reused with different input",
      );
    return {
      applied: false,
      acceptedRevision: prior.revision,
    };
  }
  if (command.expectedRevision !== match.revision)
    throw new MatchCommandRejected("Stale match revision");
  const runtime = resolveRuntime(match.engineVersion, match.rulesVersion);
  const state = decodeStoredMatch(match, runtime);
  let next: GameState;
  try {
    next = dispatchGameCommand(state, userId, command, runtime.commands);
  } catch {
    throw new MatchCommandRejected(
      "Command could not be applied to the current game",
    );
  }
  const committed = await store.commit(
    matchId,
    commandId,
    userId,
    command,
    next,
  );
  return committed;
}
