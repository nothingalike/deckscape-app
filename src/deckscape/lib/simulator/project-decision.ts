import { duckyOptions, canPlayDucky } from "./rubber-ducky";
import { validateEclipse, eclipseCandidates } from "./eclipse-dropship";
import { validateBailoutDecision, bailoutRam } from "./bailout";
import { validateRamCostChoiceContinuation } from "./ram-cost-choice";
import { evaluateSpiritEntry } from "./spirit-entry-choice";
import { validateTriggerChoiceContinuation } from "./trigger-choice";
import { validateCopyAbilityDecision } from "./script-kiddie";
import type { GameState } from "./game-state";
import { validateShredDecision } from "./metal-head";
import {
  validateRedirectDecision,
  pendingActivated,
  redirectVariants,
} from "./redirect-ability";
import { isDeepStrictEqual } from "node:util";
import { validateRetargetChoiceContinuation } from "./retarget-choice";
import { validateTriggerTargetContinuation } from "./trigger-target";
import { validateOptionalTriggerContinuation } from "./optional-trigger";
import { validateFactionChoiceContinuation } from "./faction-choice";
import { validateHandChoiceContinuation } from "./hand-choice";
import type { PlayerGameView } from "./board-view";
import { boardZones } from "./board-view";
import type { GameCommandRuntime } from "./commands";
import type { DecisionPrompt } from "./decision-prompt";
import { projectCardInspection } from "./card-inspection";
import type { BattlefieldPresentationRuntime } from "./battlefield-presentation";

