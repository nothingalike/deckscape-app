import { availableFreeCardPlays } from "./free-card-plays";
import type { GameState } from "./game-state";
import { replayPermission } from "./program-replay";
import type { PlayerGameView } from "./board-view";
import type { GameCommandRuntime } from "./commands";
import type { BattlefieldPresentationRuntime } from "./battlefield-presentation";
import { canAct } from "./priority";
import {
  programPlayOptionSchema,
  programOptionsMatchView,
  type ProgramPlayOption,
} from "./program-play-option";

export function projectProgramPlays(
  state: GameState,
  view: PlayerGameView,
  runtime: Pick<
    GameCommandRuntime,
    "programVariants" | "canReplayProgram" | "canPlayCyberdeckTop"
  >,
  presentation: Pick<BattlefieldPresentationRuntime, "characteristics">,
): ProgramPlayOption[] {
  if (
    state.revision !== view.revision ||
    state.engineVersion !== view.engineVersion ||
    state.rulesVersion !== view.rulesVersion
  )
    throw new Error("Program choices do not match snapshot");
  if (
    state.outcome ||
    state.pendingDecision ||
    !state.triggersOrdered ||
    state.pendingRuleEvents.length ||
    state.pendingTriggers.length ||
    !state.priorityWindow ||
    !canAct(state.priorityWindow, view.seat)
  )
    return [];
  const top = view.players.find((p) => p.seat === view.seat)?.cyberdeckTop
    ?.instanceId;
  if (
    top &&
    (top !== state.players[view.seat].zones.cyberdeck[0] ||
      !runtime.canPlayCyberdeckTop?.(state, top, view.seat))
  )
    throw Error("Cyberdeck top projection mismatch");
  const candidates = [
    ...(top ? [top] : []),
    ...state.players[view.seat].zones.hand,
    ...state.players[view.seat].zones.recycleBin.filter(
      (id) =>
        replayPermission(state, view.seat, id) ||
        runtime.canReplayProgram?.(state, id),
    ),
  ];
  if (!candidates.length) return [];
  const effective = presentation.characteristics(structuredClone(state));
  const options = candidates.flatMap((id) => {
    const card = effective.get(id);
    if (!card) throw new Error("Program source characteristics unavailable");
    if (card.cardType !== "program") return [];
    if (!runtime.programVariants)
      throw new Error("Program choice runtime unavailable");
    const option = programPlayOptionSchema.parse({
      id,
      ...(state.players[view.seat].zones.recycleBin.includes(id)
        ? { origin: "recycleBin" }
        : id === top
          ? { origin: "cyberdeck" }
          : {}),
      ...(availableFreeCardPlays(state, view.seat)
        ? { freePlays: availableFreeCardPlays(state, view.seat) }
        : {}),
      variants: runtime.programVariants(structuredClone(state), id),
    });
    for (const variant of option.variants) {
      if (
        variant.modes.length !== (card.chooseModes ?? 0) ||
        variant.modes.some((index) => index >= (card.modes?.length ?? 0)) ||
        (card.subtype === "protocol") !== (variant.mainframes !== null)
      )
        throw new Error("Program choices do not match effective card");
    }
    return [option];
  });
  if (!programOptionsMatchView(options, view))
    throw new Error("Program choices refer to unavailable objects");
  return options;
}
