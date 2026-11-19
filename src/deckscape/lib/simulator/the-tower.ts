import { isDeepStrictEqual } from "node:util";
import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";
import { enhance } from "./enhance";
import { requireCurrentCardSource } from "./cache-source";
import { finishScriptResolution, type ScriptBehavior } from "./resolve-script";
import { revealSearchedCard } from "./deck-search";
import { moveSearchedCardToHand } from "./past-life";
import { binCyberdeckCards } from "./top-cards";
export function validateTower(s: GameState) {
  const d = s.pendingDecision,
    a = s.priorityWindow?.resolving;
  if (
    d?.type !== "tower" ||
    !a ||
    a.kind !== "card" ||
    s.priorityWindow?.mode !== "drain" ||
    d.sourceId !== a.sourceId ||
    d.actionId !== a.id ||
    d.controller !== a.controller ||
    d.opponent !== a.programChoices?.playerTarget ||
    d.controller === d.opponent ||
    d.player !== (d.piles ? d.controller : d.opponent) ||
    d.id !== "tower:" + a.id ||
    !isDeepStrictEqual(
      d.inspected,
      s.players[d.controller].zones.cyberdeck.slice(0, 4),
    )
  )
    throw Error("Invalid Tower continuation");
  requireCurrentCardSource(s, a);
  if (d.piles) {
    const ids = d.piles.flat();
    if (
      new Set(ids).size !== ids.length ||
      ids.length !== d.inspected.length ||
      ids.some((id) => !d.inspected.includes(id))
    )
      throw Error("Invalid Tower piles");
  }
  return d;
}
export function answerTower(
  s: GameState,
  user: string,
  decisionId: string,
  firstPile?: string[],
  pile?: 0 | 1,
) {
  const d = validateTower(s);
  if (s.players[d.player].userId !== user || d.id !== decisionId)
    throw Error("Unauthorized Tower choice");
  let next = structuredClone(s);
  if (!d.piles) {
    if (
      pile !== undefined ||
      !firstPile ||
      !firstPile.length ||
      firstPile.length >= d.inspected.length ||
      new Set(firstPile).size !== firstPile.length ||
      firstPile.some((id) => !d.inspected.includes(id))
    )
      throw Error("Choose two nonempty piles");
    next.pendingDecision = {
      ...d,
      player: d.controller,
      piles: [firstPile, d.inspected.filter((id) => !firstPile.includes(id))],
    };
  } else {
    if (firstPile !== undefined || pile === undefined)
      throw Error("Choose a Tower pile");
    next.pendingDecision = null;
    for (const id of d.piles[pile])
      next = moveSearchedCardToHand(next, d.controller, id);
    next = binCyberdeckCards(next, d.sourceId, d.controller, d.piles[1 - pile]);
    next = finishScriptResolution(next);
    next.priorityWindow!.resolutionApplied = true;
  }
  next.revision++;
  return next;
}
export function theTower(
  canTarget: (s: GameState, id: string, player: Seat) => boolean,
  cards: (s: GameState) => ReadonlyMap<string, CardCharacteristics>,
) {
  const target = enhance(canTarget);
  const behavior: ScriptBehavior = {
    hasLegalTargets(s, a) {
      try {
        target.validate(s, a.sourceId, a.programChoices);
        return true;
      } catch {
        return false;
      }
    },
    resolve(s, a) {
      const inspected = s.players[a.controller].zones.cyberdeck.slice(0, 4);
      let next = s;
      for (const id of inspected)
        next = revealSearchedCard(next, a.controller, id, cards(next));
      if (inspected.length < 2)
        return inspected.length
          ? moveSearchedCardToHand(next, a.controller, inspected[0])
          : next;
      next = structuredClone(next);
      next.pendingDecision = {
        type: "tower",
        id: "tower:" + a.id,
        sourceId: a.sourceId,
        actionId: a.id,
        player: a.programChoices.playerTarget!,
        opponent: a.programChoices.playerTarget!,
        controller: a.controller,
        inspected,
        piles: null,
      };
      validateTower(next);
      return next;
    },
  };
  return {
    ...target,
    behavior,
    variants(s: GameState, id: string) {
      return target
        .variants(s, id)
        .map((v) => ({ ...v, label: "Opponent divides your top four cards" }));
    },
  };
}
