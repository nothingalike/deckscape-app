import type { GameState } from "./game-state";
import type { PendingTrigger } from "./rule-events";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";
import type { CounterPlacement } from "./put-counters";
import type {
  WonderlandAnswer,
  WonderlandOptions,
  WonderlandPlay,
} from "./wonderland-contract";
import { baseCardD20 } from "./generational-wealth";
import { captureEventObservation } from "./event-observation";
import { revealSearchedCard } from "./deck-search";

export interface WonderlandDecision {
  type: "wonderland";
  id: string;
  startedAtRevision: number;
  sourceId: string;
  player: Seat;
  trigger: PendingTrigger;
  remaining: number;
  roll: number;
  stage: "destroy" | "invert" | "play";
  candidates: string[];
  cardId?: string;
}
export interface WonderlandEffects {
  characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
  canTarget(s: GameState, source: string, id: string): boolean;
  putCounters(
    s: GameState,
    source: string,
    placements: readonly CounterPlacement[],
  ): GameState;
  destroy(s: GameState, source: string, id: string, player: Seat): GameState;
  bin(
    s: GameState,
    source: string,
    player: Seat,
    ids: readonly string[],
  ): GameState;
  options(s: GameState): WonderlandOptions;
  canPlay(s: GameState): boolean;
  play(s: GameState, action: WonderlandPlay): GameState;
}
function hasAlice(s: GameState, player: Seat, e: WonderlandEffects) {
  const cards = e.characteristics(s);
  return s.arena.some(
    (id) =>
      s.objects[id].controller === player &&
      !s.objects[id].faceDown &&
      cards.get(id)?.cardType === "character" &&
      cards.get(id)?.name.toUpperCase() === "ALICE, DREAMWALKER",
  );
}
export function validateWonderland(s: GameState): WonderlandDecision {
  const d = s.pendingDecision;
  if (
    d?.type !== "wonderland" ||
    d.startedAtRevision > s.revision ||
    d.startedAtRevision < 0 ||
    d.id !== `wonderland:${d.startedAtRevision}:${d.sourceId}:${d.remaining}` ||
    !s.objects[d.sourceId] ||
    d.trigger.sourceId !== d.sourceId ||
    d.trigger.handler !== "wonderland/netcheck-v1" ||
    d.trigger.event.type !== "netcheck-started" ||
    d.trigger.event.player !== d.player ||
    d.trigger.optionalChoice !== true ||
    d.trigger.optionalPlayer !== d.player ||
    !Number.isSafeInteger(d.roll) ||
    ![0, 1].includes(d.remaining) ||
    (d.stage === "destroy"
      ? d.roll > 3
      : d.stage === "invert"
        ? d.roll < 4 || d.roll > 17
        : d.roll < 18) ||
    new Set(d.candidates).size !== d.candidates.length ||
    (d.stage === "play"
      ? !d.cardId ||
        s.players[d.player].zones.cyberdeck[0] !== d.cardId ||
        d.candidates.length !== 0
      : d.cardId !== undefined ||
        !d.candidates.length ||
        d.candidates.some((id) => !s.arena.includes(id)))
  )
    throw Error("Invalid Wonderland continuation");
  return d;
}
/** Finish each instruction before consuming the next random value. The sequence
 * stays inside this effect; no intervening priority, SBA or trigger resolution. */
