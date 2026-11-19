import type { GameState } from "./game-state";
import type { PlayerGameView } from "./board-view";
import type { GameCommandRuntime } from "./commands";
import type { BattlefieldPresentationRuntime } from "./battlefield-presentation";
import {
  activationSourceAvailable,
  activationWindowAvailable,
} from "./activate-ability";
import {
  activationOptionSchema,
  activationOptionsMatchView,
  type ActivationOption,
} from "./activation-option";

/** Explicit descriptions from the pinned ability bindings, including abilities
 * granted to a host. Printed prose is not interpreted to manufacture choices.
 */
export function projectActivations(
  state: GameState,
  view: PlayerGameView,
  runtime: Pick<GameCommandRuntime, "activation" | "activationOptions">,
  presentation: Pick<BattlefieldPresentationRuntime, "characteristics">,
): ActivationOption[] {
  if (
    state.revision !== view.revision ||
    state.engineVersion !== view.engineVersion ||
    state.rulesVersion !== view.rulesVersion
  )
    throw new Error("Activation choices do not match snapshot");
  if (!activationWindowAvailable(state, view.seat)) return [];
  if (!runtime.activationOptions) {
    if (runtime.activation)
      throw new Error("Activation choice runtime unavailable");
    return []; // This runtime has not enabled activation support.
  }
  if (!runtime.activation)
    throw new Error("Activated ability runtime is unavailable");
  const publicSources = [
    ...view.arena,
    ...view.environment,
    ...view.players.flatMap((player) => [
      ...player.mainframe,
      ...player.ramBank,
    ]),
  ];
  const candidates = publicSources.filter(
    (card) =>
      card.definitionVersion &&
      activationSourceAvailable(state, view.seat, card.instanceId),
  );
  if (!candidates.length) return [];
  const effective = presentation.characteristics(structuredClone(state));
  const options = candidates.flatMap((card) => {
    const id = card.instanceId;
    const current = effective.get(id);
    if (!current)
      throw new Error("Activation source characteristics unavailable");
    if (current.cardType === "gear") return [];
    const option = activationOptionSchema.parse({
      id,
      abilities: runtime.activationOptions!(structuredClone(state), id),
    });
    return option.abilities.length ? [option] : [];
  });
  if (!activationOptionsMatchView(options, view))
    throw new Error("Activation choices refer to unavailable objects");
  return options;
}
