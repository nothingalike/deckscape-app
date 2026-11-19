import { isDeepStrictEqual } from "node:util";
import retainedSpecs from "./gear-granted-specifications-v1.json";
import simpleSpecs from "./simple-gear-specifications-v3.json";
import { installRamAbility } from "./resource-abilities";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import { versionDefinition, type EngineManifest } from "./definition-version";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";
import type { ActivationEvaluation, AbilityChoices } from "./activate-ability";
import type { ActivationAbilityOption } from "./activation-option";
import type { ActivatedBehavior, ActivatedAction } from "./resolve-ability";
import {
  activatedDamage,
  type ActivatedDamageEffects,
} from "./activated-damage";
import { activatedSourceInformation } from "./activated-source-information";
import type { PsychosisEvaluation } from "./psychosis";
import { duelAbility } from "./duel";
import { destructionScriptTargets } from "./destruction-scripts";
import { isCurrentActionTarget } from "./action-targets";
import { isCurrentIncarnation } from "./object-incarnation";
import type { CharacterCounterEffects } from "./character-counter-abilities";

const specs = [
  ...retainedSpecs,
  ...simpleSpecs.filter(
    (s) =>
      s.kind === "chronos-maestro" ||
      s.kind === "whammy-bar" ||
      s.kind === "demon-shard",
  ),
];
const untargeted = {
  key: "normal",
  label: "Install 2 RAM running",
  modes: [],
  x: null,
  targets: [],
};
function validateInstall(choices: AbilityChoices) {
  if (
    choices.targets.length ||
    choices.modes.length ||
    choices.x !== null ||
    choices.playerTarget !== undefined
  )
    throw Error("Invalid installation choices");
}

/** Gear grants are announced by their host. An announced action retains its
 * handler independently of subsequent detachment, destruction or control changes. */
