import { quoteDucky } from "./rubber-ducky";
import { replaceFrenziedFan, frenziedFanId } from "./frenzied-fan";
import { eclipseBindings } from "./eclipse-dropship";
import eclipseSpec from "./eclipse-dropship-specification-v5.json";
import { multiverseId } from "./multiverse";
import {
  applySingularityCosts,
  singularityControls,
  singularityEntry,
} from "./singularity";
import singularitySpec from "./singularity-specification-v5.json";
import { expireFreeCardPlays } from "./free-card-plays";
import { applyJusticePrevention } from "./justice";
import { bindSidewinder } from "./sidewinder";
import sidewinderSpec from "./sidewinder-specification-v5.json";
import serialKillerSpec from "./serial-killer-specification-v5.json";
import thirdEyeRecipe from "./third-eye-card-v5.json";
import { startWonderland, type WonderlandEffects } from "./wonderland";
import {
  canPlayWonderland,
  wonderlandOptions,
  playWonderland,
  quoteWonderland,
} from "./wonderland-play";
import neuralDisruptor from "./neural-disruptor-card-v5.json";
import {
  applyFirewallPrevention,
  firewallId,
  amethystId,
  amethystProtection,
} from "./firewall";
import { oracleTop } from "./oracle";
import { enterTeaParty, madHatterDeparture } from "./mad-hatter";
import oracleSpec from "./oracle-specification-v5.json";
import madHatterSpec from "./mad-hatter-specification-v5.json";
import aliceSpec from "./alice-specification-v5.json";
import { replaceBailoutHealthLoss } from "./bailout";
import { floorScorePayments, trixieDraw } from "./trixie";
import aethernetRecipe from "./aethernet-card-v3.json";
import { aethernetEligibility } from "./aethernet-eligibility";
import { replayPermission } from "./program-replay";
import xandraSpec from "./xandra-specification-v3.json";
import { xandra, type XandraEffects } from "./xandra";
import priestSpec from "./priest-specification-v3.json";
import trixieSpec from "./trixie-specification-v3.json";
import { moonSistersAllowReversal } from "./moon-sisters";
import moonSpecifications from "./moon-sister-specifications-v3.json";
import mindDelverSpec from "./mind-delver-specification-v3.json";
import { bindWndrtech, wndrtechId, wndrtechTokens } from "./wndrtech";
import reanimatorSpec from "./reanimator-specification-v3.json";
import { returnCharacterWithSpirit } from "./recycle-character-entry";
import terrySpec from "./terry-specification-v3.json";
import archangelSpec from "./project-archangel-specification-v3.json";
import {
  bindArchangelArmor,
  archangelCanCombat,
} from "./project-archangel-armor";
import { statEffectActive } from "./stat-effect-duration";
import {
  bindHiveDynamics,
  hiveDynamicsId,
  hiveDynamicsStats,
} from "./hive-dynamics";
import { bindDeepnet, deepnetId } from "./deepnet";
import { bindMeltdown, meltdownId } from "./meltdown";
import { tokenCopyCharacteristics } from "./token-copies";
import { bindOmnis, omnisId } from "./omnis-blood-diamond";
import { bindHeadbanger, headbangerId } from "./headbanger";
import { bindBerserker, berserkerId } from "./berserker";
import { bindSpotlight, spotlightId } from "./spotlight";
import { bindEclipse, eclipseId, eclipseStats } from "./eclipse";
import { bindNexus, nexusId } from "./nexus";
import { bindSpinalSplitter } from "./spinal-splitter";
import { scriptKiddie } from "./script-kiddie";
import { applyCopiedAbilities } from "./copied-abilities";
import { bindCorpoGear } from "./corpo-gear-bindings";
import { isEndgameRevealed } from "./endgame-reveal";
import { revealHand, discardHandCard } from "./hand-effects";
import { bindTrojans, faceDownTrojanCharacteristics } from "./trojans";
import { bindCortexCrab } from "./cortex-crab";
import type { RedirectEvaluation } from "./redirect-ability";
import retainedTrojanSpecs from "./trojan-cards-v1.json";
import duckyCard from "./rubber-ducky-card-v5.json";
const trojanSpecs = [...retainedTrojanSpecs, duckyCard];
import corpoGearSpecs from "./corpo-gear-specifications-v1.json";
import dustGearSpecs from "./dustrunner-gear-specifications-v1.json";
import trustSpec from "./trustfund-baby-specification-v1.json";
import debtSpec from "./debt-collector-specification-v1.json";
import { bindTrustfundBaby } from "./trustfund-baby";
import { bindDebtCollector } from "./debt-collector";
import { baseCardD20 } from "./generational-wealth";
import { counterCacheAction } from "./counter";
import { targetsPendingCardAction } from "./yes-man";
import { shuffleCyberdeck } from "./past-life";
import {
  createEngineRuntime,
  type EngineRuntimeBindings,
} from "./engine-runtime";
import type { dustrunnerDefinitionsV1 } from "./dustrunner-definitions-v1";
import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";
import type { CombatDamagePacket } from "./combat-damage";
import { applyDamageBatch } from "./damage-batch";
import { bindPrograms } from "./program-bindings";
import { bindCharacterActivations } from "./character-activation-bindings";
import { bindCharacterPassives } from "./character-passive-bindings";
import { bindMainframeResources } from "./mainframe-resource-bindings";
import mainframeResourceSpecs from "./mainframe-resource-specifications-v1.json";
import mainframePassiveSpecs from "./mainframe-passive-specifications-v1.json";
import { bindMainframePassives } from "./mainframe-passive-bindings";
import { bindDustrunnerGear } from "./dustrunner-gear-bindings";
import { bindDustDevilVultures } from "./dust-devil-vultures";
import { bindKeywordCounterTriggers } from "./keyword-counter-bindings";
import { createDepartureRuntime } from "./departure-runtime";
import { beginTetherFollow } from "./tether-follow";
import { putInPlayCounters } from "./put-counters";
import {
  applyCharacterStatLayers,
  evaluateCharacterStats,
  type StatEffect,
} from "./stat-layers";
import { drawCards, installOne } from "./resource-effects";
import { evaluatePlayerSynergy } from "./synergy";
import { changePersistentStatus } from "./persistent-status";
import { baseInstabilityRoll, resolveInstability } from "./instability";
import {
  basePsychosisRoll,
  resolvePsychosisSelfHits,
  runCharactersWithPsychosis,
} from "./psychosis";
import { applyHealthChanges } from "./health";
import { combatKeywordRules, type CombatKeyword } from "./combat-keywords";
import { resolveCharacterEntry } from "./play-character";
import { resolveGearEntry } from "./play-gear";
import { resolveEnvironmentEntry } from "./environment";
import { moveSearchedCardToHand } from "./past-life";
import { binCyberdeckCards } from "./top-cards";
import { expireTimedStatEffects } from "./timed-stat-effects";
import { expireTimedCombatEffects } from "./timed-combat-effects";
import { expireTimedTriggerEffects } from "./timed-trigger-effects";
import {
  applyTimedDamagePrevention,
  expireTimedDamagePrevention,
} from "./timed-damage-prevention";
import { type EventBehavior } from "./rule-events";
import retainedActivationSpecs from "./character-activation-specifications-v1.json";
import easyActivationSpecs from "./easy-character-activation-specifications-v3.json";
import counterActivationSpecs from "./counter-character-specifications-v3.json";
import resourceActivationSpecs from "./resource-character-specifications-v3.json";
import thrasherActivationSpecs from "./thrasher-character-specifications-v3.json";
import choiceActivationSpecs from "./choice-character-specifications-v3.json";
import astraSpec from "./astra-specification-v3.json";
import { bindAstra } from "./astra";
import { bindVenture, ventureId } from "./venture-capitalist";
import { bindSpiritGuide, spiritGuideId } from "./spirit-guide";
import { runtimeTokenDefinition } from "./runtime-token-definition";
import { createCharacterToken } from "./token-lifecycle";
import { captureEventObservation } from "./event-observation";
import { bindAstralProjector, astralProjectorId } from "./astral-projector";
import { bindEdward, edwardStats } from "./edward";
import { bindShredder, shredderId } from "./shredder";
import { bindGroupie, groupieId } from "./groupie";
import {
  zenGardenId,
  replaceZenGardenDeparture,
  applyZenGardenPrevention,
} from "./zen-garden";
import {
  canDestroyPersistent,
  expireDestructionProtection,
} from "./destruction-protection";
import {
  bindRadiant,
  radiantId,
  radiantHandler,
  radiantAllowsReversal,
} from "./radiant";
import { bindAurora, auroraId, auroraHandler } from "./aurora";
import { bindRoxyRiot, roxyRiotId } from "./roxy-riot";
import { bindSinisterManager, sinisterManagerId } from "./sinister-manager";
import { bindSavage, savageId, savageGrants } from "./savage";
import { bindVampCards } from "./vamp-bindings";
import { applyArtificialInflation } from "./artificial-inflation";
import inflationSpec from "./artificial-inflation-specification-v3.json";
import { hasPsychosisImmunity } from "./psychosis-immunity";
import { bindOpticalGear } from "./optical-gear";
import opticalGearRecipes from "./optical-gear-cards-v3.json";
import { bindHostileGear } from "./hostile-gear";
import hostileGearRecipes from "./hostile-gear-cards-v3.json";
import { bindPlasmaShackle, plasmaShackleId } from "./plasma-shackle";
import vampRecipes from "./vamp-cards-v3.json";
import { bindEdCardCounter } from "./ed-card-counter";
import edCardCounterSpec from "./ed-card-counter-specification-v3.json";
import edwardSpec from "./edward-specification-v3.json";
const activationSpecs = [
  oracleSpec,
  serialKillerSpec,
  eclipseSpec,
  singularitySpec,
  madHatterSpec,
  aliceSpec,
  mindDelverSpec,
  reanimatorSpec,
  terrySpec,
  archangelSpec,
  ...retainedActivationSpecs,
  ...easyActivationSpecs,
  ...moonSpecifications,
  trixieSpec,
  priestSpec,
  xandraSpec,
  ...choiceActivationSpecs,
  ...thrasherActivationSpecs,
  ...resourceActivationSpecs,
  ...counterActivationSpecs,
];
import retainedPassiveSpecs from "./character-passive-specifications-v1.json";
import factionPassiveSpecs from "./faction-passive-specifications-v3.json";
import baseGearSpecs from "./base-gear-specifications-v3.json";
import combatGearSpecs from "./combat-gear-specifications-v3.json";
import { bindCombatGear } from "./combat-gear-bindings";
const passiveSpecs = [...retainedPassiveSpecs, ...factionPassiveSpecs];
import mirageSpec from "./dust-devil-vultures-specification-v1.json";
import { recordDrawBonus } from "./game-log";
import { neuroscapeFactionsV1 } from "./factions-v1";
import { bindCyberneticGear } from "./cybernetic-gear-bindings";
import cyberneticGearSpecs from "./cybernetic-gear-specifications-v1.json";
import retainedGrantedGearSpecs from "./gear-granted-specifications-v1.json";
import simpleGearSpecs from "./simple-gear-specifications-v3.json";
import { bindGearGrantedAbilities } from "./gear-granted-abilities";
import { bindFluxCannon } from "./flux-cannon";
import { psychosisValues } from "./psychosis-values";
import { supersymmetryStats } from "./supersymmetry";
import passiveEnvironmentSpecs from "./passive-environment-specifications-v3.json";
import gearheadSpec from "./gearhead-specification-v3.json";
import { bindGearhead } from "./gearhead";
import { activeCombatEffects } from "./timed-combat-effects";
import { removeAllMainframeCounters } from "./remove-mainframe-counters";
import { moveRecycledCardToHand } from "./salvage";
import { bindCharacterKeywords } from "./character-keyword-bindings";
import characterKeywordSpecs from "./character-keyword-specifications-v1.json";
import firestarterSpec from "./firestarter-specification-v1.json";
import { applyInvertCounters } from "./invert-counters";
import { resolveCounterDepartures } from "./counter-replacement-continuation";
import { bindFirestarter } from "./firestarter";
import {
  applySpiritCounterCosts,
  replaceSpiritDepartures,
} from "./spirit-counters";

