import { availableFreeCardPlays } from "./free-card-plays";
import type { GameState } from "./game-state";
import type { PlayerGameView } from "./board-view";
import type { GameCommandRuntime } from "./commands";
import type { BattlefieldPresentationRuntime } from "./battlefield-presentation";
import type { GearPlayOption } from "./gear-play-option";
import {
  handPermanentPlayProblem,
  permanentPlayOrigin,
} from "./play-character";
import { availablePaymentRam } from "./ram";
import { canAct } from "./priority";
import { legalGearHosts } from "./gear-attachment";

export function projectGearPlays(
  state: GameState,
  view: PlayerGameView,
  commands: Pick<GameCommandRuntime, "gear">,
  presentation: Pick<BattlefieldPresentationRuntime, "characteristics">,
): GearPlayOption[] {
  if (
    view.revision !== state.revision ||
    view.rulesVersion !== state.rulesVersion ||
    view.engineVersion !== state.engineVersion
  )
    throw new Error("Gear play projection does not match its snapshot");
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
    if (card.cardType !== "gear") return [];
    const { play, attachment } = commands.gear(structuredClone(state), id);
    const problem = handPermanentPlayProblem(
      state,
      view.seat,
      id,
      play,
      "gear",
    );
    // Validate the same prospective controller/cache location as announcement, without
    // applying entry, payment, triggers or replacement effects to canonical state.
    const candidate = structuredClone(state);
    const origin = permanentPlayOrigin(state, view.seat, id, play);
    if (!origin) throw Error("Gear source is unavailable");
    candidate.players[view.seat].zones[origin] = candidate.players[
      view.seat
    ].zones[origin].filter((value) => value !== id);
    candidate.cache.push(id);
    candidate.objects[id].controller = view.seat;
    candidate.objects[id].faceDown = false;
    const hosts = legalGearHosts(candidate, id, attachment);
    const placement = attachment.tether
      ? new Set(hosts.map((host) => host.chain)).size >= 2
      : hosts.length > 0;
    return [
      {
        id,
        ...(availableFreeCardPlays(state, view.seat)
          ? { freePlays: availableFreeCardPlays(state, view.seat) }
          : {}),
        cost: play.ramCost,
        ram: availablePaymentRam(state, view.seat, play.definitions),
        tether: attachment.tether,
        hosts,
        unavailable: problem ?? (placement ? null : "attachment"),
      },
    ];
  });
}
