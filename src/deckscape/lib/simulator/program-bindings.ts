import { theTower, validateTower } from "./the-tower";
import towerSpec from "./the-tower-specification-v5.json";
import { justice } from "./justice";
import justiceSpec from "./justice-specification-v5.json";
import { enhance, validateEnhance } from "./enhance";
import enhanceSpec from "./enhance-specification-v5.json";
import { theDevil } from "./the-devil";
import devilSpec from "./the-devil-specification-v5.json";
import bailoutSpec from "./bailout-specification-v5.json";
import { bailoutScript, validateBailoutChoices } from "./bailout";
import hangedSpec from "./the-hanged-man-specification-v3.json";
import { theHangedMan } from "./the-hanged-man";
import type { CharacterDestructionCostEffects } from "./character-destruction-cost";
import judgementSpec from "./judgement-specification-v3.json";
import { judgement } from "./judgement";
import moonSpec from "./the-moon-specification-v3.json";
import { theMoon } from "./the-moon";
import chariotSpec from "./the-chariot-specification-v3.json";
import { theChariot } from "./the-chariot";
import type { RedirectEvaluation } from "./redirect-ability";
import wheelSpec from "./wheel-of-fortune-specification-v3.json";
import { wheelOfFortune } from "./wheel-of-fortune";
import { validateRamCostChoiceContinuation } from "./ram-cost-choice";
import { rushTheStage } from "./rush-the-stage";
import rushStageSpec from "./rush-the-stage-specification-v3.json";
import { hyperclock } from "./hyperclock";
import hyperclockSpec from "./hyperclock-specification-v3.json";
import cheshireSpec from "./cheshire-rar-specification-v3.json";
import loversSpec from "./the-lovers-specification-v3.json";
import { theLovers } from "./the-lovers";
import { theMagician } from "./the-magician";
import magicianSpecification from "./the-magician-specification-v3.json";
import butterflySpecifications from "./butterfly-specifications-v3.json";
import downloadRamSpecification from "./download-more-ram-specification-v3.json";
import temperanceSpecification from "./temperance-specification-v3.json";
import { temperance } from "./temperance";
import inflationSpec from "./artificial-inflation-specification-v3.json";
import { dejaVu } from "./deja-vu";
import dejaVuSpecification from "./deja-vu-specification-v3.json";
import { claritex } from "./claritex";
import claritexSpecification from "./claritex-specification-v3.json";
import { downloadMoreRam } from "./download-more-ram";
import { purgeRecycleBins } from "./purge-recycle-bins";
import type { Seat } from "./setup";
import { theFool } from "./the-fool";
import { throughLookingGlass } from "./through-looking-glass";
import { blueScreenOfDeath } from "./blue-screen-of-death";
import { destructionFollowup } from "./destruction-followup-scripts";
import { staticBlast } from "./static-blast";
import { oilSpill } from "./oil-spill";
import type { CharacterCounterEffects } from "./character-counter-abilities";
import { propaganda } from "./propaganda";
import { searchScript, type SearchScriptEffects } from "./search-scripts";
import { validateUntargetedScript } from "./resolve-script";
import {
  validateRetargetChoiceContinuation,
  type RetargetChoiceEvaluation,
} from "./retarget-choice";
import { isDeepStrictEqual } from "node:util";
import {
  retargetProgram,
  programRetargetObjectSlots,
  selectProgramRetargetObjects,
  singleTargetRetargetOptions,
  type ProgramRetargetSelection,
} from "./retarget-program";
import { isCurrentActionTarget } from "./action-targets";
import { combTheDesert, type CombTheDesertEffects } from "./comb-the-desert";
import { phishing, type PhishingEffects } from "./phishing";
import {
  validateHandChoiceContinuation,
  type HandChoiceEvaluation,
} from "./hand-choice";
import retainedSpecifications from "./program-specifications-v1.json";
import departureSpecifications from "./departure-program-specifications-v3.json";
import { singleDepartureProgram } from "./single-departure-programs";
import { multipleDepartureProgram } from "./multiple-departure-programs";
import combatSpecifications from "./combat-program-specifications-v3.json";
import { factionProgram } from "./faction-programs";
import easySpecifications from "./easy-program-specifications-v3.json";
const specifications = [
  devilSpec,
  enhanceSpec,
  towerSpec,
  justiceSpec,
  bailoutSpec,
  judgementSpec,
  hangedSpec,
  moonSpec,
  chariotSpec,
  loversSpec,
  magicianSpecification,
  downloadRamSpecification,
  temperanceSpecification,
  dejaVuSpecification,
  hyperclockSpec,
  wheelSpec,
  rushStageSpec,
  claritexSpecification,
  ...retainedSpecifications,
  ...easySpecifications,
  ...combatSpecifications,
  ...departureSpecifications,
];
import retainedEnvironmentSpecs from "./environment-specifications-v1.json";
import multiverseSpec from "./multiverse-specification-v5.json";
import wonderlandSpec from "./wonderland-specification-v5.json";
import passiveEnvironmentSpecs from "./passive-environment-specifications-v3.json";
const environmentSpecifications = [
  ...retainedEnvironmentSpecs,
  ...passiveEnvironmentSpecs,
  wonderlandSpec,
  multiverseSpec,
];
import wallSpec from "./wall-of-death-specification-v5.json";
import amethystSpec from "./amethyst-datashard-specification-v5.json";
import firewallSpec from "./firewall-specification-v5.json";
import retainedProtocolSpecifications from "./protocol-specifications-v1.json";
import cycleProtocolSpecifications from "./cycle-protocol-specifications-v3.json";
import tarotProtocolSpecifications from "./tarot-protocol-specifications-v3.json";
const protocolSpecifications = [
  inflationSpec,
  cheshireSpec,
  firewallSpec,
  amethystSpec,
  wallSpec,
  ...retainedProtocolSpecifications,
  ...tarotProtocolSpecifications,
  ...butterflySpecifications,
  ...cycleProtocolSpecifications,
];
import {
  bindProtocols,
  type ProtocolBindingEffects,
} from "./protocol-bindings";
import {
  bindEnvironmentTriggers,
  type EnvironmentEffects,
} from "./environment-bindings";
import { versionDefinition, type EngineManifest } from "./definition-version";
import {
  characteristicsSchema,
  type CardCharacteristics,
} from "./characteristics";
import type { PinnedDefinition } from "./deck-admission";
import type { GameState } from "./game-state";
import type { EventBehavior } from "./rule-events";
import type { TriggerBehavior } from "./resolve-trigger";
import type { PersistentDeparture } from "./destruction";
import type { CharacterPlayEvaluation } from "./play-character";
import type { ProgramChoices, ProgramPlayEvaluation } from "./play-program";
import type { ProgramPlayVariant } from "./program-play-option";
import {
  moonFlowerCactusScript,
  theEmpressScript,
  type ScriptBehavior,
} from "./resolve-script";
import {
  strengthScript,
  strengthTargets,
  validateStrengthChoices,
} from "./strength";
import {
  binaryBlastScript,
  timeScript,
  characterStatusTargets,
  validateCharacterStatusChoices,
  type CharacterStatusEvaluation,
} from "./character-status-effects";
import {
  bindWonderlandSizeScripts,
  validateWonderlandSizeChoices,
  type WonderlandSizeEvaluation,
} from "./wonderland-size-scripts";
import { highPriestessScript } from "./counter";
import { hierophantScript } from "./conditional-counter";
import { overload, type OverloadEffects } from "./overload";
import { cyberneticDrug } from "./cybernetic-drug-scripts";
import { antivirus, type AntivirusEffects } from "./antivirus";
import { marketManipulation } from "./market-manipulation";
import { quantumEncryption } from "./quantum-encryption";
import { genocide, type GenocideEffects } from "./genocide";
import {
  validateFactionChoiceContinuation,
  type FactionChoiceEvaluation,
} from "./faction-choice";
import {
  savageDuststorm,
  type SavageDuststormEffects,
} from "./savage-duststorm";
import {
  destructionScript,
  destructionScriptTargets,
  validateDestructionScriptChoices,
  type DestructionScriptEffects,
  type DestructionTargetType,
} from "./destruction-scripts";
import {
  counterProgramVariants,
  validateCounterProgramChoices,
  type CounterTargetEvaluation,
} from "./counter-program-choices";

