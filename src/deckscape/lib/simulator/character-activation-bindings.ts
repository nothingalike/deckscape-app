import { eclipseActivation, type EclipseEffects } from "./eclipse-dropship";
import eclipseSpec from "./eclipse-dropship-specification-v5.json";
import { singularityActivation } from "./singularity";
import singularitySpec from "./singularity-specification-v5.json";
import { serialKiller } from "./serial-killer";
import serialKillerSpec from "./serial-killer-specification-v5.json";
import oracleSpec from "./oracle-specification-v5.json";
import madHatterSpec from "./mad-hatter-specification-v5.json";
import aliceSpec from "./alice-specification-v5.json";
import { aliceAbility } from "./alice-dreamwalker";
import { priestOfMahkav } from "./priest-of-mahkav";
import type { CharacterDestructionCostEffects } from "./character-destruction-cost";
import xandraSpec from "./xandra-specification-v3.json";
import { xandra, type XandraEffects } from "./xandra";
import priestSpec from "./priest-specification-v3.json";
import trixieSpec from "./trixie-specification-v3.json";
import moonSpecifications from "./moon-sister-specifications-v3.json";
import { floorScore, validateFloorScore } from "./trixie";
import { isMoonPath, moonPath } from "./moon-sisters";
import mindDelverSpec from "./mind-delver-specification-v3.json";
import {
  invasiveThoughts,
  mindDelverVariants,
  validateInvasiveThoughts,
} from "./mind-delver";
import reanimatorSpec from "./reanimator-specification-v3.json";
import {
  recompile,
  reanimatorPurge,
  reanimatorVariants,
  validateRecompile,
  type ReanimatorEffects,
} from "./reanimator";
import terrySpec from "./terry-specification-v3.json";
import archangelSpec from "./project-archangel-specification-v3.json";
import {
  archangelJudgmentDay,
  type JudgmentDayEffects,
} from "./project-archangel";
import {
  selfDestructCharacter,
  isSelfDestructAbility,
} from "./self-destruct-characters";
import { isDeepStrictEqual } from "node:util";
import { cashOut } from "./venture-capitalist";
import { offWithTheirHeads } from "./queen-of-hearts";
import { activatedSourceInformation } from "./activated-source-information";
import { bloodMoney, type BloodMoneyEffects } from "./blood-money";
import { metalHead, swipePlatinum, type ShredEffects } from "./metal-head";
import { quickenThePulse } from "./quicken-the-pulse";
import { smashAndGrabActivation } from "./badlands-marauder";
import {
  characterDrawReplacements,
  type CharacterDrawReplacementSpecification,
} from "./character-draw-replacements";
import {
  characterProgramCosts,
  type CharacterProgramCostSpecification,
} from "./character-program-costs";
import { severance, severanceTargets } from "./severance";
import { kernelPanic } from "./kernel-panic";
import { yesMan, type YesManEffects } from "./yes-man";
import {
  characterDamageReplacements,
  type CharacterDamageReplacementSpecification,
} from "./character-damage-replacements";
import {
  searchAndDestroy,
  type SelfDestructionCost,
} from "./search-and-destroy";
import { venomBlade } from "./venom-blade";
import {
  bloodInTheWater,
  damagedCharacterTargets,
  validateBloodInTheWater,
  type BloodInTheWaterEffects,
} from "./boardroom-shark";
import {
  dumpsterSalvage,
  salvageTargets,
  validateSalvageChoices,
  type SalvageEffects,
} from "./salvage";
import {
  characterCounterAbility,
  type CharacterCounterSpecification,
  type CharacterCounterEffects,
} from "./character-counter-abilities";
import { installRamAbility } from "./resource-abilities";
import { duelAbility, type DuelEffects } from "./duel";
import {
  duelDestructionFollowup,
  type DuelDestructionFollowup,
} from "./duel-destruction-followup";
import type { ResolutionContinuationBehavior } from "./resolution-continuation";
import { lasersawRampage, type RampageEffects } from "./lasersaw-rampage";
import { bindCharacterKeywords } from "./character-keyword-bindings";
import type { CombatKeyword } from "./combat-keywords";
import type { TriggerBehavior } from "./resolve-trigger";
import {
  characterDamageSweep,
  windmill,
  callOfTheChrome,
  validateUntargetedCharacterEffect,
  type CharacterSweepSpecification,
} from "./character-sweep-effects";
import {
  temporaryCombatAbility,
  type TemporaryCombatSpecification,
} from "./temporary-combat-abilities";
import {
  topCardsAbility,
  topCardCandidates,
  completeTopCards,
  validateTopCardsContinuation,
  type TopCardsSpecification,
  type TopCardsEffects,
  type TopCardsEvaluation,
} from "./top-cards";
import {
  activatedDamage,
  type ActivatedDamageEffects,
  type ActivatedDamageSpecification,
} from "./activated-damage";
import {
  deepDiverRecovery,
  recoveryTargets,
  validateRecoveryChoices,
} from "./deep-diver";
import retainedSpecifications from "./character-activation-specifications-v1.json";
import counterSpecifications from "./counter-character-specifications-v3.json";
import resourceSpecifications from "./resource-character-specifications-v3.json";
import thrasherSpecifications from "./thrasher-character-specifications-v3.json";
import { thrasherAbility, isThrasherAbility } from "./thrasher-abilities";
import choiceSpecifications from "./choice-character-specifications-v3.json";
import {
  channelCharacterAbility,
  isChannelAbility,
} from "./channel-character-abilities";
import easySpecifications from "./easy-character-activation-specifications-v3.json";
type RetainedActivationSpecification = (typeof retainedSpecifications)[number];
type WidenSpecificationTags<T extends RetainedActivationSpecification> =
  T extends unknown
    ? Omit<T, "characteristics"> & {
        characteristics: Omit<T["characteristics"], "tags"> & {
          tags: string[];
        };
      }
    : never;
const specifications: WidenSpecificationTags<RetainedActivationSpecification>[] =
  [
    oracleSpec,
    serialKillerSpec,
    { ...eclipseSpec, keywords: [] },
    singularitySpec,
    madHatterSpec,
    aliceSpec,
    mindDelverSpec,
    reanimatorSpec,
    terrySpec,
    archangelSpec,
    ...retainedSpecifications,
    ...easySpecifications,
    ...moonSpecifications,
    trixieSpec,
    priestSpec,
    xandraSpec,
    ...choiceSpecifications,
    ...thrasherSpecifications,
    ...resourceSpecifications,
    ...counterSpecifications,
  ];
import { characterImplementationHandlers } from "./character-implementation-handlers";
import {
  characterHitTriggers,
  type CharacterHitEffects,
  type CharacterHitTriggerSpecification,
} from "./character-hit-triggers";
import { versionDefinition, type EngineManifest } from "./definition-version";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";
import type { AbilityChoices, ActivationEvaluation } from "./activate-ability";
import type { ActivationAbilityOption } from "./activation-option";
import {
  acpdDetain,
  characterStatusTargets,
  validateCharacterStatusChoices,
} from "./character-status-effects";
import {
  novaLucidity,
  type ActivatedAction,
  type ActivatedBehavior,
} from "./resolve-ability";
import type { StatusEvaluation } from "./persistent-status";
import {
  characterDeckSearch,
  finishCharacterSearch,
  characterSearchCandidates,
  type CharacterSearchSpecification,
  pastLifeSpecification,
  pastLifeHandler,
  type PastLifeEffects,
} from "./past-life";
import {
  validateDeckSearchContinuation,
  type DeckSearchEvaluation,
} from "./deck-search";

