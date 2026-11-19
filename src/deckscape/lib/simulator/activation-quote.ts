import type { GameState } from "./game-state";
import type { GameCommandRuntime } from "./commands";
import {
  activationProblem,
  activationSourceAvailable,
  activationWindowAvailable,
  availableActivationRam,
} from "./activate-ability";

import {
  activationQuoteRequestSchema,
  type ActivationQuote,
} from "./activation-quote-contract";
export {
  activationQuoteRequestSchema,
  activationQuoteSchema,
  activationQuoteResponseSchema,
  type ActivationQuote,
  type ActivationQuoteRequest,
} from "./activation-quote-contract";

/** Read-only selection preview; paying costs and spending the source happen only
 * in the authoritative command, which reevaluates the same selection and revision.
 */
export function quoteActivation(
  state: GameState,
  userId: string,
  input: unknown,
  runtime: Pick<GameCommandRuntime, "activation">,
): ActivationQuote {
  const request = activationQuoteRequestSchema.parse(input);
  const player = state.players.findIndex((p) => p.userId === userId);
  if (player !== 0 && player !== 1) throw new Error("Not a match participant");
  const unavailable = (
    reason: Extract<ActivationQuote, { status: "unavailable" }>["reason"],
  ): ActivationQuote => ({
    status: "unavailable",
    revision: state.revision,
    request,
    reason,
  });
  if (request.expectedRevision !== state.revision) return unavailable("stale");
  if (!activationWindowAvailable(state, player)) return unavailable("window");
  if (!activationSourceAvailable(state, player, request.id))
    return unavailable("source");
  if (!runtime.activation)
    throw new Error("Activated ability runtime is unavailable");
  const evaluated = runtime.activation(
    structuredClone(state),
    request.id,
    request.abilityId,
    structuredClone(request.choices),
  );
  const problem = activationProblem(
    state,
    player,
    request.id,
    request.abilityId,
    evaluated,
  );
  if (problem && problem !== "ram") return unavailable(problem);
  try {
    if (request.choices.sacrificeRam !== undefined && !evaluated.additionalCost)
      throw new Error("Unexpected additional cost selection");
    evaluated.validateChoices(
      structuredClone(state),
      structuredClone(request.choices),
    );
    evaluated.additionalCost?.validate(
      structuredClone(state),
      structuredClone(request.choices),
    );
  } catch {
    return unavailable("choices");
  }
  const ram = availableActivationRam(state, player, request.id, evaluated);
  return {
    status: "ready",
    revision: state.revision,
    request,
    cost: evaluated.ramCost,
    run: evaluated.run,
    ram,
    affordable: ram.length >= evaluated.ramCost,
  };
}