export interface ProgramBindingEffects {
  characterDestructionCost?: CharacterDestructionCostEffects;
  redirect?(): RedirectEvaluation;
  foolDraw?: (state: GameState, player: Seat, count: number) => GameState;
  instability?: import("./blue-screen-of-death").BlueScreenEffects;
  death?: import("./destruction-followup-scripts").DeathEffects;
  putCounters?: CharacterCounterEffects["putCounters"];
  movePermanent?(
    state: GameState,
    id: string,
    destination: "hand" | "cyberdeck",
    position?: "top",
  ): GameState;
  bounceBatch?(state: GameState, ids: string[]): GameState;
  searchScripts?: Omit<SearchScriptEffects, "characteristics">;
  destroyBatch?(
    state: GameState,
    sourceId: string,
    ids: readonly string[],
    controller?: Seat,
  ): GameState;
  combTheDesert?: Omit<CombTheDesertEffects, "characteristics">;
  phishing?: Omit<PhishingEffects, "characteristics">;
  protocols?: Omit<ProtocolBindingEffects, "characteristics" | "canTarget">;
  environments?: Omit<EnvironmentEffects, "characteristics">;
  genocide?: Omit<GenocideEffects, "characteristics">;
  /** Shared evaluator supplies current permissions, synergy and fully modified costs. */
  play(
    state: GameState,
    id: string,
    choices: ProgramChoices,
  ): CharacterPlayEvaluation;
  allowReversed(state: GameState, id: string): boolean;
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  canTarget(state: GameState, sourceId: string, targetId: string): boolean;
  counter(state: GameState, actionId: string, sourceId: string): GameState;
  destroy?: DestructionScriptEffects["destroy"];
  removeMainframeCounters?: AntivirusEffects["removeCounters"];
  damage?: Pick<OverloadEffects, "canTargetPlayer" | "damage">;
  runCharacters?: SavageDuststormEffects["run"];
  status?: Omit<CharacterStatusEvaluation, "characteristics" | "canTarget">;
  wonderland?: {
    alice: PinnedDefinition;
    effectiveName(state: GameState, id: string): string | null;
    putCounters: WonderlandSizeEvaluation["putCounters"];
  };
}

/** Version-one specifications are immutable release inputs, not the latest review file.
 * This assembler binds explicit implementations; it never upgrades support or publishes.
 */
