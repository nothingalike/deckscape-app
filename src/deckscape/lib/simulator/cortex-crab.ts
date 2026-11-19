import { isDeepStrictEqual } from "node:util";
import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { EventBehavior } from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import { normalizeControl } from "./timed-control";
import { changePersistentStatus } from "./persistent-status";
import type { versionDefinition } from "./definition-version";
import spec from "./cortex-crab-v1.json";

/** The attachment controls its host continuously, independently of the refresh
 * trigger. Base control survives the gear's zone change, but never a new host
 * incarnation. Port legality prevents two Crabs occupying the same head. */
export function bindCortexCrab(
  pins: readonly ReturnType<typeof versionDefinition>[],
  effects: {
    characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
    destroy(state: GameState, id: string): GameState;
  },
) {
  const versions = new Set(
    pins
      .filter((p) => p.definition.cardId === spec.cardId)
      .map((p) => {
        if (
          !isDeepStrictEqual(
            p.definition.characteristics,
            spec.characteristics,
          ) ||
          !isDeepStrictEqual(p.definition.handlers, spec.handlers)
        )
          throw Error("Cortex Crab definition mismatch");
        return p.version;
      }),
  );
  const isCrab = (state: GameState, id: string) =>
    versions.has(state.objects[id]?.definitionVersion);
  const links = (state: GameState) =>
    state.arena.flatMap((id) => {
      const gear = state.objects[id];
      if (!isCrab(state, id) || gear.faceDown) return [];
      return gear.attachments
        .filter(
          (a) =>
            a.kind === "gear" &&
            state.arena.includes(a.hostId) &&
            effects.characteristics(state).get(a.hostId)?.cardType ===
              "character",
        )
        .map((a) => ({ gearId: id, hostId: a.hostId }));
    });
  function normalize(state: GameState) {
    return normalizeControl(
      state,
      links(state).map(({ gearId, hostId }) => ({
        sourceId: gearId,
        targetId: hostId,
        incarnation: state.objects[hostId].incarnation,
        controller: state.objects[gearId].controller,
        timestamp: state.objects[gearId].timestamp,
      })),
      effects.characteristics(state),
    );
  }
  const events = new Map<string, EventBehavior>(),
    triggers = new Map<string, TriggerBehavior>();
  for (const version of versions)
    events.set(version, {
      onEvent(state, id, event) {
        if (
          event.type === "gear-attached" &&
          event.instanceId === id &&
          event.hostController !== event.player
        )
          return [
            {
              sourceId: id,
              controller: event.player,
              handler: "gear/cortex-crab-refresh",
              event: structuredClone(event),
            },
          ];
        if (
          event.type === "turn-ending" &&
          state.arena.includes(id) &&
          !state.objects[id].faceDown
        )
          return [
            {
              sourceId: id,
              controller: state.objects[id].controller,
              handler: "gear/cortex-crab-expire",
              event: {
                ...structuredClone(event),
                observers: [structuredClone(state.objects[id])],
              },
            },
          ];
        return [];
      },
    });
  triggers.set("gear/cortex-crab-refresh", {
    resolve(state, trigger) {
      const e = trigger.event;
      if (
        e.type !== "gear-attached" ||
        e.instanceId !== trigger.sourceId ||
        e.player !== trigger.controller ||
        e.hostController === e.player
      )
        throw Error("Invalid Cortex Crab attachment trigger");
      if (
        !state.arena.includes(e.hostId) ||
        state.objects[e.hostId]?.incarnation !== e.hostIncarnation
      )
        return state;
      return changePersistentStatus(
        state,
        trigger.sourceId,
        [
          { instanceId: e.hostId, operation: "refresh" },
          { instanceId: e.hostId, operation: "reboot" },
        ],
        { allowed: () => true },
      );
    },
  });
  triggers.set("gear/cortex-crab-expire", {
    resolve(state, trigger) {
      if (trigger.event.type !== "turn-ending")
        throw Error("Invalid Cortex Crab turn-end trigger");
      const captured = trigger.event.observers?.find(
        (o) => o.id === trigger.sourceId,
      );
      if (!captured) throw Error("Missing Cortex Crab end-turn source");
      return state.arena.includes(trigger.sourceId) &&
        state.objects[trigger.sourceId].incarnation === captured.incarnation &&
        isCrab(state, trigger.sourceId)
        ? effects.destroy(state, trigger.sourceId)
        : state;
    },
  });
  return {
    isCrab,
    normalize,
    events,
    triggers,
    triggerLabels: new Map([
      [
        "gear/cortex-crab-refresh",
        "Refresh attached character and reboot its abilities.",
      ],
      ["gear/cortex-crab-expire", "Destroy Cortex Crab at turn end."],
    ]),
    attributes(state: GameState, cards: Map<string, CardCharacteristics>) {
      for (const { hostId } of links(state)) {
        const card = cards.get(hostId);
        if (card?.cardType === "character")
          cards.set(hostId, { ...card, attackType: "MF" });
      }
      return cards;
    },
  };
}