function nextRoll(
  s: GameState,
  context: Pick<
    WonderlandDecision,
    "sourceId" | "player" | "trigger" | "startedAtRevision"
  >,
  remaining: number,
  e: WonderlandEffects,
): GameState {
  let next = s;
  while (remaining > 0 && !next.outcome) {
    remaining--;
    const rolled = baseCardD20(next);
    next = rolled.state;
    const roll = rolled.value,
      cards = e.characteristics(next);
    const stage = roll <= 3 ? "destroy" : roll <= 17 ? "invert" : "play";
    const candidates =
      stage === "play"
        ? []
        : next.arena.filter(
            (id) =>
              cards.get(id)?.cardType === "character" &&
              (stage === "destroy"
                ? next.objects[id].controller === context.player
                : e.canTarget(next, context.sourceId, id)),
          );
    const cardId =
      stage === "play"
        ? next.players[context.player].zones.cyberdeck[0]
        : undefined;
    const protectedByAlice =
      stage === "destroy" && hasAlice(next, context.player, e);
    next.pendingRuleEvents.push({
      type: "card-die-rolled",
      ...captureEventObservation(next),
      sourceId: context.sourceId,
      player: context.player,
      sides: 20,
      result: roll,
      outcome: protectedByAlice
        ? "No destruction: ALICE is in play."
        : stage !== "play" && !candidates.length
          ? "No effect: no eligible characters to " + stage + "."
          : stage === "destroy"
            ? "Choose one of your characters to destroy."
            : stage === "invert"
              ? "Choose a target character to INVERT."
              : !cardId
                ? "No effect: cyberdeck is empty."
                : "Reveal the top cyberdeck card to play; recycle it if it cannot be played.",
    });
    if (protectedByAlice || (stage !== "play" && !candidates.length)) continue;
    if (stage === "play" && !cardId) continue;
    if (cardId) next = revealSearchedCard(next, context.player, cardId, cards);
    next.pendingDecision = {
      type: "wonderland",
      sourceId: context.sourceId,
      player: context.player,
      trigger: context.trigger,
      startedAtRevision: context.startedAtRevision,
      id: `wonderland:${context.startedAtRevision}:${context.sourceId}:${remaining}`,
      remaining,
      roll,
      stage,
      candidates,
      ...(cardId ? { cardId } : {}),
    };
    if (stage !== "play" || e.canPlay(next)) return next;
    next.pendingDecision = null;
    next = e.bin(next, context.sourceId, context.player, [cardId!]);
  }
  return next;
}
export function startWonderland(
  s: GameState,
  t: PendingTrigger,
  e: WonderlandEffects,
): GameState {
  if (
    t.event.type !== "netcheck-started" ||
    t.optionalChoice !== true ||
    t.optionalPlayer !== t.event.player
  )
    throw Error("Invalid Wonderland trigger");
  return nextRoll(
    s,
    {
      sourceId: t.sourceId,
      player: t.event.player,
      trigger: t,
      startedAtRevision: s.revision,
    },
    hasAlice(s, t.event.player, e) ? 2 : 1,
    e,
  );
}
export function answerWonderland(
  s: GameState,
  user: string,
  a: WonderlandAnswer,
  e: WonderlandEffects,
): GameState {
  const d = validateWonderland(s);
  if (d.id !== a.decisionId || s.players[d.player].userId !== user)
    throw Error("Not the Wonderland deciding player");
  let next = structuredClone(s);
  if (d.stage === "play") {
    if (!a.play || a.selected !== undefined || a.play.id !== d.cardId)
      throw Error("Wonderland requires playing the revealed card");
    next = e.play(next, a.play);
  } else {
    if (
      a.play ||
      a.selected === undefined ||
      (a.selected === null && d.stage !== "invert") ||
      (a.selected !== null && !d.candidates.includes(a.selected))
    )
      throw Error("Invalid Wonderland selection");
    next.pendingDecision = null;
    if (a.selected !== null) {
      if (
        e.characteristics(next).get(a.selected)?.cardType !== "character" ||
        (d.stage === "destroy"
          ? next.objects[a.selected].controller !== d.player
          : !e.canTarget(next, d.sourceId, a.selected))
      )
        throw Error("Wonderland character is no longer legal");
      if (d.stage === "destroy")
        next = e.destroy(next, d.sourceId, a.selected, d.player);
      else if ((next.objects[a.selected].counters.INVERT ?? 0) > 0) {
        const count = next.objects[a.selected].counters.INVERT;
        if (count === 1) delete next.objects[a.selected].counters.INVERT;
        else next.objects[a.selected].counters.INVERT = count - 1;
        next.pendingRuleEvents.push({
          type: "counters-removed",
          ...captureEventObservation(next),
          sourceId: d.sourceId,
          instanceId: a.selected,
          player: next.objects[a.selected].controller,
          counter: "INVERT",
          amount: 1,
        });
      } else
        next = e.putCounters(next, d.sourceId, [
          { instanceId: a.selected, counter: "INVERT", amount: 1 },
        ]);
    }
  }
  return nextRoll(next, d, d.remaining, e);
}
