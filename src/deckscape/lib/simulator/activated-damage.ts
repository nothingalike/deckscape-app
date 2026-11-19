import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";
import type { AbilityChoices } from "./activate-ability";
import type { ActivatedBehavior, ActivatedAction } from "./resolve-ability";
import type { CombatDamagePacket } from "./combat-damage";
import type { ActivationVariant } from "./activation-option";
import { isCurrentActionTarget } from "./action-targets";
import { evaluatePlayerSynergy } from "./synergy";

export interface ActivatedDamageSpecification {
  recipient: "character" | "player";
  minimum: number;
  maximum: number;
  channel: "BF" | "MF";
  amount: number;
  synergy?: { faction: string; multiplier: number };
  /** Count programs attached to the targeted player's mainframe at resolution. */
  mainframePrograms?: boolean;
  requiresCounter?: string;
}
export interface ActivatedDamageEffects {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  canTarget(
    state: GameState,
    sourceId: string,
    targetId: string,
    source: CardCharacteristics,
  ): boolean;
  canTargetPlayer(
    state: GameState,
    sourceId: string,
    player: Seat,
    source: CardCharacteristics,
  ): boolean;
  /** Apply damage replacements/prevention to the complete batch, then damage. SBAs follow resolution. */
  damage(
    state: GameState,
    packets: readonly CombatDamagePacket[],
    source: CardCharacteristics,
  ): GameState;
}

export function activatedDamage(
  spec: ActivatedDamageSpecification,
  source: CardCharacteristics,
  effects: ActivatedDamageEffects,
) {
  if (
    ![spec.minimum, spec.maximum, spec.amount].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) ||
    spec.minimum > spec.maximum ||
    (spec.mainframePrograms &&
      (spec.recipient !== "player" ||
        spec.amount !== 0 ||
        spec.synergy !== undefined)) ||
    (spec.synergy !== undefined &&
      (!spec.synergy.faction.trim() ||
        !Number.isSafeInteger(spec.synergy.multiplier) ||
        spec.synergy.multiplier <= 0 ||
        spec.amount !== 0)) ||
    (spec.requiresCounter !== undefined &&
      (!spec.requiresCounter || spec.recipient !== "character")) ||
    (spec.recipient === "player" && (spec.minimum !== 1 || spec.maximum !== 1))
  )
    throw new Error("Invalid activated damage specification");
  const characters = (state: GameState, sourceId: string) => {
    const current = effects.characteristics(structuredClone(state));
    return state.arena.filter(
      (id) =>
        current.get(id)?.cardType === "character" &&
        (!spec.requiresCounter ||
          (state.objects[id].counters[spec.requiresCounter] ?? 0) > 0) &&
        effects.canTarget(
          structuredClone(state),
          sourceId,
          id,
          structuredClone(source),
        ),
    );
  };
  const players = (state: GameState, sourceId: string) =>
    ([0, 1] as const).filter((player) =>
      effects.canTargetPlayer(
        structuredClone(state),
        sourceId,
        player,
        structuredClone(source),
      ),
    );
  const checkShape = (choices: AbilityChoices) => {
    if (
      choices.modes.length ||
      choices.x !== null ||
      new Set(choices.targets).size !== choices.targets.length ||
      (spec.recipient === "player"
        ? choices.targets.length !== 0 ||
          (choices.playerTarget !== 0 && choices.playerTarget !== 1)
        : choices.playerTarget !== undefined ||
          choices.targets.length < spec.minimum ||
          choices.targets.length > spec.maximum)
    )
      throw new Error("Invalid damage choices");
  };
  const packets = (
    state: GameState,
    action: ActivatedAction,
  ): CombatDamagePacket[] => {
    const choices = action.activatedAbility.choices;
    checkShape(choices);
    const current = spec.mainframePrograms
      ? effects.characteristics(structuredClone(state))
      : undefined;
    const mainframes = spec.mainframePrograms
      ? state.players[choices.playerTarget!].zones.mainframe
      : [];
    const amount = spec.mainframePrograms
      ? [...state.arena, ...state.environment].filter(
          (id) =>
            current!.get(id)?.cardType === "program" &&
            state.objects[id].attachments.some(
              (link) =>
                link.kind === "protocol" && mainframes.includes(link.hostId),
            ),
        ).length
      : spec.synergy
        ? (evaluatePlayerSynergy(
            state,
            effects.characteristics(structuredClone(state)),
          )[action.controller].factions[spec.synergy.faction] ?? 0) *
          spec.synergy.multiplier
        : spec.amount;
    if (!Number.isSafeInteger(amount) || amount < 0)
      throw new Error("Activated damage amount exceeds supported range");
    const common = {
      sourceId: action.sourceId,
      amount,
      channel: spec.channel,
    };
    if (spec.recipient === "player")
      return players(state, action.sourceId).includes(choices.playerTarget!)
        ? [{ ...common, recipient: "player", player: choices.playerTarget! }]
        : [];
    const legal = new Set(characters(state, action.sourceId));
    return choices.targets
      .filter((id) => isCurrentActionTarget(state, action, id) && legal.has(id))
      .map((id) => ({ ...common, recipient: "character", instanceId: id }));
  };
  const behavior: ActivatedBehavior = {
    hasLegalTargets: (state, action) =>
      packets(state, action).length > 0 ||
      (spec.minimum === 0 &&
        action.activatedAbility.choices.targets.length === 0),
    resolve: (state, action) => {
      const batch = packets(state, action);
      return batch.length
        ? effects.damage(state, batch, structuredClone(source))
        : state;
    },
  };
  return {
    behavior,
    validate(state: GameState, sourceId: string, choices: AbilityChoices) {
      checkShape(choices);
      if (
        spec.recipient === "player"
          ? !players(state, sourceId).includes(choices.playerTarget!)
          : choices.targets.some(
              (id) => !characters(state, sourceId).includes(id),
            )
      )
        throw new Error("Illegal damage target");
    },
    variant(state: GameState, sourceId: string): ActivationVariant {
      return {
        key: "normal",
        label: "Normal",
        modes: [],
        x: null,
        targets:
          spec.recipient === "character"
            ? [
                {
                  label: "Target characters",
                  minimum: spec.minimum,
                  maximum: spec.maximum,
                  candidates: characters(state, sourceId),
                },
              ]
            : [],
        ...(spec.recipient === "player"
          ? {
              playerTargets: players(state, sourceId).map((player) => ({
                player,
                label:
                  player === state.objects[sourceId].controller
                    ? ("You" as const)
                    : ("Opponent" as const),
              })),
            }
          : {}),
      };
    },
  };
}