/** Call only with the participant view of this same authorized snapshot. */
export function projectSavedDecision(
  state: GameState,
  view: PlayerGameView,
  commands: Pick<
    GameCommandRuntime,
    | "ducky"
    | "tower"
    | "eclipse"
    | "enhance"
    | "wonderland"
    | "bailout"
    | "counterPayment"
    | "deckSearch"
    | "ramCostChoice"
    | "spiritEntry"
    | "factionChoice"
    | "handChoice"
    | "optionalTrigger"
    | "triggerChoice"
    | "triggerTarget"
    | "retargetChoice"
    | "redirectChoice"
    | "shredChoice"
    | "topCards"
  >,
  presentation?: Pick<BattlefieldPresentationRuntime, "artworkUrl">,
): DecisionPrompt | null {
  const saved = state.pendingDecision;
  if (state.outcome || !saved || saved.player !== view.seat) return null;
  if (
    view.revision !== state.revision ||
    view.pendingDecision?.decisionId !== saved.id
  )
    throw new Error("Decision projection does not match its snapshot");
  const common = { decisionId: saved.id, revision: state.revision };
  if (saved.type === "ducky-play") {
    if (!commands.ducky) throw Error("Ducky projection unavailable");
    const e = commands.ducky();
    return {
      ...common,
      type: "ducky-play",
      cardId: saved.cardId,
      options: duckyOptions(state, e),
      canPlay: canPlayDucky(state, e),
    };
  }
  if (saved.type === "tower") {
    if (!commands.tower) throw Error("Tower projection unavailable");
    const cards = commands.tower(state);
    return saved.piles
      ? {
          ...common,
          type: "tower",
          stage: "choose",
          counts: [saved.piles[0].length, saved.piles[1].length],
        }
      : {
          ...common,
          type: "tower",
          stage: "partition",
          cards: saved.inspected.map((id) => ({
            id,
            ...projectCardInspection(
              cards.get(id),
              presentation?.artworkUrl(state.objects[id].definitionVersion),
            ),
          })),
        };
  }
  if (saved.type === "eclipse-entry") {
    validateEclipse(state);
    if (!commands.eclipse) throw Error("Eclipse projection unavailable");
    const e = commands.eclipse(),
      cards = e.characteristics(state);
    return {
      ...common,
      type: "eclipse-entry",
      cards: eclipseCandidates(state, saved.player, e).map((id) => ({
        id,
        ...projectCardInspection(
          cards.get(id),
          presentation?.artworkUrl(state.objects[id].definitionVersion),
        ),
      })),
    };
  }
  if (saved.type === "deck-order") {
    if (!commands.enhance) throw Error("Enhance projection unavailable");
    const cards = commands.enhance(state);
    return {
      ...common,
      type: "deck-order",
      targetPlayer: saved.targetPlayer,
      cards: saved.inspected.map((id) => ({
        id,
        ...projectCardInspection(
          cards.get(id),
          presentation?.artworkUrl(state.objects[id].definitionVersion),
        ),
      })),
    };
  }
  if (saved.type === "wonderland") {
    if (!commands.wonderland) throw Error("Wonderland runtime unavailable");
    return {
      type: "wonderland",
      ...common,
      sourceId: saved.sourceId,
      stage: saved.stage,
      roll: saved.roll,
      remaining: saved.remaining,
      candidates: [...saved.candidates],
      ...(saved.cardId
        ? {
            cardId: saved.cardId,
            play: commands.wonderland(state).options(state),
          }
        : {}),
    };
  }
  if (saved.type === "bailout") {
    validateBailoutDecision(state);
    if (
      !commands.bailout ||
      !isDeepStrictEqual(
        saved.ram,
        bailoutRam(
          state,
          saved.player,
          commands.bailout(state).characteristics(state),
        ),
      )
    )
      throw Error("Invalid Bailout choices");
    return {
      ...common,
      type: saved.type,
      sourceId: saved.sourceId,
      count: saved.count,
      ram: [...saved.ram],
    };
  }
  if (saved.type === "spirit-entry") {
    if (!commands.spiritEntry)
      throw Error("SPIRIT entry evaluator unavailable");
    const effects = commands.spiritEntry(state),
      d = evaluateSpiritEntry(state, effects);
    const group = d.groups[d.selected.length],
      current = effects.characteristics(state);
    return {
      ...common,
      type: d.type,
      sourceId: d.sourceId,
      name: group.name,
      groupIndex: d.selected.length,
      totalGroups: d.groups.length,
      // 101.4b: later players know earlier confirmed choices. Recycle bins are public.
      confirmed: d.selected.map((id, i) => ({
        id,
        player: d.groups[i].player,
        name: current.get(id)!.name,
      })),
      cards: group.candidates.map((id) => ({
        id,
        eligible: true,
        ...projectCardInspection(
          current.get(id),
          presentation?.artworkUrl(state.objects[id].definitionVersion),
        ),
      })),
    };
  }
  if (saved.type === "copy-ability") {
    validateCopyAbilityDecision(state);
    return {
      ...common,
      type: saved.type,
      sourceId: saved.sourceId,
      targetId: saved.targetId,
      options: saved.options.map((o, index) => ({ index, label: o.label })),
    };
  }
  if (saved.type === "damage-prevention")
    return {
      ...common,
      type: saved.type,
      sourceId: saved.sourceId,
      options: [...saved.options],
    };
  if (saved.type === "counter-replacement")
    return {
      ...common,
      type: saved.type,
      sourceId: saved.sourceId,
      ...(saved.options ? { options: saved.options } : {}),
    };
  if (saved.type === "redirect-ability") {
    validateRedirectDecision(state);
    if (!commands.redirectChoice) throw Error("Redirect evaluator unavailable");
    const target = pendingActivated(state, saved.targetActionId)!;
    const choices = target.activatedAbility.choices;
    return {
      ...common,
      type: saved.type,
      sourceId: saved.sourceId,
      targetActionId: saved.targetActionId,
      targetAbility: `${target.activatedAbility.characteristics.name} — ${target.activatedAbility.abilityId}`,
      targetCount:
        choices.targets.length +
        Number(choices.playerTarget !== undefined) +
        Number(choices.cacheActionId !== undefined),
      originalTargets: [...choices.targets],
      ...(choices.playerTarget === undefined
        ? {}
        : { originalPlayer: choices.playerTarget }),
      variants: redirectVariants(
        state,
        target,
        commands.redirectChoice(state),
      ).map((v) => ({
        ...v,
        ...(v.playerTargets
          ? {
              playerTargets: v.playerTargets.map((p) => ({
                ...p,
                label:
                  p.player === view.seat
                    ? ("You" as const)
                    : ("Opponent" as const),
              })),
            }
          : {}),
      })),
    };
  }
  if (saved.type === "shred-transfer") {
    validateShredDecision(state);
    if (
      !commands.shredChoice ||
      !isDeepStrictEqual(
        commands.shredChoice(state).options(state),
        saved.options,
      )
    )
      throw new Error("SHRED options changed");
    return {
      ...common,
      type: saved.type,
      sourceId: saved.sourceId,
      gearId: saved.gearId,
      ...(saved.mandatory ? { mandatory: true as const } : {}),
      options: saved.options.map((links, index) => ({ index, links })),
    };
  }
  if (saved.type === "retarget-program") {
    validateRetargetChoiceContinuation(state);
    if (!commands.retargetChoice)
      throw new Error("Retarget evaluator unavailable");
    const evaluated = commands.retargetChoice(structuredClone(state));
    if (saved.objectSlots) {
      if (
        !evaluated.objectSlots ||
        !isDeepStrictEqual(
          evaluated.objectSlots(structuredClone(state), saved.targetActionId),
          saved.objectSlots,
        )
      )
        throw Error("Retarget slots changed");
      const visible = new Set(
        boardZones(view).flatMap((zone) =>
          zone.cards.filter((c) => !c.faceDown).map((c) => c.instanceId),
        ),
      );
      return {
        ...common,
        type: saved.type,
        sourceId: saved.sourceId,
        targetActionId: saved.targetActionId,
        targetProgramId: state.priorityWindow!.stack.find(
          (a) => a.id === saved.targetActionId,
        )!.sourceId,
        options: [],
        objectSlots: saved.objectSlots.map((slot) => ({
          options: slot.map((o, index) => {
            const current = state.objects[o.id];
            const show =
              visible.has(o.id) && current?.incarnation === o.incarnation;
            const card = show ? evaluated.characteristics.get(o.id) : undefined;
            if (index > 0 && !card)
              throw Error("New retarget inspection unavailable");
            return {
              index,
              label: index === 0 ? "Keep original target" : card!.name,
              ...(show ? { targetId: o.id } : {}),
              ...(card
                ? {
                    card: projectCardInspection(
                      card,
                      presentation?.artworkUrl(current.definitionVersion),
                    ),
                  }
                : {}),
            };
          }),
        })),
      };
    }
    if (
      !isDeepStrictEqual(
        evaluated.options(structuredClone(state), saved.targetActionId),
        saved.options,
      )
    )
      throw new Error("Retarget options changed");
    return {
      ...common,
      type: saved.type,
      sourceId: saved.sourceId,
      targetActionId: saved.targetActionId,
      targetProgramId: state.priorityWindow!.stack.find(
        (a) => a.id === saved.targetActionId,
      )!.sourceId,
      ...(saved.options.some((o) => o.choices.targets.length > 1)
        ? {
            originalTargets: state.priorityWindow!.stack.find(
              (a) => a.id === saved.targetActionId,
            )!.programChoices!.targets,
          }
        : {}),
      options: saved.options.map((option, index) => {
        const choices = option.choices;
        if (choices.cacheActionId !== undefined) {
          const ability = state.priorityWindow!.stack.find(
            (a) => a.id === choices.cacheActionId && a.kind === "activated",
          );
          if (!ability?.activatedAbility)
            throw Error("Retarget ability presentation unavailable");
          return {
            index,
            label: `${ability.activatedAbility.characteristics.name} — ${ability.activatedAbility.abilityId} (${ability.controller === view.seat ? "You" : "Opponent"})`,
          };
        }
        if (choices.targets.length > 1)
          return {
            index,
            targetIds: [...choices.targets],
            label: choices.targets
              .map(
                (id, i) =>
                  `${i + 1}. ${evaluated.characteristics.get(id)?.name ?? "Previous target"} (${state.objects[id]?.controller === view.seat ? "You" : "Opponent"})`,
              )
              .join("; "),
          };
        if (choices.playerTarget !== undefined)
          return {
            index,
            player: choices.playerTarget,
            label: choices.playerTarget === view.seat ? "You" : "Opponent",
          };
        const targetId = choices.mainframeTarget ?? choices.targets[0];
        const card = evaluated.characteristics.get(targetId);
        if (
          !card ||
          !state.objects[targetId] ||
          state.objects[targetId].faceDown
        )
          throw new Error("Retarget presentation unavailable");
        return {
          index,
          targetId,
          label: `${card.name} (${state.objects[targetId].controller === view.seat ? "You" : "Opponent"})`,
        };
      }),
    };
  }
  if (saved.type === "hand-choice") {
    validateHandChoiceContinuation(state);
    if (!commands.handChoice)
      throw new Error("Hand choice evaluator unavailable");
    const evaluated = commands.handChoice(structuredClone(state));
    return {
      ...common,
      type: saved.type,
      targetPlayer: saved.targetPlayer,
      allowFail: false,
      cards: saved.inspected.map((id) => {
        const card = evaluated.characteristics.get(id);
        if (!card) throw new Error("Hand card characteristics unavailable");
        return {
          id,
          eligible: true,
          ...projectCardInspection(
            card,
            presentation?.artworkUrl(state.objects[id].definitionVersion),
          ),
        };
      }),
    };
  }
  if (saved.type === "ram-cost-choice") {
    validateRamCostChoiceContinuation(state);
    if (!commands.ramCostChoice)
      throw Error("RAM cost choice evaluator unavailable");
    commands.ramCostChoice(structuredClone(state));
    return { ...common, type: saved.type };
  }
  if (saved.type === "faction-choice") {
    validateFactionChoiceContinuation(state);
    if (!commands.factionChoice)
      throw new Error("Faction choice evaluator unavailable");
    const evaluated = commands.factionChoice(structuredClone(state));
    if (
      saved.factions.length !== evaluated.factions.length ||
      saved.factions.some(
        (faction, index) => faction !== evaluated.factions[index],
      )
    )
      throw new Error("Faction choices changed");
    return { ...common, type: saved.type, factions: [...saved.factions] };
  }
  if (saved.type === "trigger-choice") {
    validateTriggerChoiceContinuation(state);
    if (
      !commands.triggerChoice ||
      !isDeepStrictEqual(commands.triggerChoice(structuredClone(state)), {
        ...(saved.cardCount === undefined
          ? {}
          : { cardCount: saved.cardCount }),
        prompt: saved.prompt,
        options: saved.options,
      })
    )
      throw Error("Trigger choice projection unavailable");
    return {
      ...common,
      type: saved.type,
      prompt: saved.prompt,
      options: structuredClone(saved.options),
      ...(saved.cardCount === undefined ? {} : { cardCount: saved.cardCount }),
    };
  }
  if (saved.type === "optional-trigger") {
    validateOptionalTriggerContinuation(state);
    if (
      !commands.optionalTrigger ||
      commands.optionalTrigger(structuredClone(state)) !== saved.prompt
    )
      throw new Error("Optional trigger projection unavailable");
    return { ...common, type: saved.type, prompt: saved.prompt };
  }
  if (saved.type === "top-cards") {
    if (!commands.topCards) throw new Error("Top-card evaluator unavailable");
    const evaluation = commands.topCards(structuredClone(state));
    return {
      ...common,
      type: saved.type,
      kind: saved.kind,
      allowFail: saved.kind !== "divine" && saved.kind !== "tea-party",
      cards: saved.inspected.map((id) => {
        const card = evaluation.characteristics.get(id);
        if (!card) throw new Error("Top-card characteristics unavailable");
        return {
          id,
          ...projectCardInspection(
            card,
            presentation?.artworkUrl(state.objects[id].definitionVersion),
          ),
          eligible: saved.candidates.includes(id),
        };
      }),
    };
  }
  if (saved.type === "trigger-target") {
    validateTriggerTargetContinuation(state);
    const recycled = saved.candidates.filter(
      (t) => t.kind === "recycle-character",
    );
    const evaluated = recycled.length
      ? commands.triggerTarget?.(structuredClone(state))
      : undefined;
    if (recycled.length && !evaluated?.characteristics)
      throw Error("Recycle target inspection unavailable");
    return {
      ...common,
      type: saved.type,
      sourceId: saved.sourceId,
      ...(recycled.length
        ? {
            cards: recycled.map((t) => {
              const card = evaluated!.characteristics!.get(t.id);
              if (!card) throw Error("Missing recycled character");
              return {
                id: t.id,
                eligible: true,
                ...projectCardInspection(
                  card,
                  presentation?.artworkUrl(
                    state.objects[t.id].definitionVersion,
                  ),
                ),
              };
            }),
          }
        : {}),
      options: saved.candidates.map((target, index) =>
        target.kind === "character" || target.kind === "recycle-character"
          ? { index, characterId: target.id }
          : target.kind === "program"
            ? { index, programId: target.id }
            : target.kind === "ram"
              ? { index, ramId: target.id }
              : {
                  index,
                  seat: target.player,
                  player: target.player === view.seat ? "you" : "opponent",
                },
      ),
    };
  }
  if (saved.type === "deck-search") {
    if (!commands.deckSearch)
      throw new Error("Deck search evaluator unavailable");
    const evaluation = commands.deckSearch(structuredClone(state));
    return {
      ...common,
      type: saved.type,
      allowFail: saved.allowFail,
      cards: saved.inspected.map((id) => {
        const card = evaluation.characteristics.get(id);
        if (!card) throw new Error("Search card characteristics unavailable");
        return {
          id,
          ...projectCardInspection(
            card,
            presentation?.artworkUrl(state.objects[id].definitionVersion),
          ),
          eligible: saved.candidates.includes(id),
        };
      }),
    };
  }
  if (saved.type === "counter-payment") {
    if (!commands.counterPayment)
      throw new Error("Counter payment evaluator unavailable");
    const evaluation = commands.counterPayment(structuredClone(state));
    return {
      ...common,
      type: saved.type,
      ramCost: saved.ramCost,
      ram: state.players[saved.player].zones.ramBank.filter((id) => {
        const object = state.objects[id];
        return (
          object.controller === saved.player &&
          !object.running &&
          !object.attachments.length &&
          evaluation.definitions.get(object.definitionVersion)?.cardType ===
            "ram"
        );
      }),
    };
  }
  if (saved.type === "tether-follow") {
    const options = view.pendingDecision?.options;
    if (!options) throw new Error("Tether choices unavailable");
    return { ...common, type: saved.type, options: structuredClone(options) };
  }
  return {
    ...common,
    type: saved.type,
    hosts: structuredClone(saved.hosts),
    ram: saved.available.map((id) => ({
      id,
      running: state.objects[id].running,
    })),
  };
}
