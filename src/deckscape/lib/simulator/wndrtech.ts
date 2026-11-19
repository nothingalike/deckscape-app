import { isDeepStrictEqual } from "node:util";
import recipe from "./wndrtech-card-v3.json";
import { versionDefinition, type EngineManifest } from "./definition-version";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import {
  ruleEventObservationState,
  type EventBehavior,
  type PendingTrigger,
} from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import { mainframeTierRequirements } from "./synergy";
import { tokenTemplates, type AttackType } from "./tokens";

export const wndrtechId = recipe.cardId;
export const wndrtechTokens = ["pawn", "bishop", "rook"] as const;
export type WndrtechToken = (typeof wndrtechTokens)[number];
export function bindWndrtech(
  input: PinnedDefinition,
  engine: EngineManifest,
  rulesVersion: string,
  effects: {
    characteristics(s: GameState): ReadonlyMap<string, CardCharacteristics>;
    hasAbility(s: GameState, id: string): boolean;
    create(
      s: GameState,
      player: Seat,
      source: string,
      token: WndrtechToken,
      attack: AttackType,
    ): GameState;
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
    throw Error("WNDRTECH definition mismatch");
  const observe = (s: GameState, id: string, e: PendingTrigger["event"]) => {
    if (s.engineVersion !== engine.version || s.rulesVersion !== rulesVersion)
      throw Error("WNDRTECH runtime mismatch");
    if (e.type !== "program-played" || !e.factions.includes("WONDERLAND"))
      return null;
    if (!e.observers || !e.zonesAtEvent || !e.statEffectsBefore)
      throw Error("WNDRTECH event observation unavailable");
    const snapshot = ruleEventObservationState(s, e),
      source = snapshot.objects[id];
    if (
      source?.definitionVersion !== pin.version ||
      source.controller !== e.player ||
      !snapshot.players[source.controller].zones.mainframe.includes(id) ||
      !effects.hasAbility(snapshot, id)
    )
      return null;
    const tiers = mainframeTierRequirements(
      snapshot,
      id,
      effects.characteristics(snapshot),
    );
    return tiers.some(Boolean) ? { source, tiers } : null;
  };
  const placementChoices = (s: GameState, t: PendingTrigger) => {
    const observed = observe(s, t.sourceId, t.event);
    if (
      !observed ||
      observed.source.controller !== t.controller ||
      t.handler !== handler
    )
      throw Error("Invalid WNDRTECH trigger");
    return {
      prompt: "Choose which WNDRTECH token ability to place on the cache.",
      options: wndrtechTokens.flatMap((token, i) =>
        observed.tiers[i]
          ? [
              {
                id: token,
                label:
                  tokenTemplates[token].attack +
                  "/" +
                  tokenTemplates[token].defence +
                  " " +
                  tokenTemplates[token].name,
              },
            ]
          : [],
      ),
    };
  };
  const choices = (s: GameState, t: PendingTrigger) => {
    if (!placementChoices(s, t).options.some((o) => o.id === t.placementChoice))
      throw Error("Invalid WNDRTECH tier choice");
    const token = t.placementChoice as WndrtechToken;
    return {
      prompt:
        "Choose the attack type for your " +
        tokenTemplates[token].name +
        " token.",
      options: (["MF", "BF"] as const).map((attack) => ({
        id: attack,
        label: tokenTemplates[token].name + " · " + attack + " attack",
      })),
    };
  };
  return {
    events: new Map<string, EventBehavior>([
      [
        pin.version,
        {
          onEvent(s, id, event) {
            const found = observe(s, id, event);
            return found
              ? [
                  {
                    sourceId: id,
                    controller: found.source.controller,
                    handler,
                    event,
                  },
                ]
              : [];
          },
        },
      ],
    ]),
    triggers: new Map<string, TriggerBehavior>([
      [
        handler,
        {
          choices,
          placementChoices,
          resolve(s, t) {
            const options = choices(s, t).options;
            if (!options.some((o) => o.id === t.choice))
              throw Error("Invalid WNDRTECH token choice");
            const token = t.placementChoice as WndrtechToken,
              attack = t.choice as AttackType;
            return effects.create(s, t.controller, t.sourceId, token, attack);
          },
        },
      ],
    ]),
    triggerLabels: new Map([
      [handler, "WNDRTECH: create a token with MF or BF attack."],
    ]),
  };
}
