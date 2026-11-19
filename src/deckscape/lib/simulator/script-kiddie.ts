import { z } from "zod";
import { copiedAbilitySchema, type CopiedAbility } from "./copied-abilities";
import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { ActivatedAction, ActivatedBehavior } from "./resolve-ability";
import type { ActivationEvaluation, AbilityChoices } from "./activate-ability";
import type {
  ActivationAbilityOption,
  ActivationVariant,
} from "./activation-option";
import { isCurrentActionTarget } from "./action-targets";
import { isCurrentIncarnation } from "./object-incarnation";
import { isDeepStrictEqual } from "node:util";
import { recordAbilityCopied } from "./game-log";

export const copyAbilityDecisionSchema = z
  .object({
    type: z.literal("copy-ability"),
    id: z.string().min(1),
    sourceId: z.string().min(1),
    targetId: z.string().min(1),
    actionId: z.string().min(1),
    player: z.union([z.literal(0), z.literal(1)]),
    options: z
      .array(
        z
          .object({
            label: z.string().min(1).max(500),
            copy: copiedAbilitySchema,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type CopyAbilityDecision = z.infer<typeof copyAbilityDecisionSchema>;
export function validateCopyAbilityDecision(state: GameState) {
  const saved = state.pendingDecision,
    action = state.priorityWindow?.resolving;
  if (
    saved?.type !== "copy-ability" ||
    !action?.activatedAbility ||
    action.activatedAbility.handler !== "script-kiddie/ctrl-c" ||
    action.id !== saved.actionId ||
    action.sourceId !== saved.sourceId ||
    action.controller !== saved.player ||
    saved.id !== `copy:${action.id}` ||
    action.activatedAbility.choices.targets[0] !== saved.targetId ||
    state.priorityWindow?.mode !== "drain" ||
    !isCurrentIncarnation(state, action.activatedAbility.source) ||
    !state.arena.includes(saved.sourceId) ||
    !isCurrentActionTarget(state, action, saved.targetId)
  )
    throw Error("Invalid CTRL+C continuation");
  return saved;
}

/** CTRL+C replaces an ability; it never activates the donated ability. The
 * retained executable binding survives the donor leaving play. */
export function scriptKiddie(effects: {
  version?: string;
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  canTarget(state: GameState, sourceId: string, targetId: string): boolean;
  abilities(
    state: GameState,
    id: string,
  ): { label: string; copy: CopiedAbility }[];
  activation(
    state: GameState,
    id: string,
  ): Omit<ActivationEvaluation, "abilityId" | "handler" | "validateChoices">;
}) {
  const native = (state: GameState, id: string) => {
    const object = state.objects[id];
    return (
      !!effects.version &&
      !!object &&
      !object.faceDown &&
      state.arena.includes(id) &&
      (object.copiedAbility
        ? object.copiedAbility.kind === "ctrl-c" &&
          object.copiedAbility.definitionVersion === effects.version &&
          object.copiedAbility.abilityId === "ctrl-c"
        : object.definitionVersion === effects.version)
    );
  };
  const copy = (): CopiedAbility => {
    if (!effects.version) throw Error("CTRL+C unavailable in this release");
    return {
      kind: "ctrl-c",
      definitionVersion: effects.version,
      abilityId: "ctrl-c",
    };
  };
  const targets = (state: GameState, id: string) =>
    state.arena.filter((target) => {
      const card = effects.characteristics(state).get(target);
      // Do not enumerate target variants here: CTRL+C can target another CTRL+C.
      return (
        card?.cardType === "character" &&
        card.factions.includes("HACKER") &&
        effects.canTarget(state, id, target) &&
        (native(state, target) || effects.abilities(state, target).length > 0)
      );
    });
  const options = (state: GameState, id: string) => [
    ...(native(state, id) ? [{ label: "CTRL+C", copy: copy() }] : []),
    ...effects.abilities(state, id),
  ];
  const variants = (state: GameState, id: string): ActivationVariant[] => [
    {
      key: "ctrl-c",
      label: "Copy an activated ability",
      modes: [],
      x: null,
      targets: [
        {
          label: "Hacker character",
          minimum: 1,
          maximum: 1,
          candidates: targets(state, id),
        },
      ],
    },
  ];
  const legal = (state: GameState, action: ActivatedAction) => {
    const captured = action.activatedAbility.source;
    if (
      !effects.version ||
      action.activatedAbility.abilityId !== "ctrl-c" ||
      action.activatedAbility.handler !== "script-kiddie/ctrl-c" ||
      captured.id !== action.sourceId ||
      (captured.copiedAbility
        ? !isDeepStrictEqual(captured.copiedAbility, copy())
        : captured.definitionVersion !== effects.version)
    )
      throw Error("Invalid captured CTRL+C binding");
    return (
      isCurrentActionTarget(
        state,
        action,
        action.activatedAbility.choices.targets[0],
      ) &&
      targets(state, action.sourceId).includes(
        action.activatedAbility.choices.targets[0],
      )
    );
  };
  const behavior: ActivatedBehavior = {
    hasLegalTargets: legal,
    resolve(state, action) {
      if (
        !legal(state, action) ||
        !isCurrentIncarnation(state, action.activatedAbility.source) ||
        !state.arena.includes(action.sourceId)
      )
        return state;
      const targetId = action.activatedAbility.choices.targets[0],
        available = options(state, targetId);
      if (!available.length) return state;
      const next = structuredClone(state);
      next.pendingDecision = {
        type: "copy-ability",
        id: `copy:${action.id}`,
        sourceId: action.sourceId,
        targetId,
        actionId: action.id,
        player: action.controller,
        options: available,
      };
      return next;
    },
  };
  return {
    copy,
    native,
    variants,
    behavior,
    describeCopy(value: CopiedAbility) {
      if (!isDeepStrictEqual(value, copy()))
        throw Error("Invalid CTRL+C binding");
      return { name: "CTRL+C", ramCost: 0, run: true };
    },
    activationOptions(state: GameState, id: string): ActivationAbilityOption[] {
      return native(state, id)
        ? [
            {
              abilityId: "ctrl-c",
              label: "CTRL+C",
              variants: variants(state, id),
            },
          ]
        : [];
    },
    activation(
      state: GameState,
      id: string,
      choices: AbilityChoices,
    ): ActivationEvaluation {
      if (!native(state, id)) throw Error("CTRL+C unavailable");
      return {
        ...effects.activation(state, id),
        abilityId: "ctrl-c",
        handler: "script-kiddie/ctrl-c",
        validateChoices(snapshot, selection) {
          if (
            selection.targets.length !== 1 ||
            selection.modes.length ||
            selection.x !== null ||
            selection.playerTarget !== undefined ||
            selection.sacrificeRam !== undefined ||
            selection.cacheActionId !== undefined ||
            !targets(snapshot, id).includes(selection.targets[0])
          )
            throw Error("Invalid CTRL+C target");
        },
      };
    },
    answer(
      state: GameState,
      user: string,
      revision: number,
      decisionId: string,
      index: number,
    ) {
      const saved = validateCopyAbilityDecision(state);
      if (
        state.outcome ||
        revision !== state.revision ||
        saved.id !== decisionId ||
        state.players[saved.player].userId !== user ||
        !Number.isInteger(index) ||
        !saved.options[index] ||
        !isDeepStrictEqual(saved.options, options(state, saved.targetId))
      )
        throw Error("Stale or invalid CTRL+C choice");
      const next = structuredClone(state);
      next.objects[saved.sourceId].copiedAbility = structuredClone(
        saved.options[index].copy,
      );
      recordAbilityCopied(
        next,
        effects.characteristics(state).get(saved.sourceId)!.name,
        saved.options[index].label,
      );
      next.pendingDecision = null;
      next.priorityWindow!.resolutionApplied = true;
      next.revision++;
      return next;
    },
  };
}