type Character = Extract<CardCharacteristics, { cardType: "character" }>;
type PrintedAbility = Character["activatedAbilities"][number];
export interface CharacterActivationEffects {
  eclipse?: EclipseEffects;
  xandra?: XandraEffects;
  characterDestructionCost?: CharacterDestructionCostEffects;
  normalizeControl?(s: GameState): GameState;
  reanimator?: ReanimatorEffects;
  destroyBatch?(
    state: GameState,
    sourceId: string,
    ids: readonly string[],
  ): GameState;
  shred?: Pick<ShredEffects, "attachment">;
  bloodMoney?: Pick<BloodMoneyEffects, "destroyRam">;
  drawReplacementEnabled?(
    state: GameState,
    sourceId: string,
    handler: string,
  ): boolean;
  definitions(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  /** Includes current ability ownership/existence, prohibitions and all cost modifiers. */
  evaluate(
    state: GameState,
    sourceId: string,
    abilityId: string,
    choices: AbilityChoices,
    printed: PrintedAbility,
  ): Pick<
    ActivationEvaluation,
    | "allowed"
    | "ramCost"
    | "run"
    | "revealSource"
    | "additionalCostText"
    | "psychosis"
  >;
  /** Resolution receives the captured source characteristics even if the source departed. */
  canTarget(
    state: GameState,
    sourceId: string,
    targetId: string,
    source: CardCharacteristics,
  ): boolean;
  status?: StatusEvaluation & {
    runCharacters?(
      state: GameState,
      sourceId: string,
      ids: readonly string[],
    ): GameState;
  };
  salvage?: Pick<SalvageEffects, "moveToHand">;
  destruction?: Pick<BloodInTheWaterEffects, "destroy">;
  selfDestructionCost?: SelfDestructionCost;
  isTether?(state: GameState, id: string): boolean;
  mainframeCounters?: CharacterActivationEffects["counters"];
  yes?: Pick<YesManEffects, "targetsCacheAction" | "counter" | "putCounters">;
  damageReplacementEnabled?(
    state: GameState,
    sourceId: string,
    handler: string,
  ): boolean;
  counters?: {
    putCounters(
      ...args: [
        ...Parameters<CharacterCounterEffects["putCounters"]>,
        source: CardCharacteristics,
      ]
    ): GameState;
  };
  search?: Omit<PastLifeEffects, "characteristics">;
  damage?: Pick<ActivatedDamageEffects, "canTargetPlayer" | "damage">;
  topCards?: Omit<TopCardsEffects, "characteristics">;
  duel?: Pick<DuelEffects, "damage">;
  hits?: Omit<CharacterHitEffects, "characteristics">;
  keywordEnabled?(
    state: GameState,
    sourceId: string,
    keyword: CombatKeyword,
  ): boolean;
  judgmentDay?: Omit<JudgmentDayEffects, "characteristics">;
  rampage?: Pick<RampageEffects, "destroy">;
  programCostEnabled?(
    state: GameState,
    sourceId: string,
    handler: string,
  ): boolean;
}

/** Binds the named activations and explicitly specified hit triggers under one card
 * pin. Partial character definitions may be exercised while unimplemented, but are
 * still rejected by deck admission. This function never upgrades a card's support,
 * registers a release or infers missing passive effects from prose.
 */
export function bindCharacterActivations(
  inputs: readonly PinnedDefinition[],
  engine: EngineManifest,
  rulesVersion: string,
  effects: CharacterActivationEffects,
) {
  const engineVersion = engine.version;
  const searchSpecs = new Map<string, CharacterSearchSpecification>([
    [pastLifeHandler, pastLifeSpecification],
    ...specifications.flatMap((spec) =>
      spec.abilities.flatMap((ability) =>
        "search" in ability
          ? [
              [
                ability.handlerId,
                ability.search as CharacterSearchSpecification,
              ] as const,
            ]
          : [],
      ),
    ),
  ]);
  const specs = new Map(specifications.map((spec) => [spec.cardId, spec]));
  const temporarySpecs = new Map(
    specifications.flatMap((spec) =>
      spec.abilities.flatMap((ability) =>
        "temporaryCombat" in ability
          ? [
              [
                ability.abilityId,
                ability.temporaryCombat as TemporaryCombatSpecification,
              ] as const,
            ]
          : [],
      ),
    ),
  );
  const topSpecs = new Map(
    specifications.flatMap((spec) =>
      spec.abilities.flatMap((ability) =>
        "topCards" in ability
          ? [
              [
                ability.handlerId,
                {
                  abilityId: ability.abilityId,
                  spec: ability.topCards as TopCardsSpecification,
                },
              ] as const,
            ]
          : [],
      ),
    ),
  );
  const damageSpecs = new Map(
    specifications.flatMap((spec) =>
      spec.abilities.flatMap((ability) =>
        "damage" in ability
          ? [
              [
                ability.abilityId,
                ability.damage as ActivatedDamageSpecification,
              ] as const,
            ]
          : [],
      ),
    ),
  );
  const installs = new Map(
    specifications.flatMap((spec) =>
      spec.abilities.flatMap((ability) =>
        "installCount" in ability
          ? [[ability.abilityId, ability.installCount] as const]
          : [],
      ),
    ),
  );
  const duels = new Set(
    specifications.flatMap((spec) =>
      spec.abilities
        .filter((ability) => "duel" in ability)
        .map((ability) => ability.abilityId),
    ),
  );
  const definitions = new Map<
    string,
    {
      pin: ReturnType<typeof versionDefinition>;
      spec: (typeof specifications)[number];
    }
  >();
  const seen = new Set<string>();
  for (const input of inputs) {
    const pin = versionDefinition(input.definition, engine);
    const spec = specs.get(pin.definition.cardId);
    if (
      pin.version !== input.version ||
      pin.definition.rulesVersion !== rulesVersion
    )
      throw new Error("Character activation definition pin mismatch");
    if (!spec || seen.has(pin.definition.cardId))
      throw new Error("Unknown or duplicate character activation binding");
    const expected = characteristicsSchema.parse(spec.characteristics);
    if (
      !isDeepStrictEqual(pin.definition.characteristics, expected) ||
      !isDeepStrictEqual(
        pin.definition.handlers,
        characterImplementationHandlers(spec),
      )
    )
      throw new Error(
        "Character definition does not match its versioned activation implementation",
      );
    if (expected.cardType !== "character")
      throw new Error("Invalid character activation specification");
    if (
      pin.definition.support !== "unimplemented" &&
      spec.abilities.length !== expected.activatedAbilities.length
    )
      throw new Error("Character still has unbound activated abilities");
    if (
      spec.abilities.some((ability) => ability.abilityId === "detain") &&
      !effects.status
    )
      throw new Error("Character status runtime unavailable");
    if (
      spec.abilities.some((a) => a.abilityId === "judgment-day") &&
      !effects.judgmentDay
    )
      throw Error("Judgment Day runtime unavailable");
    if (
      spec.abilities.some((a) => a.abilityId === "swipe-platinum") &&
      !effects.shred
    )
      throw Error("SWIPE attachment runtime unavailable");
    if (
      spec.abilities.some((a) => a.abilityId === "recompile") &&
      !effects.reanimator
    )
      throw Error("Reanimator runtime unavailable");
    if (
      spec.abilities.some((a) => a.abilityId === "invasive-thoughts") &&
      (!effects.normalizeControl || !effects.status)
    )
      throw Error("Mind Delver runtime unavailable");
    seen.add(pin.definition.cardId);
    if (spec.damageReplacements?.length && !effects.damageReplacementEnabled)
      throw new Error("Character damage replacement runtime unavailable");
    if (spec.drawReplacements?.length && !effects.drawReplacementEnabled)
      throw new Error("Character draw replacement evaluator unavailable");
    if (spec.programCostReductions?.length && !effects.programCostEnabled)
      throw new Error("Character program cost runtime unavailable");
    if (
      spec.abilities.some((ability) => ability.abilityId === "yes") &&
      !effects.yes
    )
      throw new Error("Yes counter runtime unavailable");
    if (
      spec.abilities.some((ability) => ability.abilityId === "kernel-panic") &&
      !effects.mainframeCounters
    )
      throw new Error("Mainframe counter runtime unavailable");
    if (
      spec.abilities.some((ability) => ability.abilityId === "severance") &&
      (!effects.isTether || !effects.destruction)
    )
      throw new Error("Severance runtime unavailable");
    if (
      spec.abilities.some(
        (ability) =>
          ability.abilityId === "search-and-destroy" ||
          isSelfDestructAbility(ability.abilityId),
      ) &&
      !effects.selfDestructionCost
    )
      throw new Error("Self-destruction cost runtime unavailable");
    if (
      spec.abilities.some(
        (ability) => ability.abilityId === "blood-in-the-water",
      ) &&
      !effects.destruction
    )
      throw new Error("Character destruction runtime unavailable");
    if (
      spec.abilities.some((ability) => ability.abilityId === "salvage") &&
      !effects.salvage
    )
      throw new Error("Salvage movement runtime unavailable");
    if (spec.keywords?.length && !effects.keywordEnabled)
      throw new Error("Character keyword runtime unavailable");
    if (
      spec.abilities.some(
        (ability) => "counter" in ability || ability.abilityId === "windmill",
      ) &&
      !effects.counters
    )
      throw new Error("Character counter runtime unavailable");
    if (
      spec.abilities.some((ability) => "rampage" in ability) &&
      !effects.rampage
    )
      throw new Error("Rampage destruction runtime unavailable");
    if (spec.hitTriggers?.length && !effects.hits)
      throw new Error("Character hit runtime unavailable");
    if (spec.abilities.some((ability) => "duel" in ability) && !effects.duel)
      throw new Error("Duel runtime unavailable");
    if (
      spec.abilities.some((ability) => ability.abilityId === "blood-money") &&
      !effects.bloodMoney
    )
      throw new Error("BLOOD MONEY runtime unavailable");
    if (
      spec.abilities.some((ability) => "topCards" in ability) &&
      !effects.topCards
    )
      throw new Error("Top-card runtime unavailable");
    if (
      spec.abilities.some(
        (ability) =>
          "damage" in ability ||
          ability.abilityId === "windmill" ||
          ability.abilityId === "malice" ||
          isMoonPath(ability.abilityId) ||
          ability.abilityId === "blood-money" ||
          "duelFollowup" in ability ||
          "sweep" in ability ||
          ability.abilityId === "venom-blade" ||
          ability.abilityId === "search-and-destroy" ||
          isSelfDestructAbility(ability.abilityId),
      ) &&
      !effects.damage
    )
      throw new Error("Character damage runtime unavailable");
    if (
      spec.abilities.some((ability) => searchSpecs.has(ability.handlerId)) &&
      !effects.search
    )
      throw new Error("Character search runtime unavailable");
    definitions.set(pin.version, { pin, spec });
  }
  const assertVersion = (state: GameState) => {
    if (
      state.engineVersion !== engineVersion ||
      state.rulesVersion !== rulesVersion
    )
      throw new Error("Character activation runtime version mismatch");
  };
  const source = (state: GameState, id: string) => {
    assertVersion(state);
    const bound = definitions.get(
      state.objects[id]?.copiedAbility?.definitionVersion ??
        state.objects[id]?.definitionVersion,
    );
    if (!bound)
      throw new Error("Character source has no pinned activation binding");
    return bound;
  };
  const effectiveSource = (state: GameState, id: string) => {
    const current = effects.characteristics(structuredClone(state)).get(id);
    if (!current)
      throw new Error(
        "Character activation source characteristics unavailable",
      );
    return current;
  };
  const targeting = (sourceCharacteristics: CardCharacteristics) => ({
    characteristics: effects.characteristics,
    canTarget: (state: GameState, sourceId: string, targetId: string) =>
      effects.canTarget(
        structuredClone(state),
        sourceId,
        targetId,
        structuredClone(sourceCharacteristics),
      ),
  });
  const validate = (
    state: GameState,
    id: string,
    abilityId: string,
    choices: AbilityChoices,
  ) => {
    if (abilityId === "will-into-being")
      return validateUntargetedCharacterEffect(choices);
    if (abilityId === "infiltrate")
      return validateUntargetedCharacterEffect(choices);
    if (abilityId === "rewrite") return serialKiller.validate(state, choices);
    if (abilityId === "off-with-their-heads")
      return queenBinding(effectiveSource(state, id)).validate(
        state,
        id,
        choices,
      );
    if (abilityId === "windmill")
      return validateUntargetedCharacterEffect(choices);
    if (abilityId === "kernel-panic") {
      kernelBinding(effectiveSource(state, id)).validate(state, id, choices);
      return;
    }
    if (abilityId === "yes") {
      yesBinding(effectiveSource(state, id)).validate(state, id, choices);
      return;
    }
    const counter = source(state, id).spec.abilities.find(
      (ability) => ability.abilityId === abilityId,
    );
    if (counter && searchSpecs.has(counter.handlerId)) {
      validateUntargetedCharacterEffect(choices);
      return;
    }
    if (counter && "counter" in counter) {
      counterBinding(
        counter.counter as CharacterCounterSpecification,
        effectiveSource(state, id),
      ).validate(state, id, choices);
      return;
    }
    const temporary = temporarySpecs.get(abilityId);
    if (temporary) {
      temporaryCombatAbility(
        temporary,
        targeting(effectiveSource(state, id)),
      ).validate(state, id, choices);
      return;
    }
    if (isThrasherAbility(abilityId)) {
      thrasherBinding(abilityId, effectiveSource(state, id)).validate(
        state,
        id,
        choices,
      );
      return;
    }
    if (abilityId === "sacrificial-offering")
      return priestOfMahkav(effects.characterDestructionCost!).validate(
        state,
        id,
        choices,
      );
    if (abilityId === "swarm-strike")
      return xandra(effects.xandra!).validate(state, id, choices);
    if (abilityId === "living-backwards" || abilityId === "checkmate")
      return aliceAbility(
        abilityId,
        effectiveSource(state, id),
        effects,
      ).validate(state, id, choices);
    if (abilityId === "floor-score") return validateFloorScore(choices);
    if (isMoonPath(abilityId)) {
      moonBinding(abilityId, effectiveSource(state, id)).validate(
        state,
        id,
        choices,
      );
      return;
    }
    if (isChannelAbility(abilityId)) {
      channelBinding(abilityId, effectiveSource(state, id)).validate(
        state,
        id,
        choices,
      );
      return;
    }
    const damage = damageSpecs.get(abilityId);
    if (damage) {
      damageBinding(damage, effectiveSource(state, id)).validate(
        state,
        id,
        choices,
      );
      return;
    }
    if (isSelfDestructAbility(abilityId))
      return sacrificeBinding(abilityId, effectiveSource(state, id)).validate(
        state,
        id,
        choices,
      );
    if (abilityId === "search-and-destroy") {
      selfDestructionBinding(effectiveSource(state, id)).validate(
        state,
        id,
        choices,
      );
      return;
    }
    if (abilityId === "swipe-platinum") {
      swipeBinding().validate(state, id, choices);
      return;
    }
    if (abilityId === "shred") {
      shredBinding().validate(state, id, choices);
      return;
    }
    if (abilityId === "blood-money") {
      bloodBinding(effectiveSource(state, id)).validate(state, id, choices);
      return;
    }
    if (choices.playerTarget !== undefined)
      throw new Error("Unexpected activated player target");
    if (abilityId === "severance") {
      severance(severanceEffects(effectiveSource(state, id))).validate(
        state,
        id,
        choices,
      );
      return;
    }
    if (abilityId === "venom-blade") {
      venomBinding(effectiveSource(state, id)).validate(state, id, choices);
      return;
    }
    if (
      abilityId === "lucidity" ||
      abilityId === "cash-out" ||
      abilityId === "windmill" ||
      abilityId === "quicken-the-pulse" ||
      abilityId === "smash-and-grab" ||
      abilityId === "unchained-rage" ||
      abilityId === "judgment-day" ||
      abilityId === "rampage" ||
      abilityId === "gas-cloud" ||
      abilityId === "system-shock" ||
      abilityId === "call-of-the-chrome" ||
      abilityId === "past-life" ||
      [...topSpecs.values()].some((entry) => entry.abilityId === abilityId) ||
      installs.has(abilityId)
    ) {
      if (choices.targets.length || choices.modes.length || choices.x !== null)
        throw new Error("Invalid untargeted activation choices");
    } else if (abilityId === "detain" || duels.has(abilityId))
      validateCharacterStatusChoices(
        state,
        id,
        choices,
        targeting(effectiveSource(state, id)),
      );
    else if (abilityId === "blood-in-the-water")
      validateBloodInTheWater(
        state,
        id,
        choices,
        targeting(effectiveSource(state, id)),
      );
    else if (abilityId === "invasive-thoughts")
      validateInvasiveThoughts(
        state,
        state.objects[id].controller,
        id,
        choices,
        targeting(effectiveSource(state, id)),
      );
    else if (abilityId === "recompile")
      validateRecompile(
        state,
        state.objects[id].controller,
        id,
        choices,
        targeting(effectiveSource(state, id)),
      );
    else if (abilityId === "salvage")
      validateSalvageChoices(
        state,
        state.objects[id].controller,
        id,
        choices,
        targeting(effectiveSource(state, id)),
      );
    else if (abilityId === "recovery")
      validateRecoveryChoices(
        state,
        state.objects[id].controller,
        id,
        choices,
        targeting(effectiveSource(state, id)),
      );
    else throw new Error("Unbound character activation");
  };
  const activated = new Map<string, ActivatedBehavior>();
  const severanceEffects = (source: CardCharacteristics) => ({
    ...targeting(source),
    tether: (state: GameState, id: string) => effects.isTether!(state, id),
    destroy: (state: GameState, sourceId: string, id: string) =>
      effects.destruction!.destroy(state, sourceId, id),
  });
  const sacrificeBinding = (id: string, source: CardCharacteristics) =>
    selfDestructCharacter(id, source, {
      characteristics: effects.characteristics,
      canTarget: effects.canTarget,
      ...effects.damage!,
      pay: (state, sourceId) =>
        effects.selfDestructionCost!.pay(state, sourceId),
    });
  const selfDestructionBinding = (source: CardCharacteristics) =>
    searchAndDestroy(source, {
      characteristics: effects.characteristics,
      canTarget: effects.canTarget,
      ...effects.damage!,
      pay: (state, sourceId) =>
        effects.selfDestructionCost!.pay(state, sourceId),
    });
  const venomBinding = (source: CardCharacteristics) =>
    venomBlade(source, {
      characteristics: effects.characteristics,
      canTarget: effects.canTarget,
      ...effects.damage!,
    });
  const queenBinding = (source: CardCharacteristics) =>
    offWithTheirHeads({
      ...targeting(source),
      destroyBatch: (state, sourceId, ids) => {
        if (!effects.destroyBatch)
          throw Error("Character batch destruction unavailable");
        return effects.destroyBatch(state, sourceId, ids);
      },
    });
  const counterBinding = (
    spec: CharacterCounterSpecification,
    captured: CardCharacteristics,
  ) =>
    characterCounterAbility(spec, {
      ...targeting(captured),
      putCounters: (state, sourceId, placements) =>
        effects.counters!.putCounters(
          state,
          sourceId,
          placements,
          structuredClone(captured),
        ),
    });
  const kernelBinding = (captured: CardCharacteristics) =>
    kernelPanic({
      ...targeting(captured),
      putCounters: (state, sourceId, placements) =>
        effects.mainframeCounters!.putCounters(
          state,
          sourceId,
          placements,
          structuredClone(captured),
        ),
    });
  const yesBinding = (captured: CardCharacteristics) =>
    yesMan({
      ...targeting(captured),
      targetsCacheAction: (state, action) =>
        effects.yes!.targetsCacheAction(state, action),
      counter: (state, actionId, sourceId) =>
        effects.yes!.counter(state, actionId, sourceId),
      putCounters: (state, sourceId, placements) =>
        effects.yes!.putCounters(state, sourceId, placements),
    });
  const continuations = new Map<string, ResolutionContinuationBehavior>();
  const delayedBehaviors = new Map<string, TriggerBehavior>();
  const bloodBinding = (source: CardCharacteristics) =>
    bloodMoney(source, {
      characteristics: effects.characteristics,
      canTarget: effects.canTarget,
      ...effects.damage!,
      ...effects.bloodMoney!,
    });
  // SWIPE targets the gear only. Its instructed attachment does not target the hosts.
  const swipeBinding = () =>
    swipePlatinum({
      characteristics: effects.characteristics,
      canTarget: (s, id, target) =>
        effects.canTarget(s, id, target, effectiveSource(s, id)),
      damage: () => {
        throw Error("SWIPE must not duel");
      },
      attachment: (s, id) => ({
        ...effects.shred!.attachment(s, id),
        permittedHosts: new Set(s.arena),
      }),
    });
  const shredBinding = () =>
    metalHead({
      characteristics: effects.characteristics,
      canTarget: (state, id, target) =>
        effects.canTarget(state, id, target, effectiveSource(state, id)),
      damage: (state, packets) => {
        if (!effects.duel) throw new Error("SHRED damage unavailable");
        return effects.duel.damage(state, packets);
      },
      attachment: (state, id) => {
        if (!effects.shred) throw new Error("SHRED attachment unavailable");
        return effects.shred.attachment(state, id);
      },
    });
  const thrasherBinding = (id: string, source: CardCharacteristics) =>
    thrasherAbility(id, {
      ...targeting(source),
      destroy: (state, sourceId, targetId) => {
        if (!effects.destruction)
          throw Error("Character destruction unavailable");
        return effects.destruction.destroy(state, sourceId, targetId);
      },
    });
  const moonBinding = (id: string, source: CardCharacteristics) =>
    moonPath(id, source, {
      characteristics: effects.characteristics,
      canTarget: effects.canTarget,
      ...effects.damage!,
    });
  const channelBinding = (id: string, source: CardCharacteristics) =>
    channelCharacterAbility(id, source, {
      characteristics: effects.characteristics,
      canTarget: effects.canTarget,
      ...effects.damage!,
    });
  const damageBinding = (
    spec: ActivatedDamageSpecification,
    source: CardCharacteristics,
  ) =>
    activatedDamage(spec, source, {
      characteristics: effects.characteristics,
      canTarget: effects.canTarget,
      ...effects.damage!,
    });
  for (const [version, { spec }] of definitions)
    for (const ability of spec.abilities) {
      const check = (state: GameState, action: ActivatedAction) => {
        assertVersion(state);
        const captured = action.activatedAbility;
        if (
          !("damage" in ability) &&
          ability.abilityId !== "malice" &&
          ability.abilityId !== "path-of-darkness" &&
          ability.abilityId !== "search-and-destroy" &&
          ability.abilityId !== "blood-money" &&
          captured.choices.playerTarget !== undefined
        )
          throw new Error("Unexpected activated player target");
        if (
          (captured.source.copiedAbility?.definitionVersion ??
            captured.source.definitionVersion) !== version ||
          captured.source.id !== action.sourceId ||
          captured.abilityId !== ability.abilityId ||
          captured.handler !== ability.handlerId
        )
          throw new Error("Captured character activation binding mismatch");
      };
      const behavior = (action: ActivatedAction): ActivatedBehavior => {
        if (ability.abilityId === "will-into-being")
          return singularityActivation;
        if (ability.abilityId === "infiltrate") {
          if (!effects.eclipse) throw Error("Eclipse runtime unavailable");
          return eclipseActivation(effects.eclipse);
        }
        if (ability.abilityId === "rewrite") return serialKiller.behavior;
        if (ability.abilityId === "cash-out") return cashOut;
        if (isThrasherAbility(ability.abilityId))
          return thrasherBinding(
            ability.abilityId,
            action.activatedAbility.characteristics,
          ).behavior;
        if (ability.abilityId === "sacrificial-offering")
          return priestOfMahkav(effects.characterDestructionCost!).behavior;
        if (ability.abilityId === "swarm-strike")
          return xandra(effects.xandra!).behavior;
        if (
          ability.abilityId === "living-backwards" ||
          ability.abilityId === "checkmate"
        )
          return aliceAbility(
            ability.abilityId,
            action.activatedAbility.characteristics,
            effects,
          ).behavior;
        if (ability.abilityId === "floor-score") return floorScore;
        if (isMoonPath(ability.abilityId))
          return moonBinding(
            ability.abilityId,
            action.activatedAbility.characteristics,
          ).behavior;
        if (isChannelAbility(ability.abilityId))
          return channelBinding(
            ability.abilityId,
            action.activatedAbility.characteristics,
          ).behavior;
        if (ability.abilityId === "swipe-platinum")
          return swipeBinding().behavior;
        if (ability.abilityId === "shred") return shredBinding().behavior;
        if (ability.abilityId === "blood-money")
          return bloodBinding(action.activatedAbility.characteristics).behavior;
        if (ability.abilityId === "yes")
          return yesBinding(action.activatedAbility.characteristics).behavior;
        if (ability.abilityId === "kernel-panic")
          return kernelBinding(action.activatedAbility.characteristics)
            .behavior;
        if (ability.abilityId === "severance")
          return severance(
            severanceEffects(action.activatedAbility.characteristics),
          ).behavior;
        if (isSelfDestructAbility(ability.abilityId))
          return sacrificeBinding(
            ability.abilityId,
            action.activatedAbility.characteristics,
          ).behavior;
        if (ability.abilityId === "search-and-destroy")
          return selfDestructionBinding(action.activatedAbility.characteristics)
            .behavior;
        if (ability.abilityId === "venom-blade")
          return venomBinding(action.activatedAbility.characteristics).behavior;
        const searchSpec = searchSpecs.get(ability.handlerId);
        if (searchSpec)
          return characterDeckSearch(
            { ...effects.search!, characteristics: effects.characteristics },
            ability.handlerId,
            searchSpec,
          );
        if (ability.abilityId === "off-with-their-heads")
          return queenBinding(action.activatedAbility.characteristics).behavior;
        if ("counter" in ability)
          return counterBinding(
            ability.counter as CharacterCounterSpecification,
            action.activatedAbility.characteristics,
          ).behavior;
        if (ability.abilityId === "windmill")
          return windmill({
            characteristics: effects.characteristics,
            damage: (state, packets, source) =>
              effects.damage!.damage(state, packets, source),
            putCounters: (state, sourceId, placements) =>
              effects.counters!.putCounters(
                state,
                sourceId,
                placements,
                structuredClone(action.activatedAbility.characteristics),
              ),
          });
        if ("sweep" in ability)
          return characterDamageSweep(
            ability.sweep as CharacterSweepSpecification,
            {
              characteristics: effects.characteristics,
              damage: (state, packets, source) =>
                effects.damage!.damage(state, packets, source),
            },
          );
        if ("chrome" in ability)
          return callOfTheChrome({ characteristics: effects.characteristics });
        if (ability.abilityId === "invasive-thoughts")
          return invasiveThoughts({
            ...targeting(action.activatedAbility.characteristics),
            ...effects.status!,
            normalize: effects.normalizeControl!,
          });
        if (ability.abilityId === "recompile")
          return recompile(version, ability.handlerId, {
            ...targeting(action.activatedAbility.characteristics),
            ...effects.reanimator!,
          });
        if (ability.abilityId === "judgment-day")
          return archangelJudgmentDay(version, ability.handlerId, {
            ...effects.judgmentDay!,
            characteristics: effects.characteristics,
          }).activated;
        if ("rampage" in ability)
          return lasersawRampage(version, ability.handlerId, {
            characteristics: effects.characteristics,
            destroy: (state, sourceId, targetId) =>
              effects.rampage!.destroy(state, sourceId, targetId),
          }).activated;
        if ("duelFollowup" in ability)
          return duelDestructionFollowup(
            ability.duelFollowup as DuelDestructionFollowup,
            {
              ...targeting(action.activatedAbility.characteristics),
              ...effects.duel!,
              followupDamage: (state, packets, source) =>
                effects.damage!.damage(state, packets, source),
            },
          ).behavior;
        if ("temporaryCombat" in ability)
          return temporaryCombatAbility(
            ability.temporaryCombat as TemporaryCombatSpecification,
            targeting(action.activatedAbility.characteristics),
          ).behavior;
        if ("duel" in ability)
          return duelAbility({
            ...targeting(action.activatedAbility.characteristics),
            ...effects.duel!,
          });
        if ("topCards" in ability)
          return topCardsAbility(
            ability.topCards as TopCardsSpecification,
            ability.handlerId,
            { ...effects.topCards!, characteristics: effects.characteristics },
          );
        if ("damage" in ability)
          return damageBinding(
            ability.damage as ActivatedDamageSpecification,
            action.activatedAbility.characteristics,
          ).behavior;
        if ("installCount" in ability && ability.installCount !== undefined)
          return installRamAbility(ability.installCount);
        if (ability.abilityId === "lucidity") return novaLucidity;
        if (ability.abilityId === "quicken-the-pulse") return quickenThePulse;
        if (ability.abilityId === "smash-and-grab")
          return smashAndGrabActivation(effects.characteristics);
        if (ability.abilityId === "unchained-rage")
          return smashAndGrabActivation(
            effects.characteristics,
            "unchained-rage",
          );
        if (ability.abilityId === "blood-in-the-water")
          return bloodInTheWater({
            ...targeting(action.activatedAbility.characteristics),
            destroy: (state, sourceId, id) =>
              effects.destruction!.destroy(state, sourceId, id),
          });
        if (ability.abilityId === "salvage")
          return dumpsterSalvage({
            ...targeting(action.activatedAbility.characteristics),
            moveToHand: (state, player, id) =>
              effects.salvage!.moveToHand(state, player, id),
          });
        if (ability.abilityId === "recovery")
          return deepDiverRecovery(
            targeting(action.activatedAbility.characteristics),
          );
        if (ability.abilityId === "detain")
          return acpdDetain({
            ...effects.status!,
            ...targeting(action.activatedAbility.characteristics),
          });
        throw new Error("Unknown character activation implementation");
      };
      activated.set(ability.handlerId, {
        hasLegalTargets(state, action) {
          check(state, action);
          return behavior(action).hasLegalTargets(state, action);
        },
        resolve(state, action, resources) {
          check(state, action);
          return behavior(action).resolve(state, action, resources);
        },
      });
      if (ability.abilityId === "recompile")
        delayedBehaviors.set(
          ability.handlerId,
          reanimatorPurge(
            version,
            ability.handlerId,
            effects.reanimator!.purge,
          ),
        );
      if (ability.abilityId === "judgment-day")
        delayedBehaviors.set(
          ability.handlerId,
          archangelJudgmentDay(version, ability.handlerId, {
            ...effects.judgmentDay!,
            characteristics: effects.characteristics,
          }).triggered,
        );
      if ("rampage" in ability)
        delayedBehaviors.set(ability.handlerId, {
          resolve(state, trigger) {
            assertVersion(state);
            return lasersawRampage(version, ability.handlerId, {
              characteristics: effects.characteristics,
              destroy: (snapshot, sourceId, targetId) =>
                effects.rampage!.destroy(snapshot, sourceId, targetId),
            }).triggered.resolve(state, trigger);
          },
        });
      if ("duelFollowup" in ability)
        continuations.set(ability.handlerId, (state, action) => {
          check(state, action);
          return duelDestructionFollowup(
            ability.duelFollowup as DuelDestructionFollowup,
            {
              ...targeting(action.activatedAbility.characteristics),
              ...effects.duel!,
              followupDamage: (snapshot, packets, source) =>
                effects.damage!.damage(snapshot, packets, source),
            },
          ).resume(state, action);
        });
    }
  const hitDefinitions = [...definitions].flatMap(([version, { spec }]) =>
    spec.hitTriggers?.length
      ? [
          {
            version,
            hitTriggers: spec.hitTriggers as CharacterHitTriggerSpecification[],
          },
        ]
      : [],
  );
  const hitBindings = characterHitTriggers(
    hitDefinitions,
    engineVersion,
    rulesVersion,
    {
      characteristics: effects.characteristics,
      ...(effects.hits?.smashAndGrab
        ? {
            smashAndGrab: {
              destroy: (
                ...args: Parameters<
                  NonNullable<CharacterHitEffects["smashAndGrab"]>["destroy"]
                >
              ) => effects.hits!.smashAndGrab!.destroy(...args),
              install: (
                ...args: Parameters<
                  NonNullable<CharacterHitEffects["smashAndGrab"]>["install"]
                >
              ) => effects.hits!.smashAndGrab!.install(...args),
            },
          }
        : {}),
      hasAbility: (state, sourceId, handler) =>
        effects.hits!.hasAbility(state, sourceId, handler),
      canTarget: (state, sourceId, targetId, source) =>
        effects.canTarget(state, sourceId, targetId, source),
      damage: (state, packets, source) =>
        effects.hits!.damage(state, packets, source),
    },
  );
  return {
    ...hitBindings,
    copyAbility(
      state: GameState,
      id: string,
      abilityId: string,
    ): import("./copied-abilities").CopiedAbility {
      const { pin, spec } = source(state, id);
      if (!spec.abilities.some((a) => a.abilityId === abilityId))
        throw Error("Unbound copied ability");
      return { kind: "character", definitionVersion: pin.version, abilityId };
    },
    describeCopy(copy: import("./copied-abilities").CopiedAbility) {
      const entry = definitions.get(copy.definitionVersion);
      const ability = entry?.spec.abilities.find(
        (a) => a.abilityId === copy.abilityId,
      );
      if (
        copy.kind !== "character" ||
        !entry ||
        !ability ||
        entry.pin.definition.characteristics.cardType !== "character"
      )
        throw Error("Invalid copied character binding");
      return structuredClone(
        entry.pin.definition.characteristics.activatedAbilities[ability.index],
      );
    },
    ...characterDrawReplacements(
      [...definitions].flatMap(([version, { spec }]) =>
        spec.drawReplacements?.length
          ? [
              {
                version,
                replacements:
                  spec.drawReplacements as CharacterDrawReplacementSpecification[],
              },
            ]
          : [],
      ),
      engineVersion,
      rulesVersion,
      {
        characteristics: (state) => effects.characteristics(state),
        hasAbility: (state, sourceId, handler) =>
          effects.drawReplacementEnabled!(state, sourceId, handler),
      },
    ),
    ...characterProgramCosts(
      [...definitions].flatMap(([version, { spec }]) =>
        spec.programCostReductions?.length
          ? [
              {
                version,
                costs:
                  spec.programCostReductions as CharacterProgramCostSpecification[],
              },
            ]
          : [],
      ),
      engineVersion,
      rulesVersion,
      {
        characteristics: (state) => effects.characteristics(state),
        hasAbility: (state, sourceId, handler) =>
          effects.programCostEnabled!(state, sourceId, handler),
      },
    ),
    ...characterDamageReplacements(
      [...definitions].flatMap(([version, { spec }]) =>
        spec.damageReplacements?.length
          ? [
              {
                version,
                replacements:
                  spec.damageReplacements as CharacterDamageReplacementSpecification[],
              },
            ]
          : [],
      ),
      engineVersion,
      rulesVersion,
      {
        characteristics: effects.characteristics,
        hasAbility: (state, sourceId, handler) =>
          effects.damageReplacementEnabled!(state, sourceId, handler),
      },
    ),
    triggers: new Map([...hitBindings.triggers, ...delayedBehaviors]),
    triggerLabels: new Map([
      ...hitBindings.triggerLabels,
      ...[...delayedBehaviors.keys()].map(
        (handler) =>
          [
            handler,
            handler === reanimatorSpec.abilities[0].handlerId
              ? "Reanimator: purge the recompiled character at turn end."
              : handler === archangelSpec.abilities[0].handlerId
                ? "Judgment Day: purge the activating character at turn end."
                : "Rampage: destroy the original Lasersaw Berserker at turn end.",
          ] as const,
      ),
    ]),
    ...bindCharacterKeywords(
      [...definitions.values()]
        .filter(({ spec }) => spec.keywords?.length)
        .map(({ pin }) => pin),
      engine,
      rulesVersion,
      (state, sourceId, keyword) =>
        effects.keywordEnabled!(state, sourceId, keyword),
    ),
    continuations: continuations as ReadonlyMap<
      string,
      ResolutionContinuationBehavior
    >,
    activated: activated as ReadonlyMap<string, ActivatedBehavior>,
    shredChoice: (state: GameState) =>
      state.priorityWindow?.resolving?.activatedAbility?.abilityId ===
      "swipe-platinum"
        ? swipeBinding().decision(state)
        : shredBinding().decision(state),
    topCards(state: GameState): TopCardsEvaluation {
      assertVersion(state);
      const saved = state.pendingDecision,
        action = state.priorityWindow?.resolving;
      if (
        saved?.type !== "top-cards" ||
        !action?.activatedAbility ||
        !effects.topCards
      )
        throw new Error("Top-card continuation unavailable");
      validateTopCardsContinuation(state, saved);
      const entry = topSpecs.get(saved.handler),
        binding = activated.get(saved.handler);
      if (!entry || !binding) throw new Error("Unbound top-card continuation");
      const captured: ActivatedAction = {
        ...structuredClone(action),
        activatedAbility: structuredClone(action.activatedAbility),
      };
      binding.hasLegalTargets(state, captured);
      const current = effects.characteristics(structuredClone(state));
      if (
        saved.kind !== entry.spec.kind ||
        saved.count !== entry.spec.count ||
        !isDeepStrictEqual(
          saved.candidates,
          topCardCandidates(state, saved.player, entry.spec, current),
        )
      )
        throw new Error("Top-card criteria mismatch");
      return {
        characteristics: current,
        complete: (snapshot, decision, selected) => {
          if (!isDeepStrictEqual(decision, saved))
            throw new Error("Top-card continuation mismatch");
          return completeTopCards(snapshot, decision, selected, {
            ...effects.topCards!,
            characteristics: effects.characteristics,
          });
        },
      };
    },
    deckSearch(state: GameState): DeckSearchEvaluation {
      assertVersion(state);
      const saved = state.pendingDecision;
      const action = state.priorityWindow?.resolving;
      if (
        saved?.type !== "deck-search" ||
        !action?.activatedAbility ||
        action.activatedAbility.handler !== saved.handler ||
        !effects.search
      )
        throw new Error("Unbound search continuation");
      const searchSpec = searchSpecs.get(saved.handler);
      if (!searchSpec) throw new Error("Unbound search continuation");
      validateDeckSearchContinuation(state, saved);
      const current = effects.characteristics(structuredClone(state));
      if (
        !saved.allowFail ||
        !isDeepStrictEqual(
          saved.candidates,
          characterSearchCandidates(state, saved.player, current, searchSpec),
        )
      )
        throw new Error("Character search criteria mismatch");
      const captured: ActivatedAction = {
        ...structuredClone(action),
        activatedAbility: structuredClone(action.activatedAbility),
      };
      const binding = activated.get(saved.handler);
      if (!binding || !binding.hasLegalTargets(state, captured))
        throw new Error("Invalid captured search binding");
      return {
        characteristics: current,
        complete: (snapshot, decision, selected) => {
          if (!isDeepStrictEqual(decision, saved))
            throw new Error("Search continuation mismatch");
          return finishCharacterSearch(
            snapshot,
            captured,
            selected,
            {
              ...effects.search!,
              characteristics: effects.characteristics,
            },
            searchSpec,
          );
        },
      };
    },
    activation(
      state: GameState,
      id: string,
      abilityId: string,
      choices: AbilityChoices,
    ): ActivationEvaluation {
      const { pin, spec } = source(state, id);
      const copied = state.objects[id]?.copiedAbility;
      if (
        copied &&
        (copied.kind !== "character" || copied.abilityId !== abilityId)
      )
        throw Error("Copied character ability is not available");
      const binding = spec.abilities.find(
        (ability) => ability.abilityId === abilityId,
      );
      if (!binding || pin.definition.characteristics.cardType !== "character")
        throw new Error("Unbound character activation");
      const allDefinitions = effects.definitions(structuredClone(state));
      if (
        !isDeepStrictEqual(
          allDefinitions.get(pin.version),
          pin.definition.characteristics,
        )
      )
        throw new Error("Character activation definition mismatch");
      const evaluated = effects.evaluate(
        structuredClone(state),
        id,
        abilityId,
        structuredClone(choices),
        structuredClone(
          pin.definition.characteristics.activatedAbilities[binding.index],
        ),
      );
      return {
        ...evaluated,
        ...(abilityId === "swarm-strike"
          ? { additionalCost: xandra(effects.xandra!).cost(id) }
          : {}),
        ...(abilityId === "sacrificial-offering"
          ? {
              additionalCost: priestOfMahkav(
                effects.characterDestructionCost!,
              ).cost(id),
            }
          : {}),
        ...(abilityId === "blood-money"
          ? {
              additionalCost: bloodBinding(effectiveSource(state, id)).cost(id),
            }
          : {}),
        definitions: allDefinitions,
        sourceCharacteristics: effectiveSource(state, id),
        abilityId,
        handler: binding.handlerId,
        validateChoices: (snapshot, selection) =>
          validate(snapshot, id, abilityId, selection),
      };
    },
    activationOptions(
      state: GameState,
      id: string,
      retained?: ActivatedAction,
    ): ActivationAbilityOption[] {
      assertVersion(state);
      const bound = definitions.get(
        retained?.activatedAbility.source.copiedAbility?.definitionVersion ??
          retained?.activatedAbility.source.definitionVersion ??
          state.objects[id]?.copiedAbility?.definitionVersion ??
          state.objects[id]?.definitionVersion,
      );
      if (!bound) return [];
      const { pin, spec } = bound;
      const actor = retained?.controller ?? state.objects[id].controller;
      const optionSource = () =>
        retained
          ? activatedSourceInformation(
              state,
              retained,
              effects.characteristics(state),
            )
          : effectiveSource(state, id);
      if (pin.definition.characteristics.cardType !== "character")
        throw new Error("Invalid bound character");
      const card = pin.definition.characteristics;
      const copied = retained
        ? retained.activatedAbility.source.copiedAbility
        : state.objects[id]?.copiedAbility;
      return spec.abilities
        .filter(
          (ability) =>
            !copied ||
            (copied.kind === "character" &&
              copied.abilityId === ability.abilityId),
        )
        .map((ability) => ({
          abilityId: ability.abilityId,
          label: card.activatedAbilities[ability.index].name,
          variants: [
            ...(ability.abilityId === "rewrite"
              ? serialKiller.variants(state)
              : ability.abilityId === "living-backwards" ||
                  ability.abilityId === "checkmate"
                ? aliceAbility(
                    ability.abilityId,
                    optionSource(),
                    effects,
                  ).variants(state, id)
                : ability.abilityId === "off-with-their-heads"
                  ? [queenBinding(optionSource()).variant(state, id)]
                  : ability.abilityId === "invasive-thoughts"
                    ? mindDelverVariants(
                        state,
                        actor,
                        id,
                        targeting(optionSource()),
                      )
                    : ability.abilityId === "recompile"
                      ? reanimatorVariants(
                          state,
                          actor,
                          id,
                          targeting(optionSource()),
                        )
                      : ability.abilityId === "swipe-platinum"
                        ? swipeBinding().variants(state, id)
                        : ability.abilityId === "shred"
                          ? shredBinding().variants(state, id)
                          : ability.abilityId === "blood-money"
                            ? [bloodBinding(optionSource()).variant(state, id)]
                            : ability.abilityId === "yes"
                              ? [yesBinding(optionSource()).variant(state, id)]
                              : ability.abilityId === "kernel-panic"
                                ? [
                                    kernelBinding(optionSource()).variant(
                                      state,
                                      id,
                                      actor,
                                    ),
                                  ]
                                : isSelfDestructAbility(ability.abilityId)
                                  ? sacrificeBinding(
                                      ability.abilityId,
                                      optionSource(),
                                    ).variants(state, id)
                                  : ability.abilityId === "search-and-destroy"
                                    ? selfDestructionBinding(
                                        optionSource(),
                                      ).variants(state, id)
                                    : ability.abilityId === "venom-blade"
                                      ? [
                                          venomBinding(optionSource()).variant(
                                            state,
                                            id,
                                          ),
                                        ]
                                      : "counter" in ability
                                        ? [
                                            counterBinding(
                                              ability.counter as CharacterCounterSpecification,
                                              optionSource(),
                                            ).variant(state, id),
                                          ]
                                        : "temporaryCombat" in ability
                                          ? [
                                              temporaryCombatAbility(
                                                ability.temporaryCombat as TemporaryCombatSpecification,
                                                targeting(optionSource()),
                                              ).variant(state, id),
                                            ]
                                          : isThrasherAbility(ability.abilityId)
                                            ? thrasherBinding(
                                                ability.abilityId,
                                                optionSource(),
                                              ).variants(state, id)
                                            : ability.abilityId ===
                                                "sacrificial-offering"
                                              ? priestOfMahkav(
                                                  effects.characterDestructionCost!,
                                                ).variants(state, id)
                                              : ability.abilityId ===
                                                  "swarm-strike"
                                                ? xandra(
                                                    effects.xandra!,
                                                  ).variants(state, id)
                                                : ability.abilityId ===
                                                    "floor-score"
                                                  ? [
                                                      {
                                                        key: "normal",
                                                        label:
                                                          "Next drug costs 0 RAM this turn",
                                                        modes: [],
                                                        x: null,
                                                        targets: [],
                                                      },
                                                    ]
                                                  : isMoonPath(
                                                        ability.abilityId,
                                                      )
                                                    ? moonBinding(
                                                        ability.abilityId,
                                                        optionSource(),
                                                      ).variants(state, id)
                                                    : isChannelAbility(
                                                          ability.abilityId,
                                                        )
                                                      ? channelBinding(
                                                          ability.abilityId,
                                                          optionSource(),
                                                        ).variants(state, id)
                                                      : "damage" in ability
                                                        ? [
                                                            damageBinding(
                                                              ability.damage as ActivatedDamageSpecification,
                                                              optionSource(),
                                                            ).variant(
                                                              state,
                                                              id,
                                                            ),
                                                          ]
                                                        : [
                                                            {
                                                              key: "normal",
                                                              label: "Normal",
                                                              modes: [],
                                                              x: null,
                                                              targets:
                                                                ability.abilityId ===
                                                                  "detain" ||
                                                                duels.has(
                                                                  ability.abilityId,
                                                                )
                                                                  ? [
                                                                      {
                                                                        label:
                                                                          "Target character",
                                                                        minimum: 1,
                                                                        maximum: 1,
                                                                        candidates:
                                                                          characterStatusTargets(
                                                                            state,
                                                                            id,
                                                                            targeting(
                                                                              optionSource(),
                                                                            ),
                                                                          ),
                                                                      },
                                                                    ]
                                                                  : ability.abilityId ===
                                                                      "severance"
                                                                    ? [
                                                                        {
                                                                          label:
                                                                            "Target tether",
                                                                          minimum: 1,
                                                                          maximum: 1,
                                                                          candidates:
                                                                            severanceTargets(
                                                                              state,
                                                                              id,
                                                                              severanceEffects(
                                                                                optionSource(),
                                                                              ),
                                                                            ),
                                                                        },
                                                                      ]
                                                                    : ability.abilityId ===
                                                                        "blood-in-the-water"
                                                                      ? [
                                                                          {
                                                                            label:
                                                                              "Target character damaged this turn",
                                                                            minimum: 1,
                                                                            maximum: 1,
                                                                            candidates:
                                                                              damagedCharacterTargets(
                                                                                state,
                                                                                id,
                                                                                targeting(
                                                                                  optionSource(),
                                                                                ),
                                                                              ),
                                                                          },
                                                                        ]
                                                                      : ability.abilityId ===
                                                                          "salvage"
                                                                        ? [
                                                                            {
                                                                              label:
                                                                                "Target gear in your recycle bin",
                                                                              minimum: 1,
                                                                              maximum: 1,
                                                                              candidates:
                                                                                salvageTargets(
                                                                                  state,
                                                                                  actor,
                                                                                  id,
                                                                                  targeting(
                                                                                    optionSource(),
                                                                                  ),
                                                                                ),
                                                                            },
                                                                          ]
                                                                        : ability.abilityId ===
                                                                            "recovery"
                                                                          ? [
                                                                              {
                                                                                label:
                                                                                  "Target HACKER script in your recycle bin",
                                                                                minimum: 1,
                                                                                maximum: 1,
                                                                                candidates:
                                                                                  recoveryTargets(
                                                                                    state,
                                                                                    actor,
                                                                                    id,
                                                                                    targeting(
                                                                                      optionSource(),
                                                                                    ),
                                                                                  ),
                                                                              },
                                                                            ]
                                                                          : [],
                                                            },
                                                          ]),
          ],
        }));
    },
  };
}
