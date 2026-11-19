import type { GameState } from "./game-state";
import type { CacheAction } from "./priority";
import type { AbilityChoices } from "./activate-ability";
import type { ActivatedBehavior } from "./resolve-ability";
import type { ActivationVariant } from "./activation-option";
import type { CharacterCounterEffects } from "./character-counter-abilities";
import { isCurrentCardSource } from "./cache-source";
import { actionObjectTargets, isCurrentActionTarget } from "./action-targets";

export interface YesManEffects extends CharacterCounterEffects {
  /** Semantic target query from the program runtime, including supported action-target forms. */
  targetsCacheAction(state: GameState, program: CacheAction): boolean;
  counter(state: GameState, actionId: string, sourceId: string): GameState;
}

/** Current object-target representation for card actions. Ability-action targets must
 * be supplied by their own target interpreter when those program forms are enabled. */
export function targetsPendingCardAction(
  state: GameState,
  program: CacheAction,
): boolean {
  return actionObjectTargets(program).some(
    (id) =>
      isCurrentActionTarget(state, program, id) &&
      (state.priorityWindow?.stack ?? []).some(
        (action) =>
          action.id !== program.id &&
          action.kind === "card" &&
          action.sourceId === id &&
          isCurrentCardSource(state, action),
      ),
  );
}

export function yesMan(effects: YesManEffects) {
  const target = (choices: AbilityChoices) => {
    if (
      choices.targets.length !== 1 ||
      choices.modes.length ||
      choices.x !== null ||
      choices.playerTarget !== undefined
    )
      throw new Error("Invalid Yes choices");
    return choices.targets[0];
  };
  const candidates = (state: GameState, sourceId: string) => {
    const current = effects.characteristics(structuredClone(state));
    return (state.priorityWindow?.stack ?? []).flatMap((action) => {
      if (action.kind !== "card" || !isCurrentCardSource(state, action))
        return [];
      const id = action.sourceId;
      return current.get(id)?.cardType === "program" &&
        effects.canTarget(structuredClone(state), sourceId, id) &&
        effects.targetsCacheAction(
          structuredClone(state),
          structuredClone(action),
        )
        ? [id]
        : [];
    });
  };
  const behavior: ActivatedBehavior = {
    hasLegalTargets(state, action) {
      const id = target(action.activatedAbility.choices);
      return (
        isCurrentActionTarget(state, action, id) &&
        candidates(state, action.sourceId).includes(id)
      );
    },
    resolve(state, action) {
      const id = target(action.activatedAbility.choices);
      const program = state.priorityWindow!.stack.find(
        (item) => item.kind === "card" && item.sourceId === id,
      )!;
      const next = effects.counter(state, program.id, action.sourceId);
      if (next.outcome) return next;
      if (next.pendingDecision)
        throw new Error("Yes counter replacement requires a continuation");
      const source = next.objects[action.sourceId],
        captured = action.activatedAbility.source;
      const inPlay = [
        ...next.arena,
        ...next.environment,
        ...next.players.flatMap((player) => [
          ...player.zones.mainframe,
          ...player.zones.ramBank,
        ]),
      ];
      return source?.incarnation === captured.incarnation &&
        inPlay.includes(source.id)
        ? effects.putCounters(next, action.sourceId, [
            { instanceId: source.id, counter: "-1/-1", amount: 1 },
          ])
        : next;
    },
  };
  return {
    behavior,
    validate(state: GameState, sourceId: string, choices: AbilityChoices) {
      if (!candidates(state, sourceId).includes(target(choices)))
        throw new Error("Illegal Yes target");
    },
    variant(state: GameState, sourceId: string): ActivationVariant {
      return {
        key: "normal",
        label: "Normal",
        modes: [],
        x: null,
        targets: [
          {
            label: "Target program targeting an action on the cache",
            minimum: 1,
            maximum: 1,
            candidates: candidates(state, sourceId),
          },
        ],
      };
    },
  };
}
