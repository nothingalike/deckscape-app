import { isDeepStrictEqual } from "node:util";
import retainedSpecifications from "./character-passive-specifications-v1.json";
import factionSpecifications from "./faction-passive-specifications-v3.json";
const specifications = [...retainedSpecifications, ...factionSpecifications];
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import { versionDefinition, type EngineManifest } from "./definition-version";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";
import type { StatEffect } from "./stat-layers";

export interface CharacterPassiveEvaluation {
  /** Layers 1-6 select the retained passive after ability copy/removal/text effects. */
  hasAbility(state: GameState, sourceId: string, handler: string): boolean;
  hasTether(state: GameState, sourceId: string): boolean;
}

function inPlay(state: GameState) {
  return [
    ...state.arena,
    ...state.environment,
    ...state.players.flatMap((player) => [
      ...player.zones.ramBank,
      ...player.zones.mainframe,
    ]),
  ];
}

/** Character membership, including indirect links; each character is counted once.
 * Current keyword evaluation is required: two attachment records alone are not TETHER. */
function tetherCharacters(
  state: GameState,
  current: ReadonlyMap<string, CardCharacteristics>,
  evaluated: CharacterPassiveEvaluation,
) {
  const adjacency = new Map<string, Set<string>>();
  for (const id of state.arena) {
    if (!current.has(id)) throw new Error("Tether characteristics unavailable");
    if (current.get(id)!.cardType === "character") adjacency.set(id, new Set());
  }
  for (const id of inPlay(state)) {
    if (!evaluated.hasTether(structuredClone(state), id)) continue;
    const hosts = state.objects[id].attachments
      .filter(
        (link) =>
          link.kind === "gear" &&
          (link.port === "leftArm" || link.port === "rightArm"),
      )
      .map((link) => link.hostId);
    if (
      hosts.length !== 2 ||
      hosts[0] === hosts[1] ||
      hosts.some((host) => !adjacency.has(host))
    )
      continue;
    adjacency.get(hosts[0])!.add(hosts[1]);
    adjacency.get(hosts[1])!.add(hosts[0]);
  }
  const sizes = new Map<string, number>();
  for (const root of adjacency.keys()) {
    if (sizes.has(root)) continue;
    const found = new Set<string>(),
      pending = [root];
    while (pending.length) {
      const id = pending.pop()!;
      if (found.has(id)) continue;
      found.add(id);
      pending.push(...adjacency.get(id)!);
    }
    for (const id of found) sizes.set(id, found.size);
  }
  return sizes;
}

/** Continuous layer-7d contributions. The owning runtime combines these with other
 * passive/temporary effects before counter and swap layers; no support is promoted. */
export function bindCharacterPassives(
  inputs: readonly PinnedDefinition[],
  engine: EngineManifest,
  rulesVersion: string,
  evaluated: CharacterPassiveEvaluation,
) {
  const engineVersion = engine.version;
  const bound = new Map<string, (typeof specifications)[number]>(),
    seen = new Set<string>();
  for (const input of inputs) {
    const pin = versionDefinition(input.definition, engine);
    const spec = specifications.find(
      (item) => item.cardId === pin.definition.cardId,
    );
    if (
      pin.version !== input.version ||
      pin.definition.rulesVersion !== rulesVersion
    )
      throw new Error("Character passive definition pin mismatch");
    if (!spec || seen.has(spec.cardId))
      throw new Error("Unknown or duplicate character passive binding");
    if (
      !isDeepStrictEqual(
        pin.definition.characteristics,
        characteristicsSchema.parse(spec.characteristics),
      ) ||
      !isDeepStrictEqual(pin.definition.handlers, [
        { id: spec.handlerId, version: spec.handlerVersion, parameters: {} },
      ])
    )
      throw new Error(
        "Character definition does not match its versioned passive implementation",
      );
    seen.add(spec.cardId);
    bound.set(pin.version, structuredClone(spec));
  }
  return {
    statEffects(
      state: GameState,
      beforeStats: ReadonlyMap<string, CardCharacteristics>,
    ): Map<string, StatEffect[]> {
      if (
        state.engineVersion !== engineVersion ||
        state.rulesVersion !== rulesVersion
      )
        throw new Error("Character passive runtime version mismatch");
      const result = new Map<string, StatEffect[]>();
      let chainSizes: Map<string, number> | undefined;
      for (const id of state.arena) {
        const source = state.objects[id],
          spec = bound.get(source.definitionVersion);
        if (
          !spec ||
          source.faceDown ||
          !evaluated.hasAbility(structuredClone(state), id, spec.handlerId)
        )
          continue;
        const card = beforeStats.get(id);
        if (!card)
          throw new Error(
            "Character passive source characteristics unavailable",
          );
        if (card.cardType !== "character") continue;
        let count: number;
        if (spec.kind === "other-named-cards") {
          count = inPlay(state).filter((other) => {
            const object = state.objects[other],
              current = beforeStats.get(other);
            if (!current)
              throw new Error(
                "Named character reference characteristics unavailable",
              );
            // CR 201.3/110.6f: the named card reference uses effective name and excludes tokens.
            return (
              other !== id &&
              !object.token &&
              object.controller === source.controller &&
              current.name === spec.characteristics.name
            );
          }).length;
        } else if (spec.kind === "other-mystic-persistents") {
          count = [
            ...state.arena,
            ...state.environment,
            ...state.players.flatMap((p) => p.zones.ramBank),
          ].filter(
            (other) =>
              other !== id &&
              state.objects[other].controller === source.controller &&
              beforeStats.get(other)?.factions.includes("MYSTIC"),
          ).length;
        } else if (spec.kind === "other-nanobot-characters") {
          count = state.arena.filter((other) => {
            const current = beforeStats.get(other);
            return (
              other !== id &&
              state.objects[other].controller === source.controller &&
              current?.cardType === "character" &&
              current.factions.includes("NANOBOT")
            );
          }).length;
        } else if (spec.kind === "other-tether-characters") {
          chainSizes ??= tetherCharacters(state, beforeStats, evaluated);
          count = (chainSizes.get(id) ?? 1) - 1;
        } else throw new Error("Unknown character passive kind");
        if (!count) continue;
        result.set(id, [
          {
            id: `${id}:${source.incarnation}:${spec.handlerId}`,
            timestamp: source.timestamp,
            dependsOn: [],
            layer: "7d",
            operation: "add",
            attack: count,
            defence:
              spec.kind === "other-named-cards" ||
              spec.kind === "other-nanobot-characters"
                ? 0
                : count,
          },
        ]);
      }
      return result;
    },
  };
}
