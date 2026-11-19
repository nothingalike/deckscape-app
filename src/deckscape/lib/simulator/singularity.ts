import spec from "./singularity-specification-v5.json";
import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";
import { grantFreeCardPlays } from "./free-card-plays";
import type { ActivatedBehavior } from "./resolve-ability";
import { ruleEventObservationState, type EventBehavior } from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import type { PersistentDeparture } from "./destruction";

export const singularityActivation: ActivatedBehavior = {
  hasLegalTargets: () => true,
  resolve: (s, a) => grantFreeCardPlays(s, a.sourceId, a.controller),
};

export function singularityControls(
  s: GameState,
  version: string | undefined,
  player: Seat,
  cards: ReadonlyMap<string, CardCharacteristics>,
  hasAbility: (s: GameState, id: string) => boolean,
): boolean {
  return (
    !!version &&
    s.arena.some(
      (id) =>
        s.objects[id].definitionVersion === version &&
        s.objects[id].controller === player &&
        cards.get(id)?.cardType === "character" &&
        hasAbility(s, id),
    )
  );
}

/** Cost setting is an in-play continuous effect, before additive cost modifiers.
 * Hand, deck and cache cards retain their normal costs. */
export function applySingularityCosts(
  s: GameState,
  version: string | undefined,
  cards: Map<string, CardCharacteristics>,
  hasAbility: (s: GameState, id: string) => boolean,
): Map<string, CardCharacteristics> {
  if (!version) return cards;
  const controlled = ([0, 1] as const).filter((p) =>
    singularityControls(s, version, p, cards, hasAbility),
  );
  if (!controlled.length) return cards;
  const inPlay = new Set([
    ...s.arena,
    ...s.environment,
    ...s.players.flatMap((p) => [...p.zones.mainframe, ...p.zones.ramBank]),
  ]);
  return new Map(
    [...cards].map(([id, card]) => [
      id,
      inPlay.has(id) &&
      controlled.includes(s.objects[id].controller) &&
      "ramCost" in card
        ? {
            ...card,
            ramCost: 0,
            activatedAbilities: card.activatedAbilities.map((a) => ({
              ...a,
              ramCost: 0,
            })),
          }
        : card,
    ]),
  );
}

export function singularityEntry(
  version: string | undefined,
  e: {
    hasAbility(s: GameState, id: string): boolean;
    characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
    depart(s: GameState, intents: readonly PersistentDeparture[]): GameState;
  },
) {
  const handler = spec.passiveTriggers[0].handlerId;
  const events = new Map<string, EventBehavior>();
  const qualifies = (
    s: GameState,
    id: string,
    event: Parameters<EventBehavior["onEvent"]>[2],
  ) => {
    if (
      event.type !== "character-entered" ||
      event.instanceId !== id ||
      !version
    )
      return false;
    const before = ruleEventObservationState(s, event);
    return (
      before.objects[id]?.definitionVersion === version &&
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
                handler,
                event: structuredClone(event),
              },
            ]
          : [];
      },
    });
  const triggers = new Map<string, TriggerBehavior>([
    [
      handler,
      {
        resolve(s, t) {
          if (
            t.handler !== handler ||
            !qualifies(s, t.sourceId, t.event) ||
            t.controller !==
              ruleEventObservationState(s, t.event).objects[t.sourceId]
                .controller
          )
            throw Error("Invalid Singularity entry trigger");
          const cards = e.characteristics(s);
          const inPlay = [
            ...s.arena,
            ...s.players.flatMap((p) => p.zones.ramBank),
          ];
          return e.depart(
            s,
            inPlay
              .filter(
                (id) =>
                  s.objects[id].controller === t.controller &&
                  cards.get(id)?.cardType === "ram",
              )
              .map((id) => ({
                id,
                kind: "destroy",
                sourceId: t.sourceId,
                destroyedBy: t.controller,
                reason: "normal",
              })),
          );
        },
      },
    ],
  ]);
  return {
    events,
    triggers,
    triggerLabels: new Map([
      [handler, "The Singularity: destroy all RAM you control"],
    ]),
  };
}
