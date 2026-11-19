import type { GameState } from "./game-state";
import type { EnvironmentEffects } from "./environment-bindings";
import {
  ruleEventObservationState,
  type EventBehavior,
  type PendingTrigger,
  type RuleEvent,
} from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
export const multiverseId = "6bc39707-82e9-463d-87fc-aa924fc1ab7a";
export const multiverseHandler = "environment/multiverse";

export function multiverse(version: string, e: EnvironmentEffects) {
  if (!e.purgeBatch) throw Error("Multiverse purge runtime unavailable");
  const observation = (s: GameState, id: string, event: RuleEvent) => {
    if (
      (event.type !== "environment-destroyed" &&
        event.type !== "persistent-destroyed" &&
        event.type !== "persistent-binned" &&
        event.type !== "persistent-moved") ||
      event.instanceId !== id
    )
      return null;
    const observed = ruleEventObservationState(s, event);
    return observed.objects[id]?.definitionVersion === version &&
      observed.environment.includes(id) &&
      e.hasAbility(observed, id, multiverseHandler)
      ? observed
      : null;
  };
  const validate = (s: GameState, t: PendingTrigger) => {
    const before = observation(s, t.sourceId, t.event);
    if (
      t.handler !== multiverseHandler ||
      !before ||
      before.objects[t.sourceId].controller !== t.controller
    )
      throw Error("Invalid Multiverse departure trigger");
  };
  const events: EventBehavior = {
    onEvent(s, id, event) {
      const before = observation(s, id, event);
      return before
        ? [
            {
              sourceId: id,
              controller: before.objects[id].controller,
              handler: multiverseHandler,
              event,
            },
          ]
        : [];
    },
  };
  const trigger: TriggerBehavior = {
    resolve(s, t) {
      validate(s, t);
      // Evaluate the environments present when this departure trigger resolves.
      return e.purgeBatch!(
        s,
        t.sourceId,
        s.environment.filter((id) => id !== t.sourceId),
      );
    },
  };
  return { events, trigger };
}
