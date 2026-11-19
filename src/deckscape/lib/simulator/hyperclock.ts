import type { GameState } from "./game-state";
import type { ProgramChoices } from "./program-choices";
import type { ScriptBehavior } from "./resolve-script";
import type { TriggerBehavior } from "./resolve-trigger";
import type { PendingTrigger } from "./rule-events";
import type { ProgramPlayVariant } from "./program-play-option";
import type { ProgramBindingEffects } from "./program-bindings";
import { scheduleTurnEndRamDestruction } from "./delayed-triggers";

export function hyperclock(
  version: string,
  handler: string,
  effects: ProgramBindingEffects,
) {
  const shape = (c: ProgramChoices) => {
    if (
      c.targets.length ||
      c.modes.length ||
      c.x !== null ||
      c.reversed ||
      c.playerTarget !== undefined ||
      c.mainframeTarget !== undefined ||
      c.runCharacters !== undefined
    )
      throw Error("Invalid Hyperclock choices");
  };
  const validateTrigger = (t: PendingTrigger) => {
    const d = t.delayed;
    if (
      t.handler !== handler ||
      t.event.type !== "turn-ending" ||
      d?.kind !== "next-turn-end-destroy-ram" ||
      d.sourceDefinitionVersion !== version ||
      d.handler !== handler ||
      d.sourceId !== t.sourceId ||
      d.controller !== t.controller ||
      d.count !== 3
    )
      throw Error("Invalid Hyperclock delayed trigger");
    return d;
  };
  const candidates = (s: GameState, t: PendingTrigger) => {
    validateTrigger(t);
    const current = effects.characteristics(s);
    return [...s.players.flatMap((p) => p.zones.ramBank), ...s.arena].filter(
      (id) =>
        s.objects[id].controller === t.controller &&
        current.get(id)?.cardType === "ram",
    );
  };
  const behavior: ScriptBehavior = {
    hasLegalTargets: () => true,
    resolve(s, a) {
      shape(a.programChoices);
      if (!effects.protocols?.install)
        throw Error("Hyperclock install runtime unavailable");
      let next = s;
      for (let i = 0; i < 3; i++)
        next = effects.protocols.install(next, a.sourceId, a.controller, false);
      return scheduleTurnEndRamDestruction(next, a, handler, 3);
    },
  };
  const triggered: TriggerBehavior = {
    choices(s, t) {
      const ids = candidates(s, t);
      return ids.length
        ? {
            prompt: "Hyperclock: choose RAM to destroy at turn end.",
            cardCount: Math.min(3, ids.length),
            options: ids.map((id) => ({
              id,
              cardId: id,
              label: "Destroy RAM",
            })),
          }
        : null;
    },
    resolve(s, t) {
      const ids = candidates(s, t);
      if (!ids.length) return s;
      const selected = t.selectedCards;
      if (
        !selected ||
        selected.length !== Math.min(3, ids.length) ||
        new Set(selected).size !== selected.length ||
        selected.some((id) => !ids.includes(id))
      )
        throw Error("Invalid Hyperclock RAM selection");
      if (!effects.destroyBatch)
        throw Error("Hyperclock destruction runtime unavailable");
      return effects.destroyBatch(s, t.sourceId, selected, t.controller);
    },
  };
  return {
    behavior,
    triggered,
    shape,
    legalTargets: () => [],
    slotCandidates: () => new Set<string>(),
    validate(_s: GameState, _id: string, c: ProgramChoices) {
      shape(c);
    },
    variants(): ProgramPlayVariant[] {
      return [
        {
          key: "normal",
          label: "Pay 3 MF and 3 BF; install 3 RAM refreshed",
          modes: [],
          x: null,
          reversed: false,
          targets: [],
          mainframes: null,
        },
      ];
    },
  };
}