export function bindPrograms(
  inputs: readonly PinnedDefinition[],
  engine: EngineManifest,
  rulesVersion: string,
  effects: ProgramBindingEffects,
) {
  const engineVersion = engine.version;
  const known = new Map(
    [
      ...specifications,
      ...environmentSpecifications,
      ...protocolSpecifications,
    ].map((spec) => [spec.cardId, spec]),
  );
  const definitions = new Map<string, ReturnType<typeof versionDefinition>>();
  const kinds = new Map<string, string>();
  const cards = new Set<string>();
  for (const input of inputs) {
    const pinned = versionDefinition(input.definition, engine),
      definition = pinned.definition;
    const spec = known.get(definition.cardId);
    if (
      pinned.version !== input.version ||
      definition.rulesVersion !== rulesVersion
    )
      throw new Error("Program definition pin mismatch");
    if (!spec || definition.support === "unimplemented")
      throw new Error("Program has no executable binding");
    if (cards.has(definition.cardId))
      throw new Error("Duplicate program card binding");
    if (
      !isDeepStrictEqual(
        definition.characteristics,
        characteristicsSchema.parse(spec.characteristics),
      ) ||
      !isDeepStrictEqual(definition.handlers, [
        { id: spec.handlerId, version: spec.handlerVersion, parameters: {} },
      ])
    )
      throw new Error(
        "Program definition does not match its versioned implementation",
      );
    cards.add(definition.cardId);
    definitions.set(pinned.version, pinned);
    kinds.set(pinned.version, spec.kind);
  }
  const source = (state: GameState, id: string) => {
    if (
      state.engineVersion !== engineVersion ||
      state.rulesVersion !== rulesVersion
    )
      throw new Error("Program runtime version mismatch");
    const pin = definitions.get(state.objects[id]?.definitionVersion);
    if (!pin) throw new Error("Program source has no pinned binding");
    return pin;
  };
  const targeting = {
    characteristics: effects.characteristics,
    canTarget: effects.canTarget,
  };
  const counterTargets = (
    state: GameState,
    id: string,
  ): CounterTargetEvaluation => ({
    characteristics: effects.characteristics(structuredClone(state)),
    permittedTargets: new Set(
      state.cache.filter((target) =>
        effects.canTarget(structuredClone(state), id, target),
      ),
    ),
  });
  const status = effects.status ? { ...effects.status, ...targeting } : null;
  const overloads = new Map<string, ReturnType<typeof overload>>();
  const justiceBinding = justice((s, source, player) =>
    effects.phishing!.canTargetPlayer(s, source, player),
  );
  const towerBinding = theTower(
    (s, source, player) => effects.phishing!.canTargetPlayer(s, source, player),
    effects.characteristics,
  );
  const enhanceBinding = enhance((s, source, player) =>
    effects.phishing!.canTargetPlayer(s, source, player),
  );
  const drugs = new Map<string, ReturnType<typeof cyberneticDrug>>();
  let antivirusBinding: ReturnType<typeof antivirus> | undefined;
  const hanged = () =>
    theHangedMan(
      effects.characterDestructionCost!,
      counterTargets,
      effects.counter,
    );
  let judgementBinding: ReturnType<typeof judgement> | undefined;
  let chariotBinding: ReturnType<typeof theChariot> | undefined;
  const chariotSource = (s: GameState, id: string, version?: string) => {
    const pin = source(s, id);
    if (
      kinds.get(pin.version) !== "the-chariot" ||
      (version !== undefined && pin.version !== version)
    )
      throw Error("Chariot source definition mismatch");
  };
  const slotCandidates = (
    s: GameState,
    a: import("./priority").CacheAction,
    slot: number,
  ) => {
    const kind = kinds.get(source(s, a.sourceId).version)!;
    const binding = multipleDepartures.get(kind);
    if (!binding) throw Error("Program slot binding unavailable");
    return binding.slotCandidates(s, a, slot);
  };
  let wheelBinding: ReturnType<typeof wheelOfFortune> | undefined;
  let genocideBinding: ReturnType<typeof genocide> | undefined;
  let propagandaBinding: ReturnType<typeof propaganda> | undefined;
  let foolBinding: ReturnType<typeof theFool> | undefined;
  let phishingBinding: ReturnType<typeof phishing> | undefined;
  let combBinding: ReturnType<typeof combTheDesert> | undefined;
  const destructionTypes: Readonly<Record<string, DestructionTargetType>> = {
    delete: "character",
    "emp-grenade": "ram",
    terminate: "program",
    "death-metal": "character",
    beatdown: "character",
    death: "character",
    "short-circuit": "cyberware",
  };
  let size: ReturnType<typeof bindWonderlandSizeScripts> | null = null;
  if (
    [...kinds.values()].some((kind) => kind === "eat-me" || kind === "drink-me")
  ) {
    if (!effects.wonderland)
      throw new Error("Wonderland reference runtime unavailable");
    if (
      versionDefinition(effects.wonderland.alice.definition, engine).definition
        .rulesVersion !== rulesVersion
    )
      throw new Error("Wonderland reference rules version mismatch");
    size = bindWonderlandSizeScripts(
      effects.wonderland.alice,
      engine,
      effects.wonderland.effectiveName,
      {
        characteristics: effects.characteristics,
        putCounters: effects.wonderland.putCounters,
      },
    );
  }
  const delayedPrograms = new Map<string, TriggerBehavior>();
  const scripts = new Map<string, ScriptBehavior>();
  const multipleDepartures = new Map<
    string,
    ReturnType<typeof multipleDepartureProgram>
  >();
  const departures = new Map<
    string,
    ReturnType<typeof singleDepartureProgram>
  >();
  const searches = new Map<string, ReturnType<typeof searchScript>>();
  const environmentInputs = [...definitions.values()].filter((pin) =>
    environmentSpecifications.some(
      (spec) => spec.cardId === pin.definition.cardId,
    ),
  );
  if (environmentInputs.length && !effects.environments)
    throw new Error("Environment effect runtime unavailable");
  const environments = effects.environments
    ? bindEnvironmentTriggers(environmentInputs, engine, rulesVersion, {
        ...effects.environments,
        characteristics: effects.characteristics,
      })
    : {
        events: new Map<string, EventBehavior>(),
        triggers: new Map<string, TriggerBehavior>(),
        triggerLabels: new Map<string, string>(),
        keywordGrants: () => [],
        canPreventDamage: () => true,
        spiritEntry: () => {
          throw Error("Spirit Realm runtime unavailable");
        },
        topCards: () => {
          throw new Error("Environment top-card runtime unavailable");
        },
      };
  const protocolInputs = [...definitions.values()].filter((pin) =>
    protocolSpecifications.some(
      (spec) => spec.cardId === pin.definition.cardId,
    ),
  );
  if (protocolInputs.length && !effects.protocols)
    throw new Error("Protocol effect runtime unavailable");
  const protocols = effects.protocols
    ? bindProtocols(protocolInputs, engine, rulesVersion, {
        ...effects.protocols,
        ...targeting,
      })
    : null;
  for (const [version, kind] of kinds) {
    if (environments.events.has(version) || protocols?.events.has(version))
      continue;
    let behavior: ScriptBehavior;
    switch (kind) {
      case "the-chariot": {
        if (!effects.redirect)
          throw Error("Chariot ability redirect runtime unavailable");
        chariotBinding = theChariot({
          version,
          ...targeting,
          validateSource: (s, id) => chariotSource(s, id, version),
          redirect: {
            variants: (s, a) => effects.redirect!().variants(s, a),
            validateScriptSource: chariotSource,
          },
          retarget,
          options: retargetOptions,
          objectSlots: (s, id) =>
            programRetargetObjectSlots(s, id, slotCandidates),
          retargetObjects: (s, id, indices) =>
            selectProgramRetargetObjects(
              s,
              id,
              indices,
              slotCandidates,
              retarget,
            ),
        });
        behavior = chariotBinding.behavior;
        break;
      }
      case "wheel-of-fortune": {
        if (!effects.environments?.install)
          throw Error("Wheel of Fortune runtime unavailable");
        wheelBinding = wheelOfFortune(wheelSpec.handlerId, {
          ...effects.environments,
          characteristics: effects.characteristics,
        });
        multipleDepartures.set(kind, wheelBinding);
        behavior = wheelBinding.behavior;
        break;
      }
      case "the-lovers": {
        if (!effects.putCounters || !effects.destroyBatch)
          throw Error("Lovers effect runtime unavailable");
        const binding = theLovers(version, loversSpec.handlerId, {
          ...targeting,
          putCounters: effects.putCounters,
          destroy: effects.destroyBatch,
        });
        multipleDepartures.set(kind, binding);
        delayedPrograms.set(loversSpec.handlerId, binding.triggered);
        behavior = binding.behavior;
        break;
      }
      case "the-moon": {
        if (!status) throw Error("Moon status runtime unavailable");
        const binding = theMoon(status);
        multipleDepartures.set(kind, binding);
        behavior = binding.behavior;
        break;
      }
      case "bailout":
        behavior = bailoutScript;
        break;
      case "the-hanged-man":
        behavior = hanged().behavior;
        break;
      case "judgement": {
        judgementBinding = judgement(version, judgementSpec.handlerId, effects);
        const binding = judgementBinding;
        multipleDepartures.set(kind, {
          ...binding,
          legalTargets: () => [],
          slotCandidates: () => new Set<string>(),
        });
        delayedPrograms.set(judgementSpec.handlerId, binding.triggered);
        behavior = binding.behavior;
        break;
      }
      case "temperance": {
        const binding = temperance(targeting);
        multipleDepartures.set(kind, binding);
        behavior = binding.behavior;
        break;
      }
      case "rush-the-stage": {
        if (!effects.destroyBatch)
          throw Error("Rush the Stage runtime unavailable");
        const binding = rushTheStage(version, rushStageSpec.handlerId, effects);
        multipleDepartures.set(kind, binding);
        delayedPrograms.set(rushStageSpec.handlerId, binding.triggered);
        behavior = binding.behavior;
        break;
      }
      case "hyperclock": {
        if (!effects.protocols?.install || !effects.destroyBatch)
          throw Error("Hyperclock effect runtime unavailable");
        const binding = hyperclock(version, hyperclockSpec.handlerId, effects);
        multipleDepartures.set(kind, binding);
        delayedPrograms.set(hyperclockSpec.handlerId, binding.triggered);
        behavior = binding.behavior;
        break;
      }
      case "deja-vu": {
        const binding = dejaVu();
        multipleDepartures.set(kind, binding);
        behavior = binding.behavior;
        break;
      }
      case "the-magician": {
        const binding = theMagician(targeting);
        multipleDepartures.set(kind, binding);
        behavior = binding.behavior;
        break;
      }
      case "claritex": {
        const binding = claritex(targeting);
        multipleDepartures.set(kind, binding);
        behavior = binding.behavior;
        break;
      }
      case "download-more-ram": {
        const binding = downloadMoreRam(targeting);
        multipleDepartures.set(kind, binding);
        behavior = binding.behavior;
        break;
      }
      case "dust-to-dust":
      case "the-emperor": {
        if (!effects.destroyBatch || !effects.bounceBatch)
          throw Error("Multiple departure runtime unavailable");
        const binding = multipleDepartureProgram(kind, {
          ...targeting,
          destroy: effects.destroyBatch,
          bounce: effects.bounceBatch,
        });
        multipleDepartures.set(kind, binding);
        behavior = binding.behavior;
        break;
      }
      case "mirage":
      case "the-hermit":
      case "trample": {
        if (!effects.movePermanent || !effects.destroy)
          throw Error("Departure program runtime unavailable");
        const binding = singleDepartureProgram(kind, {
          ...targeting,
          move: effects.movePermanent,
          destroy: effects.destroy,
        });
        departures.set(kind, binding);
        behavior = binding.behavior;
        break;
      }
      case "the-star":
      case "the-sun":
      case "the-world": {
        if (!effects.searchScripts)
          throw Error("Search script runtime unavailable");
        const bound = searchScript(kind, {
          ...effects.searchScripts,
          characteristics: effects.characteristics,
        });
        searches.set(kind, bound);
        behavior = bound.behavior;
        break;
      }
      case "solar-flare":
        if (!effects.destroyBatch)
          throw Error("Solar Flare batch runtime unavailable");
        behavior = {
          hasLegalTargets(_state, action) {
            validateUntargetedScript(action);
            return true;
          },
          resolve(state, action) {
            validateUntargetedScript(action);
            const current = effects.characteristics(state);
            const ids = [...state.arena, ...state.environment].filter((id) =>
              ["character", "program"].includes(
                current.get(id)?.cardType ?? "",
              ),
            );
            return effects.destroyBatch!(state, action.sourceId, ids);
          },
        };
        break;
      case "comb-the-desert":
        if (!effects.combTheDesert?.psychosis)
          throw new Error("COMB THE DESERT runtime unavailable");
        combBinding = combTheDesert({
          ...effects.combTheDesert,
          characteristics: effects.characteristics,
        });
        behavior = combBinding.behavior;
        break;
      case "propaganda":
        propagandaBinding = propaganda({
          characteristics: effects.characteristics,
          canTarget: effects.canTarget,
          retarget,
          options: retargetOptions,
        });
        behavior = propagandaBinding.behavior;
        break;
      case "garbage-day":
        behavior = {
          hasLegalTargets: (_s, action) => {
            validateUntargetedScript(action);
            return true;
          },
          resolve: (s, action) => purgeRecycleBins(s, action.sourceId),
        };
        break;
      case "the-fool":
        if (!effects.foolDraw || !effects.phishing)
          throw Error("Fool draw/discard runtime unavailable");
        foolBinding = theFool({
          characteristics: effects.characteristics,
          discard: effects.phishing.discard,
          draw: effects.foolDraw,
        });
        behavior = foolBinding.behavior;
        break;
      case "justice":
        if (!effects.phishing) throw Error("Justice targeting unavailable");
        behavior = justiceBinding.behavior;
        break;
      case "the-tower":
        behavior = towerBinding.behavior;
        break;
      case "enhance":
        if (!effects.phishing) throw Error("Enhance targeting unavailable");
        behavior = enhanceBinding.behavior;
        break;
      case "phishing":
        if (!effects.phishing) throw new Error("PHISHING runtime unavailable");
        phishingBinding = phishing({
          ...effects.phishing,
          characteristics: effects.characteristics,
        });
        behavior = phishingBinding.behavior;
        break;
      case "genocide":
        if (!effects.genocide) throw new Error("GENOCIDE runtime unavailable");
        genocideBinding = genocide({
          ...effects.genocide,
          characteristics: effects.characteristics,
        });
        behavior = genocideBinding.behavior;
        break;
      case "quantum-encryption":
        behavior = quantumEncryption;
        break;
      case "antivirus": {
        if (!effects.destroy || !effects.removeMainframeCounters)
          throw new Error(
            "ANTIVIRUS destruction and counter removal runtime unavailable",
          );
        antivirusBinding = antivirus({
          ...targeting,
          destroy: effects.destroy,
          removeCounters: effects.removeMainframeCounters,
        });
        behavior = antivirusBinding.behavior;
        break;
      }
      case "hackathon":
      case "mad-honey":
        if (!status) throw Error("Faction script status runtime unavailable");
        behavior = factionProgram(kind, status);
        break;
      case "oil-spill":
        if (!effects.putCounters)
          throw Error("Oil Spill counter runtime unavailable");
        behavior = oilSpill({
          characteristics: effects.characteristics,
          putCounters: effects.putCounters,
        });
        break;
      case "stim-pack":
      case "redline":
      case "megaroids": {
        const bound = cyberneticDrug(kind, targeting);
        drugs.set(kind, bound);
        behavior = bound.behavior;
        break;
      }
      case "market-manipulation":
        behavior = marketManipulation({
          characteristics: effects.characteristics,
        });
        break;
      case "savage-duststorm":
        if (!effects.runCharacters)
          throw new Error("External character run runtime unavailable");
        behavior = savageDuststorm({
          characteristics: effects.characteristics,
          run: effects.runCharacters,
        });
        break;
      case "blue-screen-of-death": {
        if (!effects.instability)
          throw Error("Instability runtime unavailable");
        const bound = blueScreenOfDeath(effects.instability);
        overloads.set(kind, bound);
        behavior = bound.behavior;
        break;
      }
      case "static-blast":
      case "overload-mk-i":
      case "overload-mk-ii": {
        if (!effects.damage)
          throw new Error("Program damage runtime unavailable");
        const damageEffects = {
          ...effects.damage,
          ...targeting,
        };
        const bound =
          kind === "static-blast"
            ? staticBlast(damageEffects)
            : overload(kind === "overload-mk-i" ? 2 : 4, damageEffects);
        overloads.set(kind, bound);
        behavior = bound.behavior;
        break;
      }
      case "beatdown":
      case "death":
        if (!effects.destroy) throw Error("Destruction runtime unavailable");
        behavior = destructionFollowup(
          kind,
          { ...targeting, destroy: effects.destroy },
          effects.death,
        );
        break;
      case "delete":
      case "death-metal":
      case "short-circuit":
      case "emp-grenade":
      case "terminate":
        if (!effects.destroy)
          throw new Error("Destruction runtime unavailable");
        behavior = destructionScript(destructionTypes[kind], {
          ...targeting,
          destroy: effects.destroy,
        });
        break;
      case "moon-flower-cactus":
        behavior = moonFlowerCactusScript;
        break;
      case "the-empress":
        behavior = theEmpressScript;
        break;
      case "the-devil":
        behavior = theDevil(targeting);
        break;
      case "strength":
        behavior = strengthScript(targeting);
        break;
      case "eat-me":
        behavior = size!.eat;
        break;
      case "drink-me":
        behavior = size!.drink;
        break;
      case "through-looking-glass":
        if (!effects.putCounters)
          throw Error("INVERT counter runtime unavailable");
        behavior = throughLookingGlass({
          ...targeting,
          putCounters: effects.putCounters,
        });
        break;
      case "time":
      case "binary-blast":
        if (!status) throw new Error("Character status runtime unavailable");
        behavior =
          kind === "time" ? timeScript(status) : binaryBlastScript(status);
        break;
      case "high-priestess":
        behavior = highPriestessScript(counterTargets, effects.counter);
        break;
      case "hierophant":
        behavior = hierophantScript(counterTargets);
        break;
      default:
        throw new Error("Unknown program implementation");
    }
    const captured = behavior;
    scripts.set(version, {
      hasLegalTargets(state, action) {
        if (
          kind !== "comb-the-desert" &&
          action.programChoices.runCharacters !== undefined
        )
          throw new Error("Unexpected program run cost");
        if (source(state, action.sourceId).version !== version)
          throw new Error("Wrong script binding");
        return captured.hasLegalTargets(state, action);
      },
      resolve(state, action, resources) {
        if (
          kind !== "comb-the-desert" &&
          action.programChoices.runCharacters !== undefined
        )
          throw new Error("Unexpected program run cost");
        if (source(state, action.sourceId).version !== version)
          throw new Error("Wrong script binding");
        return captured.resolve(state, action, resources);
      },
    });
  }
  const canReverse = (state: GameState, id: string) => {
    const card = source(state, id).definition.characteristics;
    return (
      card.cardType === "program" &&
      !!card.reversal &&
      effects.allowReversed(structuredClone(state), id)
    );
  };
  function validate(state: GameState, id: string, choices: ProgramChoices) {
    const kind = kinds.get(source(state, id).version)!;
    if (kind === "justice") return justiceBinding.validate(state, id, choices);
    if (kind === "the-tower") return towerBinding.validate(state, id, choices);
    if (kind === "enhance") return enhanceBinding.validate(state, id, choices);
    if (kind === "bailout") return validateBailoutChoices(choices);
    if (kind === "comb-the-desert")
      return combBinding!.validate(state, id, choices);
    if (choices.runCharacters !== undefined)
      throw new Error("Unexpected program run cost");
    if (kind === "the-chariot")
      return chariotBinding!.validate(state, id, choices);
    if (kind === "propaganda")
      return propagandaBinding!.validate(state, id, choices);
    if (kind === "phishing")
      return phishingBinding!.validate(state, id, choices);
    if (protocols?.events.has(source(state, id).version))
      return protocols.validate(state, id, choices);
    if (kind === "antivirus")
      return antivirusBinding!.validate(state, id, choices);
    if (choices.reversed && !canReverse(state, id))
      throw new Error("Reversed play is not permitted");
    const departure = departures.get(kind);
    const multiple = multipleDepartures.get(kind);
    if (multiple) return multiple.validate(state, id, choices);
    if (departure) return departure.validate(state, id, choices);
    const damage = overloads.get(kind);
    if (damage) return damage.validate(state, id, choices);
    const drug = drugs.get(kind);
    if (drug) return drug.validate(state, id, choices);
    if (choices.playerTarget !== undefined)
      throw new Error("Unexpected program player target");
    if (destructionTypes[kind])
      return validateDestructionScriptChoices(
        state,
        id,
        choices,
        destructionTypes[kind],
        targeting,
      );
    if (kind === "the-hanged-man") return hanged().validate(state, id, choices);
    if (kind === "high-priestess" || kind === "hierophant")
      return validateCounterProgramChoices(
        state,
        id,
        kind,
        choices,
        counterTargets(state, id),
        canReverse(state, id),
      );
    if (kind === "strength" || kind === "the-devil")
      return validateStrengthChoices(state, id, choices, targeting);
    if (
      kind === "time" ||
      kind === "binary-blast" ||
      kind === "through-looking-glass"
    )
      return validateCharacterStatusChoices(state, id, choices, status!);
    if (kind === "eat-me" || kind === "drink-me")
      return validateWonderlandSizeChoices(choices);
    if (
      choices.targets.length ||
      choices.modes.length ||
      choices.x !== null ||
      choices.mainframeTarget
    )
      throw new Error("Invalid untargeted program choices");
  }
  function retargetOptions(state: GameState, actionId: string) {
    const action = state.priorityWindow?.stack.find((a) => a.id === actionId);
    if (!action) throw Error("Retargeted program unavailable");
    const kind = kinds.get(source(state, action.sourceId).version)!;
    return singleTargetRetargetOptions(
      state,
      actionId,
      retarget,
      multipleDepartures.has(kind) ? slotCandidates : undefined,
    );
  }
  function retarget(
    state: GameState,
    actionId: string,
    selection: ProgramRetargetSelection,
  ) {
    const action = state.priorityWindow?.stack.find(
      (pending) => pending.id === actionId,
    );
    if (!action) throw new Error("Retargeted program unavailable");
    const pin = source(state, action.sourceId),
      kind = kinds.get(pin.version)!;
    const isProtocol = protocols?.events.has(pin.version) ?? false;
    const targetedScripts = new Set([
      "the-hanged-man",
      "the-moon",
      "the-chariot",
      "the-lovers",
      "rush-the-stage",
      "the-magician",
      "temperance",
      "claritex",
      "download-more-ram",
      "mirage",
      "dust-to-dust",
      "the-emperor",
      "the-hermit",
      "trample",
      "death-metal",
      "beatdown",
      "death",
      "short-circuit",
      "propaganda",
      "strength",
      "the-devil",
      "time",
      "through-looking-glass",
      "binary-blast",
      "delete",
      "emp-grenade",
      "terminate",
      "high-priestess",
      "hierophant",
      "static-blast",
      "blue-screen-of-death",
      "overload-mk-i",
      "overload-mk-ii",
      "stim-pack",
      "redline",
      "megaroids",
      "antivirus",
      "justice",
      "enhance",
      "the-tower",
      "phishing",
    ]);
    if (!isProtocol && !targetedScripts.has(kind))
      throw new Error("Program target-change binding unavailable");
    return retargetProgram(state, actionId, selection, {
      characteristics: effects.characteristics,
      validateStructure(_before, after) {
        const choices = after.programChoices!;
        if (kind === "the-chariot") {
          chariotBinding!.shape(choices);
          return;
        }
        if (choices.cacheActionId !== undefined)
          throw Error("Program cannot target an ability");
        const multiple = multipleDepartures.get(kind);
        if (multiple) {
          multiple.shape(choices);
          return;
        }
        if (
          choices.targets.length +
            Number(choices.mainframeTarget !== undefined) +
            Number(choices.playerTarget !== undefined) !==
          1
        )
          throw new Error("Invalid retained program target count");
        if (
          isProtocol
            ? !choices.mainframeTarget
            : choices.mainframeTarget !== undefined
        )
          throw new Error("Invalid retained program target shape");
        if (
          choices.playerTarget !== undefined &&
          kind !== "justice" &&
          kind !== "enhance" &&
          kind !== "the-tower" &&
          kind !== "phishing" &&
          kind !== "static-blast" &&
          kind !== "blue-screen-of-death" &&
          kind !== "overload-mk-i" &&
          kind !== "overload-mk-ii"
        )
          throw new Error("Program cannot target a player");
      },
      legalTargets(snapshot, pending) {
        const multiple = multipleDepartures.get(kind);
        if (multiple) return multiple.legalTargets(snapshot, pending);
        if (isProtocol) {
          const target = pending.programChoices!.mainframeTarget!;
          const evaluated = protocols!.attachment(
            snapshot,
            pending.sourceId,
            pending.controller,
          );
          return [
            evaluated.permittedMainframes.has(target) &&
              evaluated.characteristics.get(target)?.cardType === "mainframe" &&
              snapshot.players.some((player) =>
                player.zones.mainframe.includes(target),
              ) &&
              isCurrentActionTarget(snapshot, pending, target),
          ];
        }
        return [
          scripts.get(pin.version)!.hasLegalTargets(snapshot, {
            ...pending,
            programChoices: pending.programChoices!,
          }),
        ];
      },
    });
  }

  return {
    tower(s: GameState) {
      const d = validateTower(s);
      if (kinds.get(source(s, d.sourceId).version) !== "the-tower")
        throw Error("Wrong Tower binding");
      return effects.characteristics(s);
    },
    enhance(s: GameState) {
      const d = validateEnhance(s);
      if (kinds.get(source(s, d.sourceId).version) !== "enhance")
        throw Error("Wrong Enhance binding");
      return effects.characteristics(s);
    },
    ruleTriggers: (s: GameState, event: import("./rule-events").RuleEvent) =>
      judgementBinding?.discover(s, event) ?? [],
    validateChariotSource: chariotSource,
    spiritEntry: environments.spiritEntry,
    retarget,
    events: new Map([...environments.events, ...(protocols?.events ?? [])]),
    triggers: new Map([
      ...delayedPrograms,
      ...environments.triggers,
      ...(protocols?.triggers ?? []),
    ]),
    triggerLabels: new Map([
      ...[...delayedPrograms.keys()].map(
        (h) =>
          [
            h,
            h === judgementSpec.handlerId
              ? "Judgement: destroy the selected target."
              : h === rushStageSpec.handlerId
                ? "Rush the Stage: destroy the selected character."
                : h === hyperclockSpec.handlerId
                  ? "Hyperclock: destroy 3 RAM you control."
                  : "The Lovers: destroy the other linked character.",
          ] as const,
      ),
      ...environments.triggerLabels,
      ...(protocols?.triggerLabels ?? []),
    ]),
    protocolEntry(state: GameState) {
      if (!protocols) throw new Error("Protocol entry runtime unavailable");
      return protocols.entry(state);
    },
    ramReturnsRefreshed(state: GameState, departure: PersistentDeparture) {
      return protocols?.ramReturnsRefreshed(state, departure) ?? false;
    },
    environmentKeywordGrants: environments.keywordGrants,
    canPreventDamage: environments.canPreventDamage,
    topCards(state: GameState) {
      const action = state.priorityWindow?.resolving;
      if (action?.kind === "card") {
        const kind = kinds.get(source(state, action.sourceId).version)!;
        const search = searches.get(kind);
        if (!search) throw Error("Unbound top-card script");
        return search.topCards(state);
      }
      return environments.topCards(state);
    },
    deckSearch(state: GameState) {
      const action = state.priorityWindow?.resolving;
      if (action?.kind !== "card") throw Error("No search script is resolving");
      const search = searches.get(
        kinds.get(source(state, action.sourceId).version)!,
      );
      if (!search) throw Error("Unbound search script");
      return search.deckSearch(state);
    },
    ramCostChoice(state: GameState) {
      const decision = validateRamCostChoiceContinuation(state);
      if (
        kinds.get(source(state, decision.sourceId).version) !==
          "wheel-of-fortune" ||
        !wheelBinding
      )
        throw Error("RAM cost choice program unavailable");
      return wheelBinding.choice(state);
    },
    factionChoice(state: GameState): FactionChoiceEvaluation {
      const decision = validateFactionChoiceContinuation(state);
      if (
        kinds.get(source(state, decision.sourceId).version) !== "genocide" ||
        !genocideBinding
      )
        throw new Error("Faction choice program unavailable");
      return genocideBinding.choice(state);
    },
    retargetChoice(state: GameState): RetargetChoiceEvaluation {
      const saved = validateRetargetChoiceContinuation(state);
      if (
        kinds.get(source(state, saved.sourceId).version) === "the-chariot" &&
        chariotBinding
      )
        return chariotBinding.choice(state);
      if (
        kinds.get(source(state, saved.sourceId).version) !== "propaganda" ||
        !propagandaBinding
      )
        throw new Error("PROPAGANDA continuation unavailable");
      return propagandaBinding.choice(state);
    },
    handChoice(state: GameState): HandChoiceEvaluation {
      const decision = validateHandChoiceContinuation(state);
      if (
        kinds.get(source(state, decision.sourceId).version) === "the-fool" &&
        foolBinding
      )
        return foolBinding.choice(state);
      if (
        kinds.get(source(state, decision.sourceId).version) !== "phishing" ||
        !phishingBinding
      )
        throw new Error("Hand choice program unavailable");
      return phishingBinding.choice(state);
    },
    scripts: scripts as ReadonlyMap<string, ScriptBehavior>,
    program(
      state: GameState,
      id: string,
      choices: ProgramChoices,
    ): ProgramPlayEvaluation {
      const pinned = source(state, id);
      const play = effects.play(
        structuredClone(state),
        id,
        structuredClone(choices),
      );
      if (
        !isDeepStrictEqual(
          play.definitions.get(pinned.version),
          pinned.definition.characteristics,
        )
      )
        throw new Error("Program play definition mismatch");
      const current = effects.characteristics(structuredClone(state)).get(id);
      if (current?.cardType !== "program")
        throw new Error("Program announcement characteristics unavailable");
      return {
        ...play,
        ...(kinds.get(pinned.version) === "the-hanged-man"
          ? { additionalCost: hanged().cost(id) }
          : {}),
        ...(kinds.get(pinned.version) === "the-chariot"
          ? { allowAbilityTarget: true }
          : {}),
        ...(kinds.get(pinned.version) === "rush-the-stage"
          ? { healthCost: { MF: choices.x ?? 0, BF: choices.x ?? 0 } }
          : {}),
        ...(kinds.get(pinned.version) === "hyperclock"
          ? { healthCost: { MF: 3, BF: 3 } }
          : {}),
        ...(kinds.get(pinned.version) === "deja-vu"
          ? { healthCost: { MF: 3, BF: 3 }, purgeOnResolution: true }
          : {}),
        ...(kinds.get(pinned.version) === "comb-the-desert"
          ? { runCost: combBinding!.runCost(choices) }
          : {}),
        announcement: {
          factions: [...current.factions],
          tags: [...current.tags],
        },
        allowReversed: canReverse(state, id),
        faceDown: false,
        ...(protocols?.events.has(pinned.version)
          ? { protocol: protocols.attachment(state, id) }
          : {}),
        validateChoices: validate,
      };
    },
    programVariants(state: GameState, id: string): ProgramPlayVariant[] {
      const kind = kinds.get(source(state, id).version)!;
      if (protocols?.events.has(source(state, id).version))
        return protocols.variants(state, id);
      if (kind === "antivirus") return antivirusBinding!.variants(state, id);
      if (kind === "the-hanged-man") return hanged().variants(state, id);
      const reverse = canReverse(state, id);
      const departure = departures.get(kind);
      const multiple = multipleDepartures.get(kind);
      if (multiple) return multiple.variants(state, id, reverse);
      if (departure) return departure.variants(state, id, reverse);
      const damage = overloads.get(kind);
      if (damage) return damage.variants(state, id);
      if (kind === "comb-the-desert") return combBinding!.variants(state, id);
      if (kind === "the-chariot")
        return chariotBinding!.variants(state, id, reverse);
      if (kind === "propaganda") return propagandaBinding!.variants(state, id);
      if (kind === "justice") return justiceBinding.variants(state, id);
      if (kind === "the-tower") return towerBinding.variants(state, id);
      if (kind === "enhance") return enhanceBinding.variants(state, id);
      if (kind === "phishing") return phishingBinding!.variants(state, id);
      const drug = drugs.get(kind);
      if (drug) return drug.variants(state, id);
      if (kind === "high-priestess" || kind === "hierophant")
        return counterProgramVariants(
          state,
          id,
          kind,
          counterTargets(state, id),
          reverse,
        );
      const candidates = destructionTypes[kind]
        ? destructionScriptTargets(state, id, destructionTypes[kind], targeting)
        : kind === "strength" || kind === "the-devil"
          ? strengthTargets(state, id, targeting)
          : kind === "time" ||
              kind === "binary-blast" ||
              kind === "through-looking-glass"
            ? characterStatusTargets(state, id, status!)
            : null;
      return (reverse ? [false, true] : [false]).map((reversed) => ({
        key: reversed ? "reversed" : "normal",
        label: reversed ? "Reversed" : "Normal",
        modes: [],
        reversed,
        x: null,
        mainframes: null,
        targets: candidates
          ? [
              {
                label: `Target ${destructionTypes[kind] ?? "character"}`,
                minimum: 1,
                maximum: 1,
                candidates,
              },
            ]
          : [],
      }));
    },
  };
}
