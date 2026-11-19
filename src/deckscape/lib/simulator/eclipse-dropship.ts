import { isDeepStrictEqual } from "node:util";
import type { GameState } from "./game-state";
import { assertGameZones } from "./game-state";
import type { Seat } from "./setup";
import type { CardCharacteristics } from "./characteristics";
import type { ActivatedBehavior } from "./resolve-ability";
import type { EventBehavior } from "./rule-events";
import { ruleEventObservationState } from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import { captureEventObservation } from "./event-observation";
import { advanceObjectIncarnation } from "./object-incarnation";
import { takeEffectTimestamp } from "./effect-timestamp";
import spec from "./eclipse-dropship-specification-v5.json";
const handler = spec.abilities[0].handlerId,
  mirageHandler = spec.passiveTriggers[0].handlerId;
export interface EclipseEffects {
  characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
  prepareEntry(s: GameState, id: string): GameState;
  returnToHand(s: GameState, id: string): GameState;
  hasAbility(s: GameState, id: string): boolean;
}
export function eclipseCandidates(
  s: GameState,
  player: Seat,
  e: EclipseEffects,
): string[] {
  const cards = e.characteristics(s);
  return s.players[player].zones.hand.filter((id) => {
    const card = cards.get(id);
    return (
      card?.cardType === "character" &&
      card.factions.includes("DUSTRUNNER") &&
      !(
        card.iconic &&
        [
          ...s.arena,
          ...s.environment,
          ...s.players.flatMap((p) => p.zones.mainframe),
        ].some(
          (other) =>
            s.objects[other].controller === player &&
            cards.get(other)?.iconic &&
            cards.get(other)?.name === card.name,
        )
      )
    );
  });
}
export function validateEclipse(s: GameState) {
  const d = s.pendingDecision,
    a = s.priorityWindow?.resolving;
  if (
    d?.type !== "eclipse-entry" ||
    a?.kind !== "activated" ||
    !a.activatedAbility ||
    s.priorityWindow?.mode !== "drain" ||
    a.activatedAbility.handler !== handler ||
    a.id !== d.actionId ||
    a.sourceId !== d.sourceId ||
    a.controller !== d.player ||
    d.id !== `eclipse:${a.id}` ||
    !isDeepStrictEqual(d.inspected, s.players[d.player].zones.hand) ||
    !isDeepStrictEqual(
      Object.keys(d.incarnations).sort(),
      [...d.inspected].sort(),
    ) ||
    d.inspected.some((id) => s.objects[id]?.incarnation !== d.incarnations[id])
  )
    throw Error("Invalid Eclipse entry continuation");
  return d;
}
export function eclipseActivation(e: EclipseEffects): ActivatedBehavior {
  return {
    hasLegalTargets: () => true,
    resolve(s, a) {
      if (!eclipseCandidates(s, a.controller, e).length) return s;
      const next = structuredClone(s),
        inspected = [...s.players[a.controller].zones.hand];
      next.pendingDecision = {
        type: "eclipse-entry",
        id: `eclipse:${a.id}`,
        sourceId: a.sourceId,
        actionId: a.id,
        player: a.controller,
        inspected,
        incarnations: Object.fromEntries(
          inspected.map((id) => [id, s.objects[id].incarnation]),
        ),
      };
      validateEclipse(next);
      return next;
    },
  };
}
export function answerEclipse(
  s: GameState,
  user: string,
  decisionId: string,
  id: string,
  e: EclipseEffects,
) {
  const d = validateEclipse(s),
    a = s.priorityWindow!.resolving!;
  if (
    s.players[d.player].userId !== user ||
    d.id !== decisionId ||
    !eclipseCandidates(s, d.player, e).includes(id)
  )
    throw Error("Invalid Eclipse character selection");
  let next = structuredClone(s);
  next.pendingDecision = null;
  next.players[d.player].zones.hand = next.players[d.player].zones.hand.filter(
    (x) => x !== id,
  );
  next.arena.push(id);
  advanceObjectIncarnation(next, id);
  Object.assign(next.objects[id], {
    controller: d.player,
    running: false,
    abilitySpent: false,
    faceDown: false,
    attachments: [],
    setRamCost: 0,
  });
  next = e.prepareEntry(next, id);
  const card = e.characteristics(next).get(id);
  if (card?.cardType !== "character") throw Error("Invalid Eclipse entry");
  next.pendingRuleEvents.push({
    type: "character-entered",
    ...captureEventObservation(next),
    player: d.player,
    instanceId: id,
    factions: [...card.factions],
  });
  const timestamp = takeEffectTimestamp(next);
  next.delayedTriggers.push({
    kind: "next-turn-end-return-character",
    id: `effect:${timestamp}`,
    timestamp,
    createdTurn: s.turn.number,
    sourceId: d.sourceId,
    sourceDefinitionVersion:
      a.activatedAbility!.source.copiedAbility?.definitionVersion ??
      a.activatedAbility!.source.definitionVersion,
    controller: d.player,
    handler,
    targetId: id,
    targetIncarnation: next.objects[id].incarnation,
  });
  next.priorityWindow!.resolutionApplied = true;
  next.revision++;
  assertGameZones(next);
  return next;
}
export function eclipseBindings(
  version: string | undefined,
  e: EclipseEffects,
) {
  const events = new Map<string, EventBehavior>();
  const qualifies = (
    s: GameState,
    id: string,
    event: Parameters<EventBehavior["onEvent"]>[2],
  ) => {
    if (
      event.type !== "object-targeted" ||
      event.instanceId !== id ||
      event.player === event.sourceController
    )
      return false;
    const before = ruleEventObservationState(s, event);
    return (
      !!version &&
      before.arena.includes(id) &&
      before.objects[id]?.definitionVersion === version &&
      before.objects[id].incarnation === event.incarnation &&
      e.hasAbility(before, id)
    );
  };
  if (version)
    events.set(version, {
      onEvent(s, id, event) {
        return qualifies(s, id, event)
          ? [
              {
                sourceId: id,
                controller: ruleEventObservationState(s, event).objects[id]
                  .controller,
                handler: mirageHandler,
                event,
              },
            ]
          : [];
      },
    });
  const triggers = new Map<string, TriggerBehavior>([
    [
      mirageHandler,
      {
        optional(s, t) {
          if (
            !qualifies(s, t.sourceId, t.event) ||
            t.controller !==
              ruleEventObservationState(s, t.event).objects[t.sourceId]
                ?.controller
          )
            throw Error("Invalid Eclipse MIRAGE");
          return s.arena.includes(t.sourceId) &&
            t.event.type === "object-targeted" &&
            s.objects[t.sourceId].incarnation === t.event.incarnation
            ? "MIRAGE: return Eclipse Dropship to its owner's hand?"
            : null;
        },
        resolve(s, t) {
          if (!qualifies(s, t.sourceId, t.event))
            throw Error("Invalid Eclipse MIRAGE");
          return t.event.type === "object-targeted" &&
            s.arena.includes(t.sourceId) &&
            s.objects[t.sourceId].incarnation === t.event.incarnation
            ? e.returnToHand(s, t.sourceId)
            : s;
        },
      },
    ],
    [
      handler,
      {
        resolve(s, t) {
          const d = t.delayed;
          if (
            !version ||
            d?.kind !== "next-turn-end-return-character" ||
            d.sourceDefinitionVersion !== version ||
            d.handler !== handler ||
            t.event.type !== "turn-ending" ||
            d.sourceId !== t.sourceId ||
            d.controller !== t.controller
          )
            throw Error("Invalid Eclipse delayed return");
          return s.arena.includes(d.targetId) &&
            s.objects[d.targetId].incarnation === d.targetIncarnation
            ? e.returnToHand(s, d.targetId)
            : s;
        },
      },
    ],
  ]);
  return {
    events,
    triggers,
    triggerLabels: new Map([
      [mirageHandler, "Eclipse Dropship: MIRAGE"],
      [handler, "Eclipse Dropship: return the deployed character at turn end"],
    ]),
  };
}
