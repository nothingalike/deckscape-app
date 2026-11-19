import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { ActivatedDamageEffects } from "./activated-damage";
import {
  ruleEventObservationState,
  type EventBehavior,
  type RuleEvent,
} from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import { machinaMortisHitBinding } from "./machina-mortis";
import {
  smashAndGrabHitBinding,
  type SmashAndGrabEffects,
} from "./badlands-marauder";

interface HitMetadata {
  handlerId: string;
  handlerVersion: number;
  label: string;
}
export type CharacterHitTriggerSpecification = HitMetadata &
  (
    | {
        kind: "player-hit-damage";
        amount: number;
        channel: "MF" | "BF";
      }
    | { kind: "granted-character-hit-copy" }
    | { kind: "granted-smash-and-grab" }
    | { kind: "granted-unchained-rage" }
  );
export interface CharacterHitEffects {
  smashAndGrab?: Pick<SmashAndGrabEffects, "destroy" | "install">;
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  hasAbility(state: GameState, sourceId: string, handler: string): boolean;
  damage: ActivatedDamageEffects["damage"];
  canTarget?(
    state: GameState,
    sourceId: string,
    targetId: string,
    source: CardCharacteristics,
  ): boolean;
}

/** Called with definitions already checked against the retained card specification.
 * CR 117.9 includes combat damage dealt outside the combat phase. The follow-up
 * damage is an ordinary ability effect and cannot trigger another attack hit. */
export function characterHitTriggers(
  definitions: readonly {
    version: string;
    hitTriggers: readonly CharacterHitTriggerSpecification[];
  }[],
  engineVersion: string,
  rulesVersion: string,
  effects: CharacterHitEffects,
) {
  const events = new Map<string, EventBehavior>();
  const triggers = new Map<string, TriggerBehavior>();
  const triggerLabels = new Map<string, string>();
  const assertVersion = (state: GameState) => {
    if (
      state.engineVersion !== engineVersion ||
      state.rulesVersion !== rulesVersion
    )
      throw new Error("Character hit runtime version mismatch");
  };
  const isHit = (event: RuleEvent, sourceId: string) =>
    event.type === "player-damaged" &&
    event.combat === true &&
    event.sourceId === sourceId &&
    event.amount > 0;
  for (const definition of definitions) {
    const marauder = definition.hitTriggers.find(
      (spec) =>
        spec.kind === "granted-smash-and-grab" ||
        spec.kind === "granted-unchained-rage",
    );
    if (marauder) {
      if (
        definition.hitTriggers.length !== 1 ||
        !effects.canTarget ||
        !effects.smashAndGrab
      )
        throw new Error("Invalid Smash and Grab runtime");
      if (triggers.has(marauder.handlerId))
        throw new Error("Duplicate hit trigger");
      const binding = smashAndGrabHitBinding(
        definition.version,
        marauder.handlerId,
        {
          ...effects,
          canTarget: effects.canTarget,
          ...effects.smashAndGrab,
        },
        marauder.kind === "granted-unchained-rage"
          ? "unchained-rage"
          : "smash-and-grab",
      );
      events.set(definition.version, {
        onEvent(state, sourceId, event) {
          assertVersion(state);
          return binding.events.onEvent(state, sourceId, event);
        },
      });
      triggers.set(marauder.handlerId, {
        targets(state, trigger) {
          assertVersion(state);
          return binding.behavior.targets!(state, trigger);
        },
        resolve(state, trigger) {
          assertVersion(state);
          return binding.behavior.resolve(state, trigger);
        },
      });
      triggerLabels.set(marauder.handlerId, marauder.label);
      continue;
    }
    const copied = definition.hitTriggers.filter(
      (spec) => spec.kind === "granted-character-hit-copy",
    );
    if (copied.length) {
      if (definition.hitTriggers.length !== 1 || !effects.canTarget)
        throw new Error("Invalid Machina Mortis runtime");
      const spec = copied[0];
      if (triggers.has(spec.handlerId))
        throw new Error("Duplicate hit trigger");
      const binding = machinaMortisHitBinding(
        definition.version,
        spec.handlerId,
        effects,
      );
      events.set(definition.version, {
        onEvent(state, sourceId, event) {
          assertVersion(state);
          return binding.events.onEvent(state, sourceId, event);
        },
      });
      triggers.set(spec.handlerId, {
        targets(state, trigger) {
          assertVersion(state);
          return binding.behavior.targets!(state, trigger);
        },
        optional(state, trigger) {
          assertVersion(state);
          return binding.behavior.optional!(state, trigger);
        },
        resolve(state, trigger) {
          assertVersion(state);
          return binding.behavior.resolve(state, trigger);
        },
      });
      triggerLabels.set(spec.handlerId, spec.label);
      continue;
    }
    events.set(definition.version, {
      onEvent(state, sourceId, event) {
        assertVersion(state);
        if (!isHit(event, sourceId)) return [];
        if (
          !("zonesAtEvent" in event) ||
          !event.zonesAtEvent ||
          !event.observers ||
          !event.statEffectsBefore
        )
          throw new Error("Character hit observation unavailable");
        const source = state.objects[sourceId];
        if (source?.definitionVersion !== definition.version)
          throw new Error("Character hit source binding unavailable");
        if (
          source.faceDown ||
          !state.arena.includes(sourceId) ||
          effects.characteristics(structuredClone(state)).get(sourceId)
            ?.cardType !== "character"
        )
          return [];
        return definition.hitTriggers
          .filter((spec) =>
            effects.hasAbility(
              structuredClone(state),
              sourceId,
              spec.handlerId,
            ),
          )
          .map((spec) => ({
            sourceId,
            controller: source.controller,
            handler: spec.handlerId,
            event,
          }));
      },
    });
    for (const spec of definition.hitTriggers) {
      if (
        spec.kind !== "player-hit-damage" ||
        !Number.isSafeInteger(spec.amount) ||
        spec.amount <= 0 ||
        !["MF", "BF"].includes(spec.channel) ||
        triggers.has(spec.handlerId)
      )
        throw new Error(
          "Invalid or duplicate retained character hit implementation",
        );
      triggerLabels.set(spec.handlerId, spec.label);
      triggers.set(spec.handlerId, {
        resolve(state, trigger) {
          assertVersion(state);
          const event = trigger.event;
          if (
            trigger.handler !== spec.handlerId ||
            !isHit(event, trigger.sourceId) ||
            event.type !== "player-damaged" ||
            !event.zonesAtEvent ||
            !event.observers ||
            !event.statEffectsBefore
          )
            throw new Error("Invalid retained character hit trigger");
          const observed = ruleEventObservationState(state, event);
          const source = observed.objects[trigger.sourceId];
          const card = effects.characteristics(observed).get(trigger.sourceId);
          if (
            source?.definitionVersion !== definition.version ||
            source.controller !== trigger.controller ||
            source.faceDown ||
            !observed.arena.includes(trigger.sourceId) ||
            card?.cardType !== "character"
          )
            throw new Error("Invalid retained character hit source");
          // This refers to the damaged player and does not choose or target a player.
          return effects.damage(
            state,
            [
              {
                sourceId: trigger.sourceId,
                recipient: "player",
                player: event.player,
                channel: spec.channel,
                amount: spec.amount,
              },
            ],
            card,
          );
        },
      });
    }
  }
  return { events, triggers, triggerLabels };
}
