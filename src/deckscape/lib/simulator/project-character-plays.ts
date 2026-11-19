import { availableFreeCardPlays } from "./free-card-plays";
import type { GameState } from "./game-state";
import type { PlayerGameView } from "./board-view";
import type { GameCommandRuntime } from "./commands";
import type { BattlefieldPresentationRuntime } from "./battlefield-presentation";
import type { CharacterPlayOption } from "./character-play-option";
import { characterPlayProblem } from "./play-character";
import { availablePaymentRam } from "./ram";
import { canAct } from "./priority";

/** Own-hand options only. Cost and payment data use the pinned command evaluator;
 * characteristic maps, other hands, and executable definitions never cross the API.
 */
export function projectCharacterPlays(
  state: GameState,
  view: PlayerGameView,
  commands: Pick<GameCommandRuntime, "character">,
  presentation: Pick<BattlefieldPresentationRuntime, "characteristics">,
): CharacterPlayOption[] {
  if (
    view.revision !== state.revision ||
    view.rulesVersion !== state.rulesVersion ||
    view.engineVersion !== state.engineVersion
  )
    throw new Error("Character play projection does not match its snapshot");
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
  const own = view.players.find((player) => player.seat === view.seat);
  const top = own?.cyberdeckTop?.instanceId;
  if (top && top !== state.players[view.seat].zones.cyberdeck[0])
    throw Error("Cyberdeck top projection mismatch");
  const hand = [...state.players[view.seat].zones.hand, ...(top ? [top] : [])];
  if (!hand.length) return [];
  const visible = new Set(
    view.players
      .find((player) => player.seat === view.seat)
      ?.hand?.map((card) => card.instanceId),
  );
  if (top) visible.add(top);
  const effective = presentation.characteristics(structuredClone(state));
  return hand.flatMap((id) => {
    if (!visible.has(id)) throw new Error("Own hand projection mismatch");
    const card = effective.get(id);
    if (!card) throw new Error("Hand characteristics unavailable");
    if (card.cardType !== "character") return [];
    const evaluated = commands.character(structuredClone(state), id);
    return [
      {
        id,
        ...(availableFreeCardPlays(state, view.seat)
          ? { freePlays: availableFreeCardPlays(state, view.seat) }
          : {}),
        cost: evaluated.ramCost,
        ...(evaluated.characterRunCost
          ? {
              runCharacters: {
                count: evaluated.characterRunCost.count,
                candidates: evaluated.characterRunCost.candidates,
              },
            }
          : {}),
        unavailable: characterPlayProblem(state, view.seat, id, evaluated),
        ram: availablePaymentRam(state, view.seat, evaluated.definitions),
      },
    ];
  });
}
