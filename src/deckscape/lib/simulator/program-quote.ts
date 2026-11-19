import { validateFreeCardPlay } from "./free-card-plays";
import type { GameState } from "./game-state";
import type { GameCommandRuntime } from "./commands";
import { validateProgramChoices, programPlayProblem } from "./play-program";
import { programPlayOrigin } from "./program-replay";
import { canAct } from "./priority";
import { availablePaymentRam } from "./ram";

import {
  programQuoteRequestSchema,
  type ProgramQuote,
} from "./program-quote-contract";
export {
  programQuoteRequestSchema,
  programQuoteSchema,
  programQuoteResponseSchema,
  type ProgramQuote,
  type ProgramQuoteRequest,
} from "./program-quote-contract";

/** A preview is not a reservation or a command. It never pays costs, changes revision,
 * resolves effects or returns interpreter data. Actual play reevaluates the choices.
 */
export function quoteProgramPlay(
  state: GameState,
  userId: string,
  input: unknown,
  runtime: Pick<
    GameCommandRuntime,
    | "program"
    | "canReplayProgram"
    | "canPlayCyberdeckTop"
    | "quoteDuringResolution"
  >,
): ProgramQuote {
  const request = programQuoteRequestSchema.parse(input);
  const seat = state.players.findIndex((player) => player.userId === userId);
  if (seat !== 0 && seat !== 1) throw new Error("Not a match participant");
  const unavailable = (
    reason: Extract<ProgramQuote, { status: "unavailable" }>["reason"],
  ): ProgramQuote => ({
    status: "unavailable",
    revision: state.revision,
    request,
    reason,
  });
  if (state.revision !== request.expectedRevision) return unavailable("stale");
  if (request.freePlay && state.pendingDecision) return unavailable("window");
  if (
    (state.pendingDecision?.type === "wonderland" ||
      state.pendingDecision?.type === "ducky-play") &&
    runtime.quoteDuringResolution
  )
    return runtime.quoteDuringResolution(state, userId, request);
  if (
    state.outcome ||
    state.pendingDecision ||
    !state.triggersOrdered ||
    state.pendingRuleEvents.length ||
    state.pendingTriggers.length ||
    !state.priorityWindow ||
    !canAct(state.priorityWindow, seat)
  )
    return unavailable("window");
  if (
    !programPlayOrigin(
      state,
      seat,
      request.id,
      runtime.canReplayProgram?.(state, request.id),
      runtime.canPlayCyberdeckTop?.(state, request.id, seat),
    )
  )
    return unavailable("hand");
  let evaluated = runtime.program(
    structuredClone(state),
    request.id,
    structuredClone(request.choices),
  );
  if (request.freePlay) {
    try {
      validateFreeCardPlay(state, seat, request.choices.x);
    } catch {
      return unavailable("choices");
    }
    evaluated = { ...evaluated, ramCost: 0, freeDrugEffects: [] };
  }
  const problem = programPlayProblem(state, seat, request.id, evaluated);
  if (problem && problem !== "ram") return unavailable(problem);
  try {
    validateProgramChoices(state, request.id, request.choices, evaluated);
  } catch {
    return unavailable("choices");
  }
  const ram = availablePaymentRam(state, seat, evaluated.definitions);
  return {
    status: "ready",
    revision: state.revision,
    request,
    cost: evaluated.ramCost,
    ram,
    affordable: ram.length >= evaluated.ramCost,
  };
}