const grantedGearSpecs = [
  ...retainedGrantedGearSpecs,
  ...simpleGearSpecs.filter(
    (s) =>
      s.kind === "chronos-maestro" ||
      s.kind === "whammy-bar" ||
      s.kind === "demon-shard",
  ),
];

/** Shared release composition. Admission and retained definition versions are supplied by the release. */
export function createStarterRuntime(
  admission: ReturnType<typeof dustrunnerDefinitionsV1>,
  artworkBaseUrl?: string,
  /** New releases may opt in; do not change the feature set of a deployed pin. */
  features: {
    spiritCounters?: boolean;
    invertCounters?: boolean;
    armorCounters?: boolean;
    abilityCopy?: boolean;
    tokenCopies?: boolean;
  } = {},
) {
  const { engine, rulesVersion } = admission;
  if (
    (features.spiritCounters ||
      features.invertCounters ||
      features.armorCounters ||
      features.abilityCopy ||
      features.tokenCopies) &&
    (engine.version === "starter-dustrunner-v1" ||
      engine.version === "starters-v2")
  )
    throw new Error("New counter rules require a new release pin");
  if (features.armorCounters && !features.spiritCounters)
    throw new Error("ARMOR requires the combined SPIRIT replacement evaluator");
  const pins = [...admission.definitions.values()];
  const definitions = new Map(
    pins.map((p) => [p.version, p.definition.characteristics]),
  );
  const dreamwalker =
    admission.definitions.has(spiritGuideId) ||
    admission.definitions.has(eclipseId)
      ? runtimeTokenDefinition("dreamwalker", engine.version, rulesVersion)
      : undefined;
  if (dreamwalker)
    definitions.set(dreamwalker.version, dreamwalker.characteristics);
  const revenant = admission.definitions.has(
    "399735bb-a03f-4925-82e3-f2536773ff65",
  )
    ? runtimeTokenDefinition("revenant", engine.version, rulesVersion)
    : undefined;
  if (revenant) definitions.set(revenant.version, revenant.characteristics);
  const drone =
    admission.definitions.has(hiveDynamicsId) ||
    admission.definitions.has("aa900643-5acb-4282-87b2-bdfe93753f9d")
      ? runtimeTokenDefinition("drone", engine.version, rulesVersion)
      : null;
  if (drone) definitions.set(drone.version, drone.characteristics);
  const butterfly = admission.definitions.has(
    "afd75ae3-39ab-4b79-ae27-d30d84c7301d",
  )
    ? runtimeTokenDefinition("butterfly", engine.version, rulesVersion)
    : null;
  if (butterfly) definitions.set(butterfly.version, butterfly.characteristics);
  const chessTokens = new Map<
    string,
    ReturnType<typeof runtimeTokenDefinition>
  >();
  if (admission.definitions.has(wndrtechId))
    for (const token of wndrtechTokens)
      for (const attack of ["MF", "BF"] as const) {
        const definition = runtimeTokenDefinition(
          token,
          engine.version,
          rulesVersion,
          attack,
        );
        chessTokens.set(token + ":" + attack, definition);
        definitions.set(definition.version, definition.characteristics);
      }
  const printed = (state: GameState): Map<string, CardCharacteristics> =>
    new Map(
      Object.values(state.objects).map((object) => {
        const card = definitions.get(object.definitionVersion);
        if (!card)
          throw new Error(
            `Unknown retained starter definition: ${object.definitionVersion}`,
          );
        return [
          object.id,
          object.faceDown &&
          card.cardType === "program" &&
          card.tags.includes("TROJAN")
            ? faceDownTrojanCharacteristics(structuredClone(card))
            : features.tokenCopies
              ? tokenCopyCharacteristics(object, card)
              : structuredClone(card),
        ];
      }),
    );
  const hasAbility = (state: GameState, id: string) => {
    const object = state.objects[id];
    return (
      !!object &&
      !object.faceDown &&
      (state.arena.includes(id) ||
        state.environment.includes(id) ||
        state.players.some((p) => p.zones.mainframe.includes(id)))
    );
  };
  const hostileGear = bindHostileGear(
    pins.filter((p) =>
      [neuralDisruptor, ...hostileGearRecipes].some(
        (r) => r.cardId === p.definition.cardId,
      ),
    ),
    engine,
    rulesVersion,
    hasAbility,
  );
  const characteristics = (
    state: GameState,
  ): Map<string, CardCharacteristics> => {
    const base = features.spiritCounters
        ? applySpiritCounterCosts(state, printed(state))
        : printed(state),
      additions = new Map<string, StatEffect[]>();
    for (const provider of [
      passives.statEffects(state, base),
      hostileGear.statEffects(state, base),
      hiveDynamicsStats(
        state,
        admission.definitions.get(hiveDynamicsId)?.version,
        base,
        hasAbility,
      ),
      eclipseStats(
        state,
        admission.definitions.get(eclipseId)?.version,
        base,
        hasAbility,
      ),
      edwardStats(
        state,
        admission.definitions.get(edwardSpec.cardId)?.version,
        base,
        hasAbility,
      ),
      gear.statEffects(state, base),
      corpoGear.statEffects(state),
      cyberneticGear.statEffects(state),
      mainframePassives.statEffects(state, base),
      supersymmetryStats(
        state,
        admission.definitions.get(
          passiveEnvironmentSpecs.find((spec) => spec.kind === "supersymmetry")!
            .cardId,
        )?.version,
        base,
        hasAbility,
      ),
    ])
      for (const [id, effects] of provider)
        additions.set(id, [...(additions.get(id) ?? []), ...effects]);
    let attributes = cortex.attributes(
      state,
      applyCharacterStatLayers(state, base, additions),
    );
    for (const [id, card] of attributes) {
      const cost = state.objects[id]?.setRamCost;
      if (cost !== undefined && "ramCost" in card)
        attributes.set(id, { ...card, ramCost: cost });
    }
    attributes = applySingularityCosts(
      state,
      admission.definitions.get(singularitySpec.cardId)?.version,
      attributes,
      hasAbility,
    );
    attributes = applyArtificialInflation(
      state,
      admission.definitions.get(inflationSpec.cardId)?.version,
      attributes,
      hasAbility,
    );
    if (features.abilityCopy)
      attributes = applyCopiedAbilities(state, attributes, (copy) =>
        copy.kind === "ctrl-c"
          ? kiddie.describeCopy(copy)
          : copy.kind === "gear"
            ? grantedGear.describeCopy(copy)
            : characters.describeCopy(copy),
      );
    return features.invertCounters
      ? applyInvertCounters(state, attributes)
      : attributes;
  };
  const putCounters = (
    state: GameState,
    sourceId: string,
    placements: Parameters<typeof putInPlayCounters>[2],
  ) => putInPlayCounters(state, sourceId, placements, characteristics(state));
  const prepareEntry = (state: GameState, id: string) =>
    state.objects[id].definitionVersion ===
    admission.definitions.get(ventureId)?.version
      ? putCounters(state, id, [
          { instanceId: id, counter: "interest", amount: 1 },
        ])
      : state;
  const gear = bindDustrunnerGear(
    pins.filter((p) =>
      dustGearSpecs.some((s) => s.cardId === p.definition.cardId),
    ),
    engine,
    rulesVersion,
    {
      characteristics,
      hasAbility,
      putCounters,
      baseStats(state) {
        const result = new Map<string, { attack: number; defence: number }>();
        for (const [id, card] of printed(state))
          if (card.cardType === "character")
            result.set(
              id,
              evaluateCharacterStats(
                card,
                {},
                state.statEffects
                  .filter(
                    (e) => e.targetId === id && statEffectActive(state, e),
                  )
                  .map((e) => e.effect),
              ).base,
            );
        return result;
      },
    },
  );
  const corpoGear = bindCorpoGear(
    pins.filter((p) =>
      corpoGearSpecs.some((s) => s.cardId === p.definition.cardId),
    ),
    engine,
    rulesVersion,
    {
      characteristics: printed,
      hasAbility,
      draw: (state, _source, player, count) => draw(state, player, count),
    },
  );
  const cyberneticGear = bindCyberneticGear(
    pins.filter((p) =>
      [
        ...cyberneticGearSpecs,
        ...baseGearSpecs,
        ...combatGearSpecs,
        ...simpleGearSpecs.filter((s) => s.kind === "railgun"),
        ...grantedGearSpecs.filter(
          (s) => s.kind === "knux" || s.kind === "codebreaker",
        ),
      ].some((s) => s.cardId === p.definition.cardId),
    ),
    engine,
    rulesVersion,
    { characteristics: printed, hasAbility },
  );
  const mainframePassives = bindMainframePassives(
    pins.filter((p) =>
      mainframePassiveSpecs.some((s) => s.cardId === p.definition.cardId),
    ),
    engine,
    rulesVersion,
    { hasAbility },
  );
  const passives = bindCharacterPassives(
    pins.filter((p) =>
      passiveSpecs.some((s) => s.cardId === p.definition.cardId),
    ),
    engine,
    rulesVersion,
    {
      hasAbility,
      hasTether: gear.hasTether,
    },
  );
  const departures = createDepartureRuntime({
    characteristics,
    replace: (state, proposed) => {
      const allowed = proposed.filter(
        (intent) =>
          intent.kind !== "destroy" || canDestroyPersistent(state, intent.id),
      );
      const fan = replaceFrenziedFan(
        state,
        allowed,
        admission.definitions.get(frenziedFanId)?.version,
        hasAbility,
      );
      state = fan.state;
      const intents = replaceZenGardenDeparture(
        state,
        fan.departures,
        admission.definitions.get(zenGardenId)?.version,
        characteristics(state),
        hasAbility,
      );
      return features.armorCounters
        ? resolveCounterDepartures(state, intents, characteristics(state))
        : {
            state,
            departures: features.spiritCounters
              ? replaceSpiritDepartures(state, intents, characteristics(state))
              : intents,
          };
    },
    ramReturnsRefreshed: (state, intent) =>
      programs.ramReturnsRefreshed(state, intent),
  });
  const cortex = bindCortexCrab(pins, {
    characteristics: printed,
    destroy: (state, id) =>
      departures.depart(state, [
        { id, kind: "destroy", sourceId: id, reason: "normal" },
      ]),
  });
  const prepareDamage = (
    state: GameState,
    packets: readonly CombatDamagePacket[],
  ) =>
    applyTimedDamagePrevention(
      state,
      applyZenGardenPrevention(
        state,
        characters
          .replaceAttackDamage(state, packets)
          .map((p) => ({ ...p, prevented: 0 })),
        admission.definitions.get(zenGardenId)?.version,
        characteristics(state),
        hasAbility,
        programs.canPreventDamage(state),
      ),
      programs.canPreventDamage(state),
    );
  const applyProtectionDamage = (
    ...args: Parameters<typeof applyFirewallPrevention>
  ) => {
    const first = applyFirewallPrevention(...args);
    return applyFirewallPrevention(
      first.state,
      first.packets,
      admission.definitions.get(amethystId)?.version,
      programs.canPreventDamage(first.state),
      { characteristics, hasAbility, putCounters },
      amethystProtection,
    );
  };
  const prepareFirewallDamage = (
    state: GameState,
    packets: readonly CombatDamagePacket[],
  ): {
    state: GameState;
    packets: import("./damage-batch").EvaluatedDamage[];
  } => {
    const prepared = prepareDamage(state, packets);
    if (
      !state.damagePreventions.some(
        (d) => d.kind === "justice" && d.expiresAfterTurn >= state.turn.number,
      )
    )
      return applyProtectionDamage(
        state,
        prepared,
        admission.definitions.get(firewallId)?.version,
        programs.canPreventDamage(state),
        { characteristics, hasAbility, putCounters },
      );
    const result = applyJusticePrevention(
      state,
      prepared,
      programs.canPreventDamage(state),
      {
        characteristics,
        hasAbility,
        putCounters,
        version: (id) => admission.definitions.get(id)?.version,
      },
    );
    if (!result.reflected.length)
      return { state: result.state, packets: result.packets };
    const reflected = applyProtectionDamage(
      result.state,
      prepareDamage(result.state, result.reflected),
      admission.definitions.get(firewallId)?.version,
      programs.canPreventDamage(result.state),
      { characteristics, hasAbility, putCounters },
    );
    return {
      state: reflected.state,
      packets: [...result.packets, ...reflected.packets],
    };
  };
  const damage = (
    state: GameState,
    packets: readonly CombatDamagePacket[],
  ): GameState => {
    const prepared = prepareFirewallDamage(state, packets);
    return applyDamageBatch(
      prepared.state,
      prepared.packets,
      characteristics(prepared.state),
    );
  };
  const draw = (state: GameState, player: Seat, count: number): GameState => {
    const sources: { name: string; amount: number }[] = [];
    const additionalCards = characters.additionalDraws(
      state,
      player,
      (name, amount) => sources.push({ name, amount }),
    );
    const next = drawCards(state, player, count, {
      additionalCards,
      prohibited: () => false,
    });
    recordDrawBonus(next, player, count, sources);
    return next;
  };
  const install = (
    state: GameState,
    player: Seat,
    running: boolean,
  ): GameState =>
    installOne(state, player, {
      definitions,
      prohibited: false,
      running: mainframes.ramEntryReplacements(state, player).length
        ? false
        : running,
    });
  const opticalGear = bindOpticalGear(
    pins.filter((p) =>
      [...opticalGearRecipes, thirdEyeRecipe].some(
        (r) => r.cardId === p.definition.cardId,
      ),
    ),
    engine,
    rulesVersion,
    hasAbility,
  );
  const canTarget = (state: GameState, _sourceId: string, targetId: string) =>
    !!state.objects[targetId] &&
    !opticalGear.cloaked(state, targetId, characteristics(state));
  const aethernetReplay = (state: GameState, id: string) => {
    const version = admission.definitions.get(aethernetRecipe.cardId)?.version;
    return version &&
      state.objects[id] &&
      !replayPermission(state, state.objects[id].controller, id)
      ? aethernetEligibility(state, state.objects[id].controller, id, version, {
          characteristics,
          hasAbility,
        })
      : null;
  };
  const topCard = (state: GameState, player: Seat) =>
    oracleTop(
      state,
      player,
      admission.definitions.get(oracleSpec.cardId)?.version,
      { characteristics, hasAbility },
    );
  const play = (state: GameState, id: string) => {
    const object = state.objects[id],
      current = characteristics(state),
      card = current.get(id);
    if (!object || !card || !("ramCost" in card))
      throw new Error("Unavailable playable card");
    const replay = aethernetReplay(state, id);
    const printed = definitions.get(object.definitionVersion);
    return {
      fromCyberdeck: topCard(state, object.controller) === id,
      replayFromBin: !!replay,
      purgeOnResolution: !!replay,
      definitions,
      characteristics: current,
      allowed: !object.faceDown,
      swift:
        (card.cardType === "program" && card.swift) ||
        (card.cardType === "gear" && corpoGear.swift(state, id)),
      freeDrugEffects:
        card.cardType === "program"
          ? floorScorePayments(state, object.controller, card.tags)
          : [],
      ramCost:
        card.cardType === "program" &&
        floorScorePayments(state, object.controller, card.tags).length
          ? 0
          : Math.max(
              0,
              card.ramCost +
                (replay?.tier === 0 && printed && "ramCost" in printed
                  ? printed.ramCost
                  : 0) -
                (card.cardType === "program"
                  ? characters.programCostReduction(
                      state,
                      object.controller,
                      id,
                    )
                  : 0),
            ),
      synergy: evaluatePlayerSynergy(state, current)[object.controller]
        .factions,
    };
  };
  const gearhead = admission.definitions.has(gearheadSpec.cardId)
    ? bindGearhead(
        admission.definitions.get(gearheadSpec.cardId)!,
        engine,
        rulesVersion,
        hasAbility,
      )
    : () => 0;
  const plasmaShackle = admission.definitions.has(plasmaShackleId)
    ? bindPlasmaShackle(
        admission.definitions.get(plasmaShackleId)!,
        engine,
        rulesVersion,
        {
          hasAbility,
          characteristics,
          putCounters: (s, source, placements) =>
            putCounters(s, source, placements),
        },
      )
    : null;
  const psychosis = {
    characteristics,
    value: (state: GameState, id: string) => {
      const cards = characteristics(state);
      return hostileGear.multiplyPsychosis(
        state,
        id,
        psychosisValues(state, cards, {
          contributions: new Map(
            state.arena
              .filter((target) => cards.get(target)?.cardType === "character")
              .map((target) => [
                target,
                [
                  cyberneticGear.additionalPsychosis(state, target),
                  plasmaShackle?.additionalPsychosis(state, target) ?? 0,
                  hostileGear.additionalPsychosis(state, target),
                  -gearhead(state, target, cards),
                ],
              ]),
          ),
          enabledGrants: new Set(
            activeCombatEffects(state)
              .filter(
                (effect) =>
                  effect.targetId !== null &&
                  hasAbility(state, effect.targetId),
              )
              .map((effect) => effect.id),
          ),
          immune: new Set(
            state.arena.filter(
              (target) =>
                (state.objects[target].definitionVersion ===
                  admission.definitions.get(terrySpec.cardId)?.version &&
                  hasAbility(state, target)) ||
                hostileGear.immune(state, target, cards) ||
                hasPsychosisImmunity(state, target),
            ),
          ),
        }).get(id) ?? 0,
      );
    },
    roll: basePsychosisRoll,
    hitControllers: (
      state: GameState,
      failures: Parameters<typeof resolvePsychosisSelfHits>[1],
    ) => resolvePsychosisSelfHits(state, failures, damage),
  };
  const grantedGear = bindGearGrantedAbilities(
    pins.filter((p) =>
      grantedGearSpecs.some((s) => s.cardId === p.definition.cardId),
    ),
    engine,
    rulesVersion,
    {
      putCounters,
      definitions,
      characteristics,
      hasAbility,
      psychosis,
      canTarget,
      canTargetPlayer: () => true,
      damage,
      destroy: departures.destroy,
    },
  );
  const trojans = bindTrojans(pins, {
    redirect: { variants: (state, action) => redirect.variants(state, action) },
    definitions,
    characteristics,
    play,
    canTarget,
    bin: (state, id) => departures.move(state, id, "recycleBin"),
    destroy: (state, sourceId, ids) =>
      departures.depart(
        state,
        ids.map((id) => ({ id, sourceId, kind: "destroy", reason: "normal" })),
      ),
    damage,
  });
  const programs = bindPrograms(
    pins.filter(
      (p) =>
        p.definition.characteristics.cardType === "program" &&
        !trojanSpecs.some((s) => s.cardId === p.definition.cardId),
    ),
    engine,
    rulesVersion,
    {
      play,
      redirect: () => redirect,
      allowReversed: (state, id) =>
        moonSistersAllowReversal(
          state,
          id,
          new Set(
            moonSpecifications.flatMap((spec) => {
              const p = admission.definitions.get(spec.cardId);
              return p ? [p.version] : [];
            }),
          ),
          characteristics(state),
          hasAbility,
        ) ||
        radiantAllowsReversal(
          state,
          id,
          admission.definitions.get(radiantId)?.version,
          characteristics(state),
          hasAbility,
        ),
      characterDestructionCost: {
        characteristics,
        depart: (s, intents) => departures.depart(s, intents),
      },
      foolDraw: draw,
      wonderland: {
        // Reference-only metadata: this does not admit Alice or certify her abilities.
        alice: versionDefinition(
          {
            ...aliceNameReference,
            schemaVersion: 1,
            engineVersion: engine.version,
            rulesVersion,
          },
          engine,
        ),
        effectiveName: (state, id) =>
          characteristics(state).get(id)?.name ?? null,
        putCounters,
      },
      instability: {
        canTargetPlayer: () => true,
        resolve: (state, player) =>
          resolveInstability(state, player, {
            characteristics: characteristics(state),
            roll: baseInstabilityRoll,
            destroySimultaneously: (s, ids) =>
              departures.depart(
                s,
                ids.map((id) => ({
                  id,
                  kind: "destroy",
                  sourceId: null,
                  reason: "normal",
                })),
              ),
          }),
      },
      ...(revenant
        ? {
            death: {
              pay: (state: GameState, sourceId: string, targetId: string) => ({
                state: departures.destroy(state, sourceId, targetId),
                paid: true,
              }),
              create: (state: GameState, player: Seat, sourceId: string) => {
                const next = createCharacterToken(
                  state,
                  player,
                  sourceId,
                  revenant.version,
                  definitions,
                );
                next.pendingRuleEvents[next.pendingRuleEvents.length - 1] = {
                  ...next.pendingRuleEvents.at(-1)!,
                  ...captureEventObservation(next),
                };
                return next;
              },
            },
          }
        : {}),
      movePermanent: departures.move,
      bounceBatch: (state, ids) =>
        departures.depart(
          state,
          ids.map((id) => ({ id, kind: "move", destination: "hand" })),
        ),
      putCounters,
      searchScripts: {
        moveToHand: moveSearchedCardToHand,
        bin: binCyberdeckCards,
        canSearch: () => true,
        shuffleDeck: shuffleCyberdeck,
      },
      destroyBatch: (state, sourceId, ids, controller) =>
        departures.depart(
          state,
          ids.map((id) => ({
            id,
            sourceId,
            ...(controller !== undefined ? { destroyedBy: controller } : {}),
            kind: "destroy",
            reason: "normal",
          })),
        ),
      characteristics,
      canTarget,
      damage: { canTargetPlayer: () => true, damage },
      phishing: {
        canTargetPlayer: () => true,
        reveal: (state, sourceId, player) =>
          revealHand(state, sourceId, player, characteristics(state)),
        discard: discardHandCard,
      },
      status: {
        allowed: () => true,
        putCounter: (state, sourceId, targetId) =>
          putCounters(state, sourceId, [
            { instanceId: targetId, counter: "+1/+1", amount: 1 },
          ]),
      },
      counter: (state, actionId, sourceId) =>
        counterCacheAction(state, actionId, sourceId, true),
      destroy: departures.destroy,
      removeMainframeCounters: (state, sourceId, player) =>
        removeAllMainframeCounters(
          state,
          sourceId,
          player,
          characteristics(state),
        ),
      genocide: {
        factions: () => neuroscapeFactionsV1,
        destroyCharacters: (state, sourceId, ids) =>
          departures.depart(
            state,
            ids.map((id) => ({
              id,
              kind: "destroy" as const,
              sourceId,
              reason: "normal" as const,
            })),
          ),
        loseHealth: (state, sourceId, player, amount) =>
          applyHealthChanges(
            state,
            sourceId,
            (["MF", "BF"] as const).map((channel) => ({
              player,
              channel,
              amount,
              operation: "lose" as const,
              cause: "effect" as const,
            })),
          ),
      },
      runCharacters: (state, sourceId, ids) =>
        runCharactersWithPsychosis(state, sourceId, ids, {
          ...psychosis,
          allowed: () => true,
        }),
      combTheDesert: { canRun: () => true, psychosis },
      protocols: {
        putCounters,
        purge: (s, id) =>
          departures.depart(s, [{ id, kind: "move", destination: "purge" }]),
        ...(butterfly
          ? {
              createButterfly: (
                state: GameState,
                player: Seat,
                sourceId: string,
              ) => {
                const next = createCharacterToken(
                  state,
                  player,
                  sourceId,
                  butterfly.version,
                  definitions,
                );
                next.pendingRuleEvents[next.pendingRuleEvents.length - 1] = {
                  ...next.pendingRuleEvents.at(-1)!,
                  ...captureEventObservation(next),
                };
                return next;
              },
            }
          : {}),
        draw,
        hasAbility,
        damage,
        install: (state, _sourceId, player, running) =>
          install(state, player, running),
        roll: baseCardD20,
      },
      environments: {
        wonderland: (state, trigger) =>
          startWonderland(state, trigger, wonderlandEffects),
        prepareEntry,
        purgeBatch: (s, _source, ids) =>
          departures.depart(
            s,
            ids.map((id) => ({
              id,
              kind: "move" as const,
              destination: "purge" as const,
            })),
          ),
        canTarget,
        purge: (s, _source, id) =>
          departures.depart(s, [{ id, kind: "move", destination: "purge" }]),
        putCounters,
        ...(drone
          ? {
              createDrone: (
                state: GameState,
                player: Seat,
                sourceId: string,
              ) => {
                const next = createCharacterToken(
                  state,
                  player,
                  sourceId,
                  drone.version,
                  definitions,
                );
                next.pendingRuleEvents[next.pendingRuleEvents.length - 1] = {
                  ...next.pendingRuleEvents.at(-1)!,
                  ...captureEventObservation(next),
                };
                return next;
              },
            }
          : {}),
        destroy: (s, sourceId, id, controller) =>
          departures.depart(s, [
            {
              id,
              sourceId,
              kind: "destroy",
              reason: "normal",
              ...(controller === undefined ? {} : { destroyedBy: controller }),
            },
          ]),
        hasAbility,
        damage,
        topCards: {
          moveToHand: moveSearchedCardToHand,
          bin: binCyberdeckCards,
        },
        install: (state, _sourceId, player, running) =>
          install(state, player, running),
        draw: (state, _sourceId, player, count) => draw(state, player, count),
        gainHealth: (state, sourceId, player, amount) =>
          applyHealthChanges(
            state,
            sourceId,
            (["MF", "BF"] as const).map((channel) => ({
              player,
              channel,
              amount,
              operation: "gain",
              cause: "effect",
            })),
          ),
      },
    },
  );
  const eclipseEffects = {
    characteristics,
    prepareEntry,
    hasAbility,
    returnToHand: (s: GameState, id: string) => departures.move(s, id, "hand"),
  };
  const characters = bindCharacterActivations(
    pins.filter((p) =>
      activationSpecs.some((s) => s.cardId === p.definition.cardId),
    ),
    engine,
    rulesVersion,
    {
      eclipse: eclipseEffects,
      definitions: () => definitions,
      characteristics,
      evaluate: (state, id, _abilityId, _choices, ability) => ({
        allowed: hasAbility(state, id),
        ramCost: ability.ramCost,
        run: ability.run,
        revealSource: false,
        ...(ability.additionalCostText
          ? { additionalCostText: ability.additionalCostText }
          : {}),
        psychosis,
      }),
      canTarget,
      status: {
        allowed: () => true,
        runCharacters: (state, sourceId, ids) =>
          runCharactersWithPsychosis(state, sourceId, ids, {
            ...psychosis,
            allowed: () => true,
          }),
      },
      destruction: { destroy: departures.destroy },
      destroyBatch: (state, sourceId, ids) =>
        departures.depart(
          state,
          ids.map((id) => ({
            id,
            sourceId,
            kind: "destroy",
            reason: "normal",
          })),
        ),
      bloodMoney: {
        destroyRam: (state, sourceId, ids) =>
          departures.depart(
            state,
            ids.map((id) => ({
              id,
              sourceId,
              kind: "destroy" as const,
              reason: "normal" as const,
            })),
          ),
      },
      salvage: { moveToHand: moveRecycledCardToHand },
      duel: { damage },
      shred: {
        attachment: (state, id) => ({
          ...entryAttachment(state, id),
          permittedHosts: new Set(
            state.arena.filter((host) => canTarget(state, id, host)),
          ),
        }),
      },
      normalizeControl: (s) => cortex.normalize(s).state,
      reanimator: {
        enter: (s, player, source, id) =>
          returnCharacterWithSpirit(s, player, source, id, {
            characteristics,
            putCounters,
            prepareEntry,
          }),
        purge: (s, _source, id) =>
          departures.depart(s, [{ id, kind: "move", destination: "purge" }]),
      },
      judgmentDay: {
        destroy: (s, sourceId, ids) =>
          departures.depart(
            s,
            ids.map((id) => ({
              id,
              sourceId,
              kind: "destroy",
              reason: "normal",
            })),
          ),
        purge: (s, _source, id) =>
          departures.depart(s, [{ id, kind: "move", destination: "purge" }]),
      },
      rampage: { destroy: departures.destroy },
      keywordEnabled: hasAbility,
      isTether: gear.hasTether,
      selfDestructionCost: {
        pay: (state, sourceId) => ({
          state: departures.destroy(state, sourceId, sourceId),
          paid: true,
        }),
      },
      yes: {
        targetsCacheAction: targetsPendingCardAction,
        counter: (state, actionId, sourceId) =>
          counterCacheAction(state, actionId, sourceId, true),
        putCounters,
      },
      search: {
        canSearch: () => true,
        moveToHand: moveSearchedCardToHand,
        shuffleDeck: shuffleCyberdeck,
        purgeSource: (state, id) => departures.move(state, id, "purge"),
      },
      drawReplacementEnabled: hasAbility,
      damageReplacementEnabled: hasAbility,
      counters: { putCounters },
      mainframeCounters: { putCounters },
      characterDestructionCost: {
        characteristics,
        depart: (s, intents) => departures.depart(s, intents),
      },
      xandra: {
        characteristics,
        depart: (s, intents) => departures.depart(s, intents),
        psychosis,
        canRun: () => true,
        canTarget,
        damage: (s, packets) => damage(s, packets),
      },
      programCostEnabled: hasAbility,
      damage: { canTargetPlayer: () => true, damage },
      topCards: {
        moveToHand: moveSearchedCardToHand,
        bin: binCyberdeckCards,
        enterTeaParty: (s, player, source, id) =>
          enterTeaParty(s, player, source, id, {
            characteristics,
            putCounters,
            prepareEntry,
          }),
      },
      hits: {
        hasAbility,
        damage,
        smashAndGrab: {
          destroy: departures.destroy,
          install: (state, player, _sourceId, running) =>
            install(state, player, running),
        },
      },
    },
  );
  const mainframes = bindMainframeResources(
    pins.filter((p) =>
      mainframeResourceSpecs.some((s) => s.cardId === p.definition.cardId),
    ),
    engine,
    rulesVersion,
    {
      characteristics,
      hasAbility,
      draw: (state, player) => draw(state, player, 1),
      install: (state, player, _sourceId, running) =>
        install(state, player, running),
    },
  );
  const mirage = bindDustDevilVultures(
    admission.definitions.get(mirageSpec.cardId)!,
    engine,
    rulesVersion,
    {
      characteristics,
      hasAbility,
      returnToHand: (state, id) => departures.move(state, id, "hand"),
    },
  );
  const aurora = admission.definitions.has(auroraId)
    ? bindAurora(admission.definitions.get(auroraId)!, engine, rulesVersion, {
        hasAbility,
        characteristics,
        moveToHand: moveSearchedCardToHand,
        bin: binCyberdeckCards,
      })
    : null;
  const radiant = admission.definitions.has(radiantId)
    ? bindRadiant(admission.definitions.get(radiantId)!, engine, rulesVersion, {
        hasAbility,
        characteristics,
        moveToHand: moveSearchedCardToHand,
        bin: binCyberdeckCards,
      })
    : null;
  const wndrtech = admission.definitions.has(wndrtechId)
    ? bindWndrtech(
        admission.definitions.get(wndrtechId)!,
        engine,
        rulesVersion,
        {
          hasAbility,
          characteristics,
          create: (s, player, source, token, attack) => {
            const definition = chessTokens.get(token + ":" + attack);
            if (!definition)
              throw Error("WNDRTECH token definition unavailable");
            return createCharacterToken(
              s,
              player,
              source,
              definition.version,
              definitions,
              false,
              prepareEntry,
            );
          },
        },
      )
    : null;
  const archangelPin = admission.definitions.get(archangelSpec.cardId);
  const sidewinder = admission.definitions.has(sidewinderSpec.cardId)
    ? bindSidewinder(
        admission.definitions.get(sidewinderSpec.cardId)!,
        engine,
        rulesVersion,
        {
          characteristics,
          hasAbility,
          returnToHand: (s, id) => departures.move(s, id, "hand"),
        },
      )
    : null;
  const extraBindings = [
    eclipseBindings(
      admission.definitions.get(eclipseSpec.cardId)?.version,
      eclipseEffects,
    ),
    singularityEntry(
      admission.definitions.get(singularitySpec.cardId)?.version,
      {
        hasAbility,
        characteristics,
        depart: (s, intents) => departures.depart(s, intents),
      },
    ),
    ...(sidewinder
      ? [
          {
            ...sidewinder,
            events: new Map(
              pins
                .filter(
                  (p) => p.definition.characteristics.cardType === "character",
                )
                .map((p) => [p.version, sidewinder.behavior]),
            ),
          },
        ]
      : []),
    madHatterDeparture(
      admission.definitions.get(madHatterSpec.cardId)?.version,
      {
        characteristics,
        hasAbility,
        depart: (s, intents) => departures.depart(s, intents),
      },
    ),
    trixieDraw(
      admission.definitions.get(trixieSpec.cardId)?.version,
      hasAbility,
      draw,
    ),
    ...(archangelPin
      ? [
          bindArchangelArmor(archangelPin, engine, rulesVersion, {
            hasAbility,
            putCounters,
          }),
        ]
      : []),
    ...(plasmaShackle ? [plasmaShackle] : []),
    ...(radiant ? [radiant] : []),
    ...(wndrtech ? [wndrtech] : []),
    ...(aurora ? [aurora] : []),
    bindCombatGear(
      pins.filter((p) =>
        combatGearSpecs.some((s) => s.cardId === p.definition.cardId),
      ),
      engine,
      rulesVersion,
      {
        characteristics,
        hasAbility,
        canTarget,
        damage,
        destroy: departures.destroy,
        install: (s, p) => install(s, p, true),
      },
    ),
    ...(admission.definitions.has(ventureId)
      ? [
          bindVenture(
            admission.definitions.get(ventureId)!,
            engine,
            rulesVersion,
            { hasAbility, putCounters },
          ),
        ]
      : []),
    ...(dreamwalker && admission.definitions.has(spiritGuideId)
      ? [
          bindSpiritGuide(
            admission.definitions.get(spiritGuideId)!,
            engine,
            rulesVersion,
            {
              hasAbility,
              create: (state, player, sourceId) => {
                const next = createCharacterToken(
                  state,
                  player,
                  sourceId,
                  dreamwalker.version,
                  definitions,
                );
                const event = next.pendingRuleEvents.at(-1)!;
                next.pendingRuleEvents[next.pendingRuleEvents.length - 1] = {
                  ...event,
                  ...captureEventObservation(next),
                };
                return next;
              },
            },
          ),
        ]
      : []),
    ...(admission.definitions.has(astralProjectorId)
      ? [
          bindAstralProjector(
            admission.definitions.get(astralProjectorId)!,
            engine,
            rulesVersion,
            { hasAbility, characteristics },
          ),
        ]
      : []),
    ...(admission.definitions.has(meltdownId)
      ? [
          bindMeltdown(
            admission.definitions.get(meltdownId)!,
            engine,
            rulesVersion,
            {
              characteristics,
              hasAbility,
              canTarget,
              putCounters,
            },
          ),
        ]
      : []),
    ...(admission.definitions.has(deepnetId)
      ? [
          bindDeepnet(
            admission.definitions.get(deepnetId)!,
            engine,
            rulesVersion,
            {
              characteristics,
              hasAbility,
              damage,
              draw,
            },
          ),
        ]
      : []),
    ...(admission.definitions.has(nexusId)
      ? [
          bindNexus(admission.definitions.get(nexusId)!, engine, rulesVersion, {
            characteristics,
            hasAbility,
            canTarget,
          }),
        ]
      : []),
    ...(drone && admission.definitions.has(hiveDynamicsId)
      ? [
          bindHiveDynamics(
            admission.definitions.get(hiveDynamicsId)!,
            engine,
            rulesVersion,
            {
              characteristics,
              hasAbility,
              create: (state, player, sourceId) => {
                const next = createCharacterToken(
                  state,
                  player,
                  sourceId,
                  drone.version,
                  definitions,
                );
                next.pendingRuleEvents[next.pendingRuleEvents.length - 1] = {
                  ...next.pendingRuleEvents.at(-1)!,
                  ...captureEventObservation(next),
                };
                return next;
              },
            },
          ),
        ]
      : []),
    ...(dreamwalker && admission.definitions.has(eclipseId)
      ? [
          bindEclipse(
            admission.definitions.get(eclipseId)!,
            engine,
            rulesVersion,
            {
              characteristics,
              hasAbility,
              create: (state, player, sourceId) => {
                const next = createCharacterToken(
                  state,
                  player,
                  sourceId,
                  dreamwalker.version,
                  definitions,
                );
                next.pendingRuleEvents[next.pendingRuleEvents.length - 1] = {
                  ...next.pendingRuleEvents.at(-1)!,
                  ...captureEventObservation(next),
                };
                return next;
              },
            },
          ),
        ]
      : []),
    ...(admission.definitions.has(spotlightId)
      ? [
          bindSpotlight(
            admission.definitions.get(spotlightId)!,
            engine,
            rulesVersion,
            { characteristics, hasAbility, install },
          ),
        ]
      : []),
    ...(admission.definitions.has(berserkerId)
      ? [
          bindBerserker(
            admission.definitions.get(berserkerId)!,
            engine,
            rulesVersion,
            { characteristics, hasAbility },
          ),
        ]
      : []),
    ...(admission.definitions.has(headbangerId)
      ? [
          bindHeadbanger(
            admission.definitions.get(headbangerId)!,
            engine,
            rulesVersion,
            { characteristics, hasAbility },
          ),
        ]
      : []),
    ...(admission.definitions.has(omnisId)
      ? [
          bindOmnis(admission.definitions.get(omnisId)!, engine, rulesVersion, {
            characteristics,
            install,
            hasAbility,
          }),
        ]
      : []),
    bindVampCards(
      pins.filter((p) =>
        vampRecipes.some((r) => r.cardId === p.definition.cardId),
      ),
      engine,
      rulesVersion,
      { hasAbility, characteristics, health: applyHealthChanges },
    ),
    ...(admission.definitions.has(savageId)
      ? [
          bindSavage(
            admission.definitions.get(savageId)!,
            engine,
            rulesVersion,
            {
              hasAbility,
              characteristics,
              damage,
              hasNativeFeedback: (s, id) =>
                s.objects[id]?.definitionVersion ===
                  admission.definitions.get(shredderId)?.version &&
                hasAbility(s, id),
            },
          ),
        ]
      : []),
    ...(admission.definitions.has(sinisterManagerId)
      ? [
          bindSinisterManager(
            admission.definitions.get(sinisterManagerId)!,
            engine,
            rulesVersion,
            {
              hasAbility,
              characteristics,
              canTarget,
              depart: departures.depart,
            },
          ),
        ]
      : []),
    ...(admission.definitions.has(roxyRiotId)
      ? [
          bindRoxyRiot(
            admission.definitions.get(roxyRiotId)!,
            engine,
            rulesVersion,
            { hasAbility, damage, putCounters },
          ),
        ]
      : []),
    ...(admission.definitions.has(groupieId)
      ? [
          bindGroupie(
            admission.definitions.get(groupieId)!,
            engine,
            rulesVersion,
            { hasAbility, characteristics, canTarget },
          ),
        ]
      : []),
    ...(admission.definitions.has(shredderId)
      ? [
          bindShredder(
            admission.definitions.get(shredderId)!,
            engine,
            rulesVersion,
            { hasAbility, characteristics, damage },
          ),
        ]
      : []),
    ...(admission.definitions.has(edCardCounterSpec.cardId)
      ? [
          bindEdCardCounter(
            admission.definitions.get(edCardCounterSpec.cardId)!,
            engine,
            rulesVersion,
            { hasAbility, putCounters },
          ),
        ]
      : []),
    ...(admission.definitions.has(edwardSpec.cardId)
      ? [
          bindEdward(
            admission.definitions.get(edwardSpec.cardId)!,
            engine,
            rulesVersion,
            { hasAbility, putCounters },
          ),
        ]
      : []),
    ...(admission.definitions.has(astraSpec.cardId)
      ? [
          bindAstra(
            admission.definitions.get(astraSpec.cardId)!,
            engine,
            rulesVersion,
            { hasAbility, draw: (state, player) => draw(state, player, 1) },
          ),
        ]
      : []),
    ...(features.tokenCopies &&
    admission.definitions.has("d6679224-67af-4815-91ab-ac6bfcc8a929")
      ? [
          bindSpinalSplitter(
            admission.definitions.get("d6679224-67af-4815-91ab-ac6bfcc8a929")!,
            engine,
            rulesVersion,
            {
              definitions,
              prepareEntry,
              characteristics,
              hasAbility,
              psychosis,
              depart: departures.depart,
            },
          ),
        ]
      : []),
    cortex,
    bindFluxCannon(
      pins.filter((p) =>
        cyberneticGearSpecs.some(
          (s) => s.kind === "flux-cannon" && s.cardId === p.definition.cardId,
        ),
      ),
      engine,
      rulesVersion,
      { characteristics, hasAbility, canTarget, damage },
    ),
    ...(admission.definitions.has(trustSpec.cardId)
      ? [
          bindTrustfundBaby(
            admission.definitions.get(trustSpec.cardId)!,
            engine,
            rulesVersion,
            {
              hasAbility,
              install: (state, player, _source, running) =>
                install(state, player, running),
            },
          ),
        ]
      : []),
    ...(admission.definitions.has(debtSpec.cardId)
      ? [
          bindDebtCollector(
            admission.definitions.get(debtSpec.cardId)!,
            engine,
            rulesVersion,
            { characteristics, hasAbility, damage },
          ),
        ]
      : []),
    ...(admission.definitions.has(firestarterSpec.cardId)
      ? [
          bindFirestarter(
            admission.definitions.get(firestarterSpec.cardId)!,
            engine,
            rulesVersion,
            {
              characteristics,
              hasAbility,
              canTarget: (state, sourceId, target) =>
                target.kind === "player" ||
                canTarget(state, sourceId, target.id),
              damage: (state, packet) => damage(state, [packet]),
            },
          ),
        ]
      : []),
    corpoGear,
  ];
  const kiddie = scriptKiddie({
    version: features.abilityCopy
      ? pins.find(
          (p) => p.definition.cardId === "d374babb-b154-4d8b-ad14-19514858a8be",
        )?.version
      : undefined,
    characteristics,
    canTarget,
    abilities: (state, id) => [
      ...characters.activationOptions(state, id).map((a) => ({
        label: a.label,
        copy: characters.copyAbility(state, id, a.abilityId),
      })),
      ...grantedGear.activationOptions(state, id).map((a) => ({
        label: a.label,
        copy: grantedGear.copyAbility(state, id, a.abilityId),
      })),
    ],
    activation: (state, id) => ({
      definitions,
      sourceCharacteristics: characteristics(state).get(id)!,
      allowed: hasAbility(state, id),
      ramCost: 0,
      run: true,
      revealSource: false,
      psychosis,
    }),
  });
  const redirect: RedirectEvaluation = {
    validateScriptSource: (s, id, version) =>
      programs.validateChariotSource(s, id, version),
    variants(state, action) {
      // Evaluate target permissions as the original ability controller, without
      // requiring the departed or spent source to activate again.
      if (
        features.abilityCopy &&
        action.activatedAbility.handler === "script-kiddie/ctrl-c"
      )
        return kiddie.variants(state, action.sourceId);
      if (action.activatedAbility.handler.startsWith("trojan/"))
        return trojans.retargetVariants(state, action);
      if (grantedGear.isGrantedAbility(action.activatedAbility.abilityId))
        return grantedGear.retargetVariants(state, action);
      return (
        characters
          .activationOptions(state, action.sourceId, action)
          .find((a) => a.abilityId === action.activatedAbility.abilityId)
          ?.variants ?? []
      );
    },
  };
  const keywordCounters = bindKeywordCounterTriggers(
    engine.version,
    rulesVersion,
    { characteristics, putCounters, damage },
  );
  const attachment = (state: GameState, id: string) => ({
    characteristics: characteristics(state),
    malicious:
      cortex.isCrab(state, id) ||
      !!plasmaShackle?.malicious(state, id) ||
      hostileGear.malicious(state, id),
    observeAttachment: cortex.isCrab(state, id),
    ...(rulesVersion === "1.1"
      ? { afterAttach: (s: GameState) => cortex.normalize(s).state }
      : {}),
    tether: gear.hasTether(state, id),
    permittedHosts: new Set(
      state.arena.filter((target) => canTarget(state, id, target)),
    ),
  });
  // During announcement the gear is in hand/cache, so TETHER is selected from its
  // retained definition; continuous contributions still require an in-play source.
  const tetherVersions = new Set(
    pins
      .filter((p) =>
        ["CHAIN AMPLIFIER", "SYNCHRONIZE", "HOT WIRE"].includes(
          p.definition.characteristics.name,
        ),
      )
      .map((p) => p.version),
  );
  const entryAttachment = (state: GameState, id: string) => ({
    ...attachment(state, id),
    tether: tetherVersions.has(state.objects[id].definitionVersion),
  });
  const printedKeywords = bindCharacterKeywords(
    pins.filter((p) =>
      characterKeywordSpecs.some((s) => s.cardId === p.definition.cardId),
    ),
    engine,
    rulesVersion,
    hasAbility,
  );
  const combat = (state: GameState) => {
    const cards = characteristics(state),
      keywords = new Map<string, Set<CombatKeyword>>();
    for (const id of state.arena)
      if (cards.get(id)?.cardType === "character") keywords.set(id, new Set());
    for (const [id, values] of printedKeywords.keywords(state, cards))
      for (const value of values) keywords.get(id)?.add(value);
    for (const id of gear.overrun(state, cards))
      keywords.get(id)?.add("OVERRUN");
    for (const id of opticalGear.vision(state, cards))
      keywords.get(id)?.add("VISION");
    for (const id of savageGrants(
      state,
      admission.definitions.get(savageId)?.version,
      cards,
      hasAbility,
    ).stamina)
      keywords.get(id)?.add("STAMINA");
    for (const grant of programs.environmentKeywordGrants(state, cards))
      keywords.get(grant.targetId)?.add(grant.keyword);
    const keywordRules = combatKeywordRules(state, cards, keywords);
    return {
      ...keywordRules,
      canBlock: (s: GameState, blocker: string, attacker: string) =>
        archangelCanCombat(s, blocker, archangelPin?.version, hasAbility) &&
        keywordRules.canBlock(s, blocker, attacker),
      characteristics: cards,
      mustBlock: (s: GameState, id: string) =>
        activeCombatEffects(s).some(
          (effect) =>
            (effect.targetId === null || effect.targetId === id) &&
            effect.change.kind === "must-block",
        ),
      minimumBlockers: (s: GameState, id: string) =>
        sidewinder?.minimumBlockers(s, id) ?? 1,
      mustAttack: (s: GameState, id: string) =>
        hostileGear.mustAttack(s, id) ||
        activeCombatEffects(s).some(
          (effect) =>
            (effect.targetId === null || effect.targetId === id) &&
            effect.change.kind === "must-attack",
        ),
      canAttack: (s: GameState, id: string) =>
        archangelCanCombat(s, id, archangelPin?.version, hasAbility),
      psychosis,
    };
  };
  const eventBehaviors = new Map<string, EventBehavior>();
  for (const version of definitions.keys()) {
    const behaviors = [
      programs.events,
      characters.events,
      mainframes.events,
      mirage.events,
      gear.events,
      ...extraBindings.map((b) => b.events),
    ].flatMap((m) => (m.has(version) ? [m.get(version)!] : []));
    eventBehaviors.set(version, {
      onEvent: (state, id, event) =>
        behaviors.flatMap((b) => b.onEvent(state, id, event)),
    });
  }
  const triggers = new Map([
    ...programs.triggers,
    ...characters.triggers,
    ...mainframes.triggers,
    ...mirage.triggers,
    ...gear.triggers,
    ...extraBindings.flatMap((b) => [...b.triggers]),
    ...keywordCounters.triggers,
  ]);
  const follow = {
    move: (
      state: GameState,
      tetherId: string,
      _hostId: string,
      destination: Parameters<typeof departures.move>[2],
    ) => departures.move(state, tetherId, destination),
  };
  const wonderlandEffects: WonderlandEffects = {
    characteristics,
    canTarget,
    putCounters,
    destroy: (s, sourceId, id, player) =>
      departures.depart(s, [
        {
          id,
          sourceId,
          kind: "destroy",
          reason: "normal",
          destroyedBy: player,
        },
      ]),
    bin: binCyberdeckCards,
    options: (s) =>
      wonderlandOptions(s, bindings.commands, bindings.battlefield),
    canPlay: (s) =>
      canPlayWonderland(s, bindings.commands, bindings.battlefield),
    play: (s, action) => playWonderland(s, action, bindings.commands),
  };
  const bindings: EngineRuntimeBindings = {
    engineVersion: engine.version,
    rulesVersion,
    visibility: {
      canInspectOpponentHand: (state, viewer) =>
        opticalGear.thirdEye(state, viewer),
      canInspectCyberdeckTop: (state, viewer) =>
        !!topCard(state, viewer) ||
        (state.pendingDecision?.type === "wonderland" &&
          state.pendingDecision.stage === "play" &&
          state.pendingDecision.player === viewer),
      canInspectFaceDown: (state, id, viewer) =>
        isEndgameRevealed(state, id) ||
        ((state.arena.includes(id) ||
          state.environment.includes(id) ||
          state.players.some(
            (p) =>
              p.zones.mainframe.includes(id) || p.zones.ramBank.includes(id),
          )) &&
          opticalGear.thirdEye(state, viewer)) ||
        (trojans.isTrojan(state, id) &&
          state.objects[id].controller === viewer) ||
        corpoGear.canInspectFaceDown(state, viewer, id),
    },
    battlefield: {
      characteristics,
      inspectFaceDown: (state, id) =>
        structuredClone(definitions.get(state.objects[id].definitionVersion)!),
      triggerLabels: new Map([
        ...programs.triggerLabels,
        ...characters.triggerLabels,
        ...mainframes.triggerLabels,
        ...mirage.triggerLabels,
        ...gear.triggerLabels,
        ...extraBindings.flatMap((b) => [...b.triggerLabels]),
        ...keywordCounters.triggerLabels,
      ]),
      artworkUrl: (version) => {
        const pin = pins.find((p) => p.version === version);
        return artworkBaseUrl && pin?.definition.artwork
          ? `${artworkBaseUrl.replace(/\/$/, "")}/${pin.definition.artwork.path}`
          : undefined;
      },
    },
    commands: {
      bailout: () => ({
        characteristics,
        depart: (s, _source, intents) => departures.depart(s, intents),
      }),
      ...programs,
      ...characters,
      ...(admission.definitions.has("d02bb901-d744-4730-b0da-4cd9cd9e42aa")
        ? {
            counterPayment: () => ({
              definitions,
              counter: (state: GameState, actionId: string, sourceId: string) =>
                counterCacheAction(state, actionId, sourceId, true),
            }),
          }
        : {}),
      redirectChoice: () => redirect,
      ...(features.abilityCopy ? { copyAbilityChoice: kiddie.answer } : {}),
      program: (state, id, choices) =>
        trojans.isTrojan(state, id)
          ? trojans.program(state, id, choices)
          : programs.program(state, id, choices),
      ducky: () => ({ commands: bindings.commands, characteristics }),
      eclipse: () => eclipseEffects,
      wonderland: () => wonderlandEffects,
      quoteDuringResolution: (s, user, request) =>
        s.pendingDecision?.type === "ducky-play"
          ? quoteDucky(s, user, request, {
              commands: bindings.commands,
              characteristics,
            })
          : quoteWonderland(s, user, request, bindings.commands),
      canPlayCyberdeckTop: (state, id, player) => topCard(state, player) === id,
      canReplayProgram: (s, id) => !!aethernetReplay(s, id),
      programVariants: (state, id) =>
        trojans.isTrojan(state, id)
          ? trojans.programVariants(state, id)
          : programs.programVariants(state, id),
      activation: (state, id, abilityId, choices) => {
        const evaluated =
          features.abilityCopy && abilityId === "ctrl-c"
            ? kiddie.activation(state, id, choices)
            : trojans.isTrojan(state, id)
              ? trojans.activation(state, id, abilityId, choices)
              : grantedGear.isGrantedAbility(abilityId)
                ? grantedGear.activation(state, id, abilityId, choices)
                : characters.activation(state, id, abilityId, choices);
        return hasAbility(state, id) &&
          singularityControls(
            state,
            admission.definitions.get(singularitySpec.cardId)?.version,
            state.objects[id].controller,
            characteristics(state),
            hasAbility,
          )
          ? { ...evaluated, ramCost: 0 }
          : evaluated;
      },
      activationOptions: (state, id) => [
        ...kiddie.activationOptions(state, id),
        ...trojans.activationOptions(state, id),
        ...characters.activationOptions(state, id),
        ...grantedGear.activationOptions(state, id),
      ],
      topCards: (state) =>
        radiant &&
        state.pendingDecision?.type === "top-cards" &&
        state.pendingDecision.handler === radiantHandler
          ? radiant.topCards(state)
          : aurora &&
              state.pendingDecision?.type === "top-cards" &&
              state.pendingDecision.handler === auroraHandler
            ? aurora.topCards(state)
            : state.priorityWindow?.resolving?.kind === "activated"
              ? characters.topCards(state)
              : programs.topCards(state),
      deckSearch: (state) =>
        state.priorityWindow?.resolving?.kind === "activated"
          ? characters.deckSearch(state)
          : programs.deckSearch(state),
      character: (s, id) => ({
        ...play(s, id),
        ...(s.objects[id].definitionVersion ===
        admission.definitions.get(xandraSpec.cardId)?.version
          ? {
              characterRunCost: {
                candidates: xandra({
                  characteristics,
                  depart: (s, intents) => departures.depart(s, intents),
                  psychosis,
                  canRun: () => true,
                  canTarget,
                  damage: (s, p) => damage(s, p),
                }).candidates(s, id),
                count: 2,
                psychosis,
              },
            }
          : {}),
      }),
      gear: (state, id) => ({
        play: play(state, id),
        attachment: entryAttachment(state, id),
      }),
      drawRestrictions: () => ({ cannotDraw: false, cannotInstall: false }),
      ramBalance: (state) => ({ characteristics: characteristics(state) }),
      tetherFollow: () => follow,
      forceQuit: () => ({
        canForceQuit: hostileGear.canForceQuit,
        destroySimultaneously: departures.forceQuit,
      }),
      combat,
      damage: (state) => ({
        characteristics: characteristics(state),
        overrun: combat(state).overrun,
        prepare: prepareFirewallDamage,
      }),
    },
    automatic: {
      eventBehaviors: () => eventBehaviors,
      ruleTriggers: (s, event) => [
        ...keywordCounters.ruleTriggers(s, event),
        ...programs.ruleTriggers(s, event),
      ],
      characteristics,
      systemCheck: () => ({
        definitions,
        requiredRam: (state, id) => {
          const c = characteristics(state).get(id);
          if (c?.cardType !== "character")
            throw new Error("Invalid upkeep source");
          return c.ramCost;
        },
        resolveInstability: (state, player) =>
          resolveInstability(state, player, {
            characteristics: characteristics(state),
            roll: baseInstabilityRoll,
            destroySimultaneously: (s, ids) =>
              departures.depart(
                s,
                ids.map((id) => ({
                  id,
                  kind: "destroy",
                  sourceId: null,
                  reason: "normal",
                })),
              ),
          }),
      }),
      refresh: () => ({ canRefresh: () => true, canReboot: () => true }),
      expireTurnEffects: (state) =>
        expireTimedDamagePrevention(
          expireTimedTriggerEffects(
            expireDestructionProtection(
              expireTimedCombatEffects(
                expireTimedStatEffects(expireFreeCardPlays(state)),
              ),
            ),
          ),
        ),
    },
    stateBased: {
      continuous: cortex.normalize,
      evaluate: (state) => ({
        characteristics: characteristics(state),
        malicious: new Set(
          state.arena.filter(
            (id) =>
              cortex.isCrab(state, id) ||
              !!plasmaShackle?.malicious(state, id) ||
              hostileGear.malicious(state, id),
          ),
        ),
        tether: new Set(state.arena.filter((id) => gear.hasTether(state, id))),
        canDestroy: new Set(
          state.arena.filter((id) => canDestroyPersistent(state, id)),
        ),
      }),
      depart: departures.stateBased,
      followTether: (state, id) => {
        const next = beginTetherFollow(state, id, follow);
        return {
          state: next,
          changed: true,
          decisionPending: !!next.pendingDecision,
        };
      },
      healthLoss: (state, candidates) =>
        replaceBailoutHealthLoss(state, candidates, {
          characteristics,
        }),
    },
    cache: {
      definitions: () => definitions,
      scripts: programs.scripts,
      activated: new Map([
        ...(features.abilityCopy
          ? [["script-kiddie/ctrl-c", kiddie.behavior] as const]
          : []),
        ...characters.activated,
        ...grantedGear.activated,
        ...trojans.activated,
      ]),
      continuations: characters.continuations,
      resources: { draw, install },
      entries: {
        character: (state) =>
          resolveCharacterEntry(state, definitions, prepareEntry),
        gear: (state) =>
          resolveGearEntry(
            state,
            entryAttachment(state, state.priorityWindow!.resolving!.sourceId),
          ),
        protocol: (state) =>
          trojans.isTrojan(state, state.priorityWindow!.resolving!.sourceId)
            ? trojans.entry(state)
            : programs.protocolEntry(state),
        environment: (state) =>
          resolveEnvironmentEntry(state, {
            definitions,
            allowsMultiple: (s) =>
              s.environment.some(
                (id) =>
                  s.objects[id].definitionVersion ===
                    admission.definitions.get(multiverseId)?.version &&
                  hasAbility(s, id),
              ),
            destroy: (s, id, sourceId) => departures.destroy(s, sourceId, id),
          }),
      },
    },
    triggers,
  };
  return { admission, runtime: createEngineRuntime(bindings), bindings };
}
import aliceNameReference from "./alice-name-reference-v3.json";
import { versionDefinition } from "./definition-version";