export function bindGearGrantedAbilities(
  inputs: readonly PinnedDefinition[],
  engine: EngineManifest,
  rulesVersion: string,
  effects: ActivatedDamageEffects & {
    definitions: ReadonlyMap<string, CardCharacteristics>;
    hasAbility(state: GameState, id: string, handler: string): boolean;
    psychosis: PsychosisEvaluation;
    destroy(state: GameState, sourceId: string, targetId: string): GameState;
    putCounters?: CharacterCounterEffects["putCounters"];
  },
) {
  const bound = new Map<string, (typeof specs)[number]>();
  const ids = new Set<string>();
  for (const input of inputs) {
    const pin = versionDefinition(input.definition, engine),
      spec = specs.find((s) => s.cardId === pin.definition.cardId);
    if (
      !spec ||
      ![
        "riot-blade",
        "knux",
        "codebreaker",
        "chronos-maestro",
        "whammy-bar",
        "demon-shard",
      ].includes(spec.kind) ||
      ids.has(spec.cardId) ||
      pin.version !== input.version ||
      pin.definition.rulesVersion !== rulesVersion ||
      !isDeepStrictEqual(
        pin.definition.characteristics,
        characteristicsSchema.parse(spec.characteristics),
      ) ||
      !isDeepStrictEqual(pin.definition.handlers, [
        { id: spec.handlerId, version: spec.handlerVersion, parameters: {} },
      ])
    )
      throw Error("Granted gear definition mismatch");
    ids.add(spec.cardId);
    bound.set(pin.version, spec);
  }
  const check = (state: GameState) => {
    if (
      state.engineVersion !== engine.version ||
      state.rulesVersion !== rulesVersion
    )
      throw Error("Granted gear runtime mismatch");
  };
  const grants = (state: GameState, hostId: string) => {
    check(state);
    if (!bound.size) return [];
    const host = state.objects[hostId];
    if (
      !host ||
      host.faceDown ||
      !state.arena.includes(hostId) ||
      effects.characteristics(state).get(hostId)?.cardType !== "character"
    )
      return [];
    const result = state.arena.flatMap((id) => {
      const object = state.objects[id],
        spec = bound.get(object.definitionVersion);
      if (
        !spec ||
        object.faceDown ||
        !effects.hasAbility(state, id, spec.handlerId) ||
        !effects.hasAbility(state, hostId, spec.handlerId) ||
        !object.attachments.some(
          (a) => a.kind === "gear" && a.hostId === hostId,
        )
      )
        return [];
      return [
        {
          spec,
          definitionVersion: object.definitionVersion,
          abilityId: `gear:${id}:${object.incarnation}:${spec.handlerId}`,
        },
      ];
    });
    const copy = host.copiedAbility;
    if (
      copy?.kind === "gear" &&
      effects.hasAbility(state, hostId, copy.abilityId)
    ) {
      const spec = bound.get(copy.definitionVersion);
      if (!spec || copy.abilityId !== `gear:copied:${spec.handlerId}`)
        throw Error("Invalid copied gear binding");
      result.unshift({
        spec,
        definitionVersion: copy.definitionVersion,
        abilityId: copy.abilityId,
      });
    }
    return result;
  };
  const damage = (source: CardCharacteristics, choices: AbilityChoices) =>
    activatedDamage(
      {
        recipient: choices.playerTarget === undefined ? "character" : "player",
        minimum: 1,
        maximum: 1,
        channel: "BF",
        amount: 1,
      },
      source,
      effects,
    );
  const demonDamage = (source: CardCharacteristics) =>
    activatedDamage(
      {
        recipient: "character",
        minimum: 0,
        maximum: 3,
        channel: "BF",
        amount: 6,
      },
      source,
      effects,
    );
  const targets = (
    state: GameState,
    hostId: string,
    kind: string,
    source: CardCharacteristics,
  ) =>
    destructionScriptTargets(
      state,
      hostId,
      kind === "codebreaker" ? "program" : "character",
      {
        characteristics: effects.characteristics,
        canTarget: (snapshot, id, target) =>
          effects.canTarget(snapshot, id, target, source),
      },
    ).filter((id) => kind !== "whammy-bar" || state.objects[id].running);
  const singleTarget = (choices: AbilityChoices) => {
    if (
      choices.targets.length !== 1 ||
      choices.modes.length ||
      choices.x !== null ||
      choices.playerTarget !== undefined
    )
      throw Error("Invalid granted ability target choices");
    return choices.targets[0];
  };
  const captured = (
    state: GameState,
    action: ActivatedAction,
    kind: string,
  ): ActivatedBehavior => {
    check(state);
    const source = activatedSourceInformation(
      state,
      action,
      effects.characteristics(state),
    );
    if (kind === "chronos-maestro") {
      validateInstall(action.activatedAbility.choices);
      return installRamAbility(2);
    }
    if (kind === "demon-shard") {
      const damage = demonDamage(source).behavior;
      return {
        hasLegalTargets: damage.hasLegalTargets,
        resolve(snapshot, retained, resources) {
          if (!effects.putCounters)
            throw Error("Demon Shard counter runtime unavailable");
          const current = effects.characteristics(snapshot);
          const next =
            isCurrentIncarnation(snapshot, retained.activatedAbility.source) &&
            snapshot.arena.includes(retained.sourceId) &&
            current.get(retained.sourceId)?.cardType === "character"
              ? effects.putCounters(snapshot, retained.sourceId, [
                  {
                    instanceId: retained.sourceId,
                    counter: "-1/-1",
                    amount: 2,
                  },
                ])
              : snapshot;
          return damage.resolve(next, retained, resources);
        },
      };
    }
    if (kind === "knux")
      return duelAbility({
        characteristics: effects.characteristics,
        canTarget: (snapshot, id, target) =>
          effects.canTarget(snapshot, id, target, source),
        damage: (snapshot, packets) =>
          effects.damage(snapshot, packets, source),
      });
    if (kind === "codebreaker" || kind === "whammy-bar")
      return {
        hasLegalTargets: (snapshot, retained) => {
          const id = singleTarget(retained.activatedAbility.choices);
          return (
            isCurrentActionTarget(snapshot, retained, id) &&
            targets(snapshot, retained.sourceId, kind, source).includes(id)
          );
        },
        resolve: (snapshot, retained) =>
          effects.destroy(
            snapshot,
            retained.sourceId,
            singleTarget(retained.activatedAbility.choices),
          ),
      };
    return damage(source, action.activatedAbility.choices).behavior;
  };
  const activated = new Map<string, ActivatedBehavior>();
  for (const spec of bound.values())
    activated.set(spec.handlerId, {
      hasLegalTargets: (state, action) =>
        captured(state, action, spec.kind).hasLegalTargets(state, action),
      resolve: (state, action, resources) =>
        captured(state, action, spec.kind).resolve(state, action, resources),
    });
  return {
    activated,
    copyAbility(
      state: GameState,
      id: string,
      abilityId: string,
    ): import("./copied-abilities").CopiedAbility {
      const grant = grants(state, id).find((g) => g.abilityId === abilityId);
      if (!grant) throw Error("Gear-granted ability unavailable for copying");
      return {
        kind: "gear",
        definitionVersion: grant.definitionVersion,
        abilityId: `gear:copied:${grant.spec.handlerId}`,
      };
    },
    describeCopy(copy: import("./copied-abilities").CopiedAbility) {
      const spec = bound.get(copy.definitionVersion);
      if (
        copy.kind !== "gear" ||
        !spec ||
        copy.abilityId !== `gear:copied:${spec.handlerId}`
      )
        throw Error("Invalid copied gear binding");
      const { grantedTo: _grantedTo, ...ability } =
        spec.characteristics.activatedAbilities[0];
      return structuredClone(ability);
    },
    retargetVariants(
      state: GameState,
      action: ActivatedAction,
    ): import("./activation-option").ActivationVariant[] {
      const spec = [...bound.values()].find(
        (s) => s.handlerId === action.activatedAbility.handler,
      );
      if (!spec) throw Error("Unknown retained gear ability");
      const source = activatedSourceInformation(
        state,
        action,
        effects.characteristics(state),
      );
      if (spec.kind === "chronos-maestro") return [untargeted];
      if (spec.kind === "demon-shard")
        return [demonDamage(source).variant(state, action.sourceId)];
      if (spec.kind === "riot-blade")
        return (["character", "player"] as const).map((recipient) => ({
          ...activatedDamage(
            { recipient, minimum: 1, maximum: 1, channel: "BF", amount: 1 },
            source,
            effects,
          ).variant(state, action.sourceId),
          key: recipient,
          label: `Target a ${recipient}`,
        }));
      return [
        {
          key: "normal",
          label: "New target",
          modes: [],
          x: null,
          targets: [
            {
              label:
                spec.kind === "whammy-bar"
                  ? "Target running character"
                  : spec.kind === "knux"
                    ? "Target character"
                    : "Target program",
              minimum: 1,
              maximum: 1,
              candidates: targets(state, action.sourceId, spec.kind, source),
            },
          ],
        },
      ];
    },
    isGrantedAbility: (abilityId: string) => abilityId.startsWith("gear:"),
    activationOptions(
      state: GameState,
      hostId: string,
    ): ActivationAbilityOption[] {
      return grants(state, hostId).map(({ spec, abilityId }) => {
        const source = effects.characteristics(state).get(hostId)!;
        return {
          abilityId,
          label: `${spec.characteristics.activatedAbilities[0].name} (${spec.characteristics.name})`,
          variants:
            spec.kind === "demon-shard"
              ? [demonDamage(source).variant(state, hostId)]
              : spec.kind === "chronos-maestro"
                ? [untargeted]
                : spec.kind !== "riot-blade"
                  ? [
                      {
                        key: "normal",
                        label: "Normal",
                        modes: [],
                        x: null,
                        targets: [
                          {
                            label:
                              spec.kind === "whammy-bar"
                                ? "Target running character"
                                : spec.kind === "knux"
                                  ? "Target character"
                                  : "Target program",
                            minimum: 1,
                            maximum: 1,
                            candidates: targets(
                              state,
                              hostId,
                              spec.kind,
                              source,
                            ),
                          },
                        ],
                      },
                    ]
                  : (["character", "player"] as const).map((recipient) => ({
                      ...activatedDamage(
                        {
                          recipient,
                          minimum: 1,
                          maximum: 1,
                          channel: "BF",
                          amount: 1,
                        },
                        source,
                        effects,
                      ).variant(state, hostId),
                      key: recipient,
                      label: `Target a ${recipient}`,
                    })),
        };
      });
    },
    activation(
      state: GameState,
      hostId: string,
      abilityId: string,
      choices: AbilityChoices,
    ): ActivationEvaluation {
      const grant = grants(state, hostId).find(
        (g) => g.abilityId === abilityId,
      );
      if (!grant) throw Error("Gear-granted ability is no longer available");
      const ability = grant.spec.characteristics.activatedAbilities[0];
      const source = effects.characteristics(state).get(hostId)!;
      return {
        definitions: effects.definitions,
        sourceCharacteristics: source,
        abilityId,
        handler: grant.spec.handlerId,
        allowed: true,
        ramCost: ability.ramCost,
        run: ability.run,
        revealSource: false,
        psychosis: effects.psychosis,
        validateChoices: (snapshot, selection) => {
          if (grant.spec.kind === "demon-shard")
            return demonDamage(source).validate(snapshot, hostId, selection);
          if (grant.spec.kind === "chronos-maestro")
            return validateInstall(selection);
          if (grant.spec.kind !== "riot-blade") {
            const target = singleTarget(selection);
            if (
              !targets(
                snapshot,
                hostId,
                grant.spec.kind,
                effects.characteristics(snapshot).get(hostId)!,
              ).includes(target)
            )
              throw Error("Illegal granted ability target");
            return;
          }
          damage(
            effects.characteristics(snapshot).get(hostId)!,
            selection,
          ).validate(snapshot, hostId, selection);
        },
      };
    },
  };
}
