import { isDeepStrictEqual } from "node:util";
import type { GameState } from "./game-state";
import { assertGameZones } from "./game-state";
import type { ProgramChoices } from "./program-choices";
import type { Seat } from "./setup";
import { finishScriptResolution, type ScriptBehavior } from "./resolve-script";
import type { ProgramPlayVariant } from "./program-play-option";
import { requireCurrentCardSource } from "./cache-source";
export function validateEnhance(s: GameState) {
  const d = s.pendingDecision,
    a = s.priorityWindow?.resolving;
  if (
    d?.type !== "deck-order" ||
    !a ||
    a.kind !== "card" ||
    s.priorityWindow?.mode !== "drain" ||
    a.sourceId !== d.sourceId ||
    a.id !== d.actionId ||
    a.controller !== d.player ||
    d.targetPlayer === d.player ||
    a.programChoices?.playerTarget !== d.targetPlayer ||
    d.id !== `deck-order:${a.id}` ||
    !isDeepStrictEqual(
      d.inspected,
      s.players[d.targetPlayer].zones.cyberdeck.slice(0, 5),
    )
  )
    throw Error("Invalid Enhance continuation");
  requireCurrentCardSource(s, a);
  return d;
}
export function answerEnhance(
  s: GameState,
  user: string,
  decisionId: string,
  order: string[],
) {
  const d = validateEnhance(s);
  if (s.players[d.player].userId !== user || d.id !== decisionId)
    throw Error("Not authorized to order this deck");
  if (
    order.length !== d.inspected.length ||
    new Set(order).size !== order.length ||
    order.some((id) => !d.inspected.includes(id))
  )
    throw Error("Choose every inspected card exactly once");
  let next = structuredClone(s);
  next.players[d.targetPlayer].zones.cyberdeck.splice(
    0,
    order.length,
    ...order,
  );
  next.pendingDecision = null;
  next = finishScriptResolution(next);
  next.priorityWindow!.resolutionApplied = true;
  next.revision++;
  assertGameZones(next);
  return next;
}
export function enhance(
  canTarget: (s: GameState, source: string, player: Seat) => boolean,
) {
  const shape = (c: ProgramChoices) => {
    if (
      c.targets.length ||
      c.modes.length ||
      c.x !== null ||
      c.reversed ||
      c.mainframeTarget ||
      c.cacheActionId ||
      c.runCharacters ||
      c.playerTarget === undefined
    )
      throw Error("Invalid Enhance choices");
    return c.playerTarget;
  };
  const legal = (s: GameState, source: string, c: ProgramChoices) => {
    const player = shape(c);
    return (
      s.objects[source].controller !== player && canTarget(s, source, player)
    );
  };
  const behavior: ScriptBehavior = {
    hasLegalTargets: (s, a) => legal(s, a.sourceId, a.programChoices),
    resolve(s, a) {
      const targetPlayer = shape(a.programChoices),
        inspected = s.players[targetPlayer].zones.cyberdeck.slice(0, 5);
      if (!inspected.length) return s;
      const next = structuredClone(s);
      next.pendingDecision = {
        type: "deck-order",
        id: `deck-order:${a.id}`,
        sourceId: a.sourceId,
        actionId: a.id,
        player: a.controller,
        targetPlayer,
        inspected,
      };
      validateEnhance(next);
      return next;
    },
  };
  return {
    behavior,
    validate(s: GameState, source: string, c: ProgramChoices) {
      if (!legal(s, source, c)) throw Error("Illegal Enhance opponent");
    },
    variants(s: GameState, source: string): ProgramPlayVariant[] {
      const player = (1 - s.objects[source].controller) as Seat;
      return [
        {
          key: "normal",
          label: "Inspect opponent's top five cards",
          modes: [],
          reversed: false,
          x: null,
          mainframes: null,
          targets: [],
          playerTargets: canTarget(s, source, player)
            ? [{ player, label: "Opponent" }]
            : [],
        },
      ];
    },
  };
}
