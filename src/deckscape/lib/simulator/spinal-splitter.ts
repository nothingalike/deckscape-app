import { isDeepStrictEqual } from "node:util";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import { versionDefinition, type EngineManifest } from "./definition-version";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";
import {
  ruleEventObservationState,
  type EventBehavior,
  type PendingTrigger,
  type RuleEvent,
} from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import {
  createNonIconicCharacterCopy,
  enterCombatAttacking,
} from "./token-copies";
import { isCurrentIncarnation } from "./object-incarnation";
import { grantPsychosis } from "./timed-combat-effects";
import {
  recheckAttackingPsychosis,
  type PsychosisEvaluation,
} from "./psychosis";
import { scheduleCopiedTokenPurge } from "./delayed-triggers";
import type { PersistentDeparture } from "./destruction";

const cardId = "d6679224-67af-4815-91ab-ac6bfcc8a929";
const artworkSha256 =
  "033bddcd03e2ef4a1e7e2127259d389a169afca009f4cd052f06a47ed3861072";
const handler = "spinal-splitter/attack-copies-v1";
export type SpinalPsychosisDuration = "turn" | "in-play";

/** Gear regions use the host's region: the two pips on the gear's top are BODY.
 * The candidate uses the approved artwork policy (in-play); duration stays in the retained definition. */
export function spinalSplitterRecipe(duration: SpinalPsychosisDuration) {
  if (duration !== "turn" && duration !== "in-play")
    throw Error("Spinal Splitter duration must be explicit");
  return {
    cardId,
    artwork: { path: `${cardId}/${artworkSha256}.webp`, sha256: artworkSha256 },
    handlers: [
      { id: handler, version: 1, parameters: { psychosisDuration: duration } },
    ],
    characteristics: characteristicsSchema.parse({
      name: "SPINAL SPLITTER",
      cardType: "gear",
      subtype: "cyberware",
      factions: ["CYBERNETIC"],
      tags: [],
      iconic: false,
      copiesLimit: 4,
      ramCost: 3,
      requirements: { CYBERNETIC: 1 },
      ports: { head: 0, body: 2, leftArm: 0, rightArm: 0 },
      activatedAbilities: [],
      rulesText:
        "When attached character attacks, create 2 non-iconic token copies of it that are attacking and running. This character and its copies get +10 PSYCHOSIS, then all make PSYCHOSIS checks for their attacks. On turn end, purge all token copies created this way.",
    }),
  };
}

export function bindSpinalSplitter(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  effects: {
    definitions: ReadonlyMap<string, CardCharacteristics>;
    prepareEntry?(state: GameState, id: string): GameState;
    characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
    hasAbility(state: GameState, id: string, handler: string): boolean;
    psychosis: PsychosisEvaluation;
    depart(
      state: GameState,
      intents: readonly PersistentDeparture[],
    ): GameState;
  },
) {
  const pin = versionDefinition(input.definition, engine);
  const duration = pin.definition.handlers[0]?.parameters
    .psychosisDuration as SpinalPsychosisDuration;
  const expected = spinalSplitterRecipe(duration);
  if (
    pin.version !== input.version ||
    pin.definition.cardId !== cardId ||
    pin.definition.rulesVersion !== rulesVersion ||
    !isDeepStrictEqual(
      pin.definition.characteristics,
      expected.characteristics,
    ) ||
    !isDeepStrictEqual(pin.definition.handlers, expected.handlers)
  )
    throw Error("Spinal Splitter definition mismatch");
  const check = (state: GameState) => {
    if (
      state.engineVersion !== engine.version ||
      state.rulesVersion !== rulesVersion
    )
      throw Error("Spinal Splitter runtime mismatch");
  };
  const observation = (state: GameState, id: string, event: RuleEvent) => {
    check(state);
    if (event.type !== "character-attacked") return null;
    const seen = ruleEventObservationState(state, event),
      gear = seen.objects[id],
      host = seen.objects[event.instanceId];
    if (
      !gear ||
      gear.definitionVersion !== pin.version ||
      !effects.hasAbility(seen, id, handler) ||
      !seen.arena.includes(id) ||
      !host ||
      effects.characteristics(seen).get(host.id)?.cardType !== "character" ||
      !gear.attachments.some(
        (link) => link.kind === "gear" && link.hostId === host.id,
      )
    )
      return null;
    return { gear, host };
  };
  const events = new Map<string, EventBehavior>([
    [
      pin.version,
      {
        onEvent(state, id, event) {
          const seen = observation(state, id, event);
          return seen
            ? [
                {
                  sourceId: id,
                  controller: seen.gear.controller,
                  handler,
                  event: structuredClone(event),
                },
              ]
            : [];
        },
      },
    ],
  ]);
  const triggers = new Map<string, TriggerBehavior>([
    [
      handler,
      {
        resolve(state, trigger) {
          check(state);
          const delay = trigger.delayed;
          if (delay) {
            if (
              delay.kind !== "next-turn-end-purge-copies" ||
              trigger.event.type !== "turn-ending" ||
              delay.sourceDefinitionVersion !== pin.version ||
              delay.handler !== handler ||
              trigger.handler !== handler ||
              delay.sourceId !== trigger.sourceId ||
              delay.controller !== trigger.controller
            )
              throw Error("Invalid copied-token purge trigger");
            const ids = delay.targets
              .filter(
                (target) =>
                  state.arena.includes(target.id) &&
                  state.objects[target.id]?.token &&
                  isCurrentIncarnation(state, target),
              )
              .map((t) => t.id);
            return ids.length
              ? effects.depart(
                  state,
                  ids.map((id) => ({
                    id,
                    kind: "move" as const,
                    destination: "purge" as const,
                  })),
                )
              : state;
          }
          const seen = observation(state, trigger.sourceId, trigger.event);
          if (
            !seen ||
            seen.gear.controller !== trigger.controller ||
            trigger.handler !== handler
          )
            throw Error("Invalid Spinal Splitter attack trigger");
          if (
            state.turn.step !== "combat" ||
            state.combat?.stage !== "blockers-window"
          )
            throw Error("Spinal Splitter requires attack-trigger settlement");
          let next = structuredClone(state);
          const copies: string[] = [];
          for (let n = 0; n < 2; n++) {
            const copy = createNonIconicCharacterCopy(
              next,
              trigger.controller,
              trigger.sourceId,
              seen.host,
              effects.definitions,
              effects.prepareEntry,
            );
            next = copy.state;
            copies.push(copy.id);
          }
          next = enterCombatAttacking(next, copies);
          const originalStillHere =
            state.arena.includes(seen.host.id) &&
            isCurrentIncarnation(state, seen.host);
          const recipients = originalStillHere
            ? [seen.host.id, ...copies]
            : copies;
          for (const id of recipients)
            next = grantPsychosis(
              next,
              trigger.sourceId,
              id,
              10,
              duration,
              effects.characteristics(next),
              seen.gear.incarnation,
            );
          next = scheduleCopiedTokenPurge(next, trigger, pin.version, copies);
          // A previous effect may have removed the original from combat. It receives
          // the grant while present, but only ongoing attacks can be checked again.
          return recheckAttackingPsychosis(
            next,
            recipients.filter((id) => next.combat!.attackers.includes(id)),
            effects.psychosis,
          );
        },
      },
    ],
  ]);
  return {
    events,
    triggers,
    triggerLabels: new Map([[handler, "SPINAL SPLITTER"]]),
  };
}
