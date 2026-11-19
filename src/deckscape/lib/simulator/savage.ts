import { isDeepStrictEqual } from "node:util";
import recipe from "./savage-card-v3.json";
import { versionDefinition, type EngineManifest } from "./definition-version";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";
import {
  ruleEventObservationState,
  type EventBehavior,
  type PendingTrigger,
} from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import type { CombatDamagePacket } from "./combat-damage";
import { sourceController } from "./source-controller";
import { mainframeTierRequirements } from "./synergy";
export const savageId = recipe.cardId;

export function savageGrants(
  s: GameState,
  version: string | undefined,
  current: ReadonlyMap<string, CardCharacteristics>,
  hasAbility: (s: GameState, id: string) => boolean,
) {
  const stamina = new Set<string>(),
    feedback = new Set<string>();
  if (!version) return { stamina, feedback };
  for (const player of s.players)
    for (const frame of player.zones.mainframe) {
      if (
        s.objects[frame].definitionVersion !== version ||
        !hasAbility(s, frame)
      )
        continue;
      const tiers = mainframeTierRequirements(s, frame, current),
        controller = s.objects[frame].controller;
      for (const id of s.arena) {
        const gear = current.get(id),
          object = s.objects[id];
        if (gear?.cardType !== "gear" || !hasAbility(s, id)) continue;
        for (const a of object.attachments) {
          if (
            a.kind !== "gear" ||
            !s.arena.includes(a.hostId) ||
            s.objects[a.hostId].controller !== controller ||
            current.get(a.hostId)?.cardType !== "character" ||
            !hasAbility(s, a.hostId)
          )
            continue;
          if (tiers[0] && gear.factions.includes("CYBERNETIC"))
            stamina.add(a.hostId);
          if (tiers[1] && gear.factions.includes("THRASHER"))
            feedback.add(a.hostId);
        }
      }
    }
  return { stamina, feedback };
}

export function bindSavage(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  effects: {
    hasAbility(s: GameState, id: string): boolean;
    hasNativeFeedback(s: GameState, id: string): boolean;
    characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
    damage(s: GameState, packets: readonly CombatDamagePacket[]): GameState;
  },
) {
  const pin = versionDefinition(input.definition, engine),
    handler = recipe.handlers[0].id;
  if (
    pin.version !== input.version ||
    pin.definition.rulesVersion !== rulesVersion ||
    pin.definition.cardId !== recipe.cardId ||
    !isDeepStrictEqual(
      pin.definition.characteristics,
      characteristicsSchema.parse(recipe.characteristics),
    ) ||
    !isDeepStrictEqual(pin.definition.handlers, recipe.handlers)
  )
    throw Error("Savage definition mismatch");
  const observe = (
    s: GameState,
    id: string,
    event: PendingTrigger["event"],
  ) => {
    if (s.engineVersion !== engine.version || s.rulesVersion !== rulesVersion)
      throw Error("Savage runtime mismatch");
    if (event.type !== "character-damaged" || event.amount <= 0) return null;
    if (!event.observers || !event.zonesAtEvent || !event.statEffectsBefore)
      throw Error("Savage damage observation unavailable");
    const snapshot = ruleEventObservationState(s, event),
      host = snapshot.objects[event.instanceId];
    if (
      snapshot.objects[id]?.definitionVersion !== pin.version ||
      snapshot.objects[id].controller !== host?.controller ||
      !savageGrants(
        snapshot,
        pin.version,
        effects.characteristics(snapshot),
        effects.hasAbility,
      ).feedback.has(event.instanceId) ||
      effects.hasNativeFeedback(snapshot, event.instanceId)
    )
      return null;
    return {
      host,
      recipient:
        event.sourceController === undefined
          ? sourceController(snapshot, event.sourceId)
          : event.sourceController,
    };
  };
  const events = new Map<string, EventBehavior>([
    [
      pin.version,
      {
        onEvent(s, id, event) {
          const o = observe(s, id, event);
          return o
            ? [{ sourceId: id, controller: o.host.controller, handler, event }]
            : [];
        },
      },
    ],
  ]);
  const triggers = new Map<string, TriggerBehavior>([
    [
      handler,
      {
        resolve(s, trigger) {
          const o = observe(s, trigger.sourceId, trigger.event);
          if (
            !o ||
            trigger.handler !== handler ||
            trigger.controller !== o.host.controller ||
            trigger.event.type !== "character-damaged"
          )
            throw Error("Invalid Savage FEEDBACK trigger");
          if (o.recipient === null) return s;
          return effects.damage(s, [
            {
              sourceId: o.host.id,
              sourceController: trigger.controller,
              recipient: "player",
              player: o.recipient,
              channel: "BF",
              amount: trigger.event.amount,
            },
          ]);
        },
      },
    ],
  ]);
  return {
    events,
    triggers,
    triggerLabels: new Map([[handler, "Savage: equipped character FEEDBACK."]]),
  };
}
