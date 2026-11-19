import type { GameState } from "./game-state";
import type { PendingTrigger } from "./rule-events";
import type { EnvironmentEffects } from "./environment-bindings";
import type { TriggerBehavior } from "./resolve-trigger";
import type { Seat } from "./setup";
import { availablePaymentRam, payRam } from "./ram";
import { revealSearchedCard } from "./deck-search";
import { moveSearchedCardToHand, shuffleCyberdeck } from "./past-life";
import {
  captureEventObservation,
  type EventObservation,
} from "./event-observation";

export interface YachtPartyEvent extends EventObservation {
  type: "yacht-party-resolved";
  sourceId: string;
  player: Seat;
  revealed: string[];
  selected: string | null;
}

/** An optional resolution-time payment. Revealing and putting into hand are not draws. */
export function yachtParty(
  effects: EnvironmentEffects,
  validate: (s: GameState, t: PendingTrigger) => void,
): TriggerBehavior {
  const player = (s: GameState, t: PendingTrigger) => {
    validate(s, t);
    if (t.event.type !== "netcheck-started")
      throw Error("Invalid Yacht Party event");
    return t.event.player;
  };
  const definitions = (s: GameState) => {
    const current = effects.characteristics(s);
    return new Map(
      Object.values(s.objects).map((o) => [
        o.definitionVersion,
        current.get(o.id)!,
      ]),
    );
  };
  const available = (s: GameState, t: PendingTrigger) =>
    availablePaymentRam(s, player(s, t), definitions(s));
  return {
    optional: (s, t) =>
      available(s, t).length >= 2
        ? "Pay 2 RAM to reveal a CORPO character with Yacht Party?"
        : null,
    optionalPlayer: player,
    choices(s, t) {
      const ids = available(s, t);
      return ids.length >= 2
        ? {
            cardCount: 2,
            prompt: "Select 2 refreshed RAM to pay for Yacht Party.",
            options: ids.map((id) => ({ id, cardId: id, label: "Pay RAM" })),
          }
        : null;
    },
    resolve(s, t) {
      const seat = player(s, t);
      if (
        t.optionalChoice !== true ||
        t.optionalPlayer !== seat ||
        !t.selectedCards
      )
        throw Error("Invalid Yacht Party payment");
      let next = payRam(s, seat, 2, t.selectedCards, definitions(s));
      const current = effects.characteristics(next),
        revealed: string[] = [];
      let selected: string | null = null;
      for (const id of next.players[seat].zones.cyberdeck) {
        const card = current.get(id);
        if (!card) throw Error("Yacht Party card characteristics unavailable");
        next = revealSearchedCard(next, seat, id, current);
        revealed.push(id);
        if (card.cardType === "character" && card.factions.includes("CORPO")) {
          selected = id;
          break;
        }
      }
      if (selected) next = moveSearchedCardToHand(next, seat, selected);
      next = shuffleCyberdeck(next, seat);
      next.pendingRuleEvents.push({
        type: "yacht-party-resolved",
        sourceId: t.sourceId,
        player: seat,
        revealed,
        selected,
        ...captureEventObservation(next),
      });
      return next;
    },
  };
}
