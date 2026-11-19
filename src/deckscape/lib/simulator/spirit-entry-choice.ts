import { isDeepStrictEqual } from "node:util";
import { assertGameZones, type GameState } from "./game-state";
import type { PendingTrigger } from "./rule-events";
import type { Seat } from "./setup";
import {
  planRecycledSpiritEntries,
  returnCharactersWithSpirit,
  type RecycleCharacterEntryEffects,
  type RecycledSpiritEntry,
  type IconicSpiritEntryChoice,
} from "./recycle-character-entry";

export interface SpiritEntryDecision {
  type: "spirit-entry";
  id: string;
  startedAtRevision: number;
  sourceId: string;
  player: Seat;
  trigger: PendingTrigger;
  entries: (RecycledSpiritEntry & { incarnation: number })[];
  groups: IconicSpiritEntryChoice[];
  selected: string[];
}
export interface SpiritEntryEffects extends RecycleCharacterEntryEffects {
  validateTrigger(s: GameState, t: PendingTrigger): void;
  entries(s: GameState, t: PendingTrigger): RecycledSpiritEntry[];
}

export function validateSpiritEntryContinuation(
  s: GameState,
): SpiritEntryDecision {
  const d = s.pendingDecision;
  if (
    d?.type !== "spirit-entry" ||
    !s.triggersOrdered ||
    s.pendingRuleEvents.length ||
    d.startedAtRevision > s.revision ||
    d.startedAtRevision < 0 ||
    d.id !== `spirit-entry:${d.startedAtRevision}:${d.sourceId}` ||
    !s.objects[d.sourceId] ||
    d.trigger.sourceId !== d.sourceId ||
    !d.groups.length ||
    d.selected.length >= d.groups.length ||
    d.player !== d.groups[d.selected.length].player ||
    new Set(d.entries.map((e) => e.id)).size !== d.entries.length ||
    new Set(d.selected).size !== d.selected.length ||
    d.entries.some(
      (e) =>
        s.objects[e.id]?.owner !== e.player ||
        s.objects[e.id]?.incarnation !== e.incarnation ||
        !s.players[e.player].zones.recycleBin.includes(e.id),
    ) ||
    d.groups.some(
      (g) =>
        !g.name ||
        g.candidates.length < 2 ||
        new Set(g.candidates).size !== g.candidates.length ||
        g.candidates.some(
          (id) => !d.entries.some((e) => e.id === id && e.player === g.player),
        ),
    ) ||
    d.selected.some((id, i) => !d.groups[i].candidates.includes(id))
  )
    throw Error("Invalid simultaneous SPIRIT entry continuation");
  return d;
}

function planned(s: GameState, t: PendingTrigger, e: SpiritEntryEffects) {
  e.validateTrigger(s, t);
  const entries = e.entries(s, t);
  const plan = planRecycledSpiritEntries(s, entries, e);
  // 101.4: collect each affected owner's choices in active-player order.
  const groups = [...plan.choices].sort(
    (a, b) =>
      Number(a.player !== s.turn.activePlayer) -
      Number(b.player !== s.turn.activePlayer),
  );
  return {
    entries: entries.map((entry) => ({
      ...entry,
      incarnation: s.objects[entry.id].incarnation,
    })),
    groups,
  };
}

/** Called after the on-enter trigger is popped. No entrants move while either
 * owner still has a replacement choice; the captured trigger survives departure. */
export function beginSpiritEntry(
  s: GameState,
  t: PendingTrigger,
  e: SpiritEntryEffects,
): GameState {
  if (
    s.outcome ||
    s.pendingDecision ||
    s.pendingRuleEvents.length ||
    !s.triggersOrdered
  )
    throw Error("Simultaneous SPIRIT entry unavailable");
  const plan = planned(s, t, e);
  if (!plan.groups.length)
    return returnCharactersWithSpirit(s, t.sourceId, plan.entries, [], e);
  const next = structuredClone(s);
  next.pendingDecision = {
    type: "spirit-entry",
    id: `spirit-entry:${s.revision}:${t.sourceId}`,
    startedAtRevision: s.revision,
    sourceId: t.sourceId,
    player: plan.groups[0].player,
    trigger: structuredClone(t),
    ...plan,
    selected: [],
  };
  validateSpiritEntryContinuation(next);
  return next;
}

export function evaluateSpiritEntry(
  s: GameState,
  e: SpiritEntryEffects,
): SpiritEntryDecision {
  const d = validateSpiritEntryContinuation(s);
  const current = planned(structuredClone(s), structuredClone(d.trigger), e);
  if (
    !isDeepStrictEqual(current.entries, d.entries) ||
    !isDeepStrictEqual(current.groups, d.groups)
  )
    throw Error("Simultaneous SPIRIT entry options changed");
  return d;
}

export function answerSpiritEntry(
  s: GameState,
  user: string,
  revision: number,
  decisionId: string,
  id: string,
  e: SpiritEntryEffects,
): GameState {
  if (s.outcome || revision !== s.revision)
    throw Error("Ended game or stale revision");
  const d = evaluateSpiritEntry(s, e);
  if (d.id !== decisionId || s.players[d.player].userId !== user)
    throw Error("Not the deciding player or decision");
  if (!d.groups[d.selected.length].candidates.includes(id))
    throw Error("Invalid iconic entrant");
  let next = structuredClone(s);
  const selected = [...d.selected, id];
  if (selected.length < d.groups.length) {
    next.pendingDecision = {
      ...structuredClone(d),
      selected,
      player: d.groups[selected.length].player,
    };
    validateSpiritEntryContinuation(next);
  } else {
    next.pendingDecision = null;
    next = returnCharactersWithSpirit(next, d.sourceId, d.entries, selected, e);
    if (
      next.pendingDecision ||
      next.revision !== revision ||
      next.engineVersion !== s.engineVersion ||
      next.rulesVersion !== s.rulesVersion
    )
      throw Error("SPIRIT entry changed its command boundary");
  }
  next.revision++;
  assertGameZones(next);
  return next;
}
