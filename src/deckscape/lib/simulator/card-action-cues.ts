import type { CardRequirementAssessment } from "./card-requirement-assessment";
import { turnPromptMatchesView, type TurnPrompt } from "./turn-prompt";
import type { PlayerGameView } from "./board-view";
import type { ActivationQuote } from "./activation-quote-contract";

export type CardActionCue = "playable" | "choices" | "unavailable";
export const cardActionCueLabels: Record<CardActionCue, string> = {
  playable: "Playable now",
  choices: "Choose action to check requirements",
  unavailable: "No available action now; inspect for details",
};

/** Presentation only: diagnostics never create an action absent from the current prompt. */
export function cardActionCues(
  view: PlayerGameView,
  prompt: TurnPrompt | null,
  requirements: Readonly<Record<string, CardRequirementAssessment>>,
  disabled = false,
  activationQuotes: Readonly<
    Record<string, Readonly<Record<string, ActivationQuote | "error">>>
  > = {},
): Record<string, CardActionCue> {
  if (
    disabled ||
    !prompt ||
    prompt.type !== "pass" ||
    !turnPromptMatchesView(prompt, view)
  )
    return {};
  const result: Record<string, CardActionCue> = {};
  for (const [id, assessment] of Object.entries(requirements))
    if (assessment.status === "blocked") result[id] = "unavailable";
  for (const option of [...(prompt.characters ?? []), ...(prompt.gear ?? [])])
    result[option.id] = option.unavailable ? "unavailable" : "playable";
  for (const option of prompt.programs ?? []) {
    const assessment = requirements[option.id];
    result[option.id] =
      !option.variants.length || assessment?.status === "blocked"
        ? "unavailable"
        : assessment?.status === "ready" &&
            !assessment.choicesRequired &&
            option.variants.length
          ? "playable"
          : "choices";
  }
  for (const option of prompt.activations ?? []) {
    const abilityCues = option.abilities.flatMap((ability): CardActionCue[] => {
      if (!ability.variants.length) return [];
      const variant = ability.variants[0];
      const fixedChoices = ability.variants.length === 1 &&
        !variant.targets.length &&
        (!variant.x || variant.x.minimum === variant.x.maximum) &&
        (!variant.playerTargets || variant.playerTargets.length === 1);
      const quote = activationQuotes[option.id]?.[ability.abilityId];
      if (
        !fixedChoices || !quote || quote === "error" ||
        quote.revision !== view.revision ||
        quote.request.expectedRevision !== view.revision ||
        quote.request.id !== option.id ||
        quote.request.abilityId !== ability.abilityId
      ) return ["choices"];
      if (quote.status === "ready")
        return [quote.affordable ? "playable" : "unavailable"];
      return [quote.reason === "stale" ? "choices" : "unavailable"];
    });
    if (!abilityCues.length) continue;
    const cues = [result[option.id], ...abilityCues];
    result[option.id] = cues.includes("playable")
      ? "playable"
      : cues.includes("choices")
        ? "choices"
        : "unavailable";
  }
  return result;
}
