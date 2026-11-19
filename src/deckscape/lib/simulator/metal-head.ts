import { isDeepStrictEqual } from "node:util";
import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { AbilityChoices } from "./ability-choices";
import type { ActivatedAction, ActivatedBehavior } from "./resolve-ability";
import type { ActivationVariant } from "./activation-option";
import { isCurrentActionTarget } from "./action-targets";
import { isCurrentIncarnation } from "./object-incarnation";
import { assignDuelDamage, type DuelEffects } from "./duel";
import {
  attachGearAndGainControl,
  legalGearHosts,
  IllegalAttachment,
  type GearLink,
  type AttachmentEvaluation,
} from "./gear-attachment";

export interface ShredDecision {
  mandatory?: true;
  type: "shred-transfer";
  id: string;
  sourceId: string;
  actionId: string;
  gearId: string;
  player: Seat;
  options: GearLink[][];
}
export interface ShredEffects extends DuelEffects {
  attachment(state: GameState, gearId: string): AttachmentEvaluation;
}
export interface ShredEvaluation {
  options(state: GameState): GearLink[][];
  transfer(state: GameState, links: GearLink[]): GameState;
}
export function validateShredDecision(state: GameState): ShredDecision {
  const saved = state.pendingDecision,
    action = state.priorityWindow?.resolving;
  if (
    saved?.type !== "shred-transfer" ||
    !action?.activatedAbility ||
    !["shred", "swipe-platinum"].includes(action.activatedAbility.abilityId) ||
    !!saved.mandatory !==
      (action.activatedAbility.abilityId === "swipe-platinum") ||
    action.id !== saved.actionId ||
    action.sourceId !== saved.sourceId ||
    action.controller !== saved.player ||
    action.activatedAbility.choices.targets[saved.mandatory ? 0 : 1] !==
      saved.gearId ||
    saved.id !== `shred:${action.id}` ||
    state.priorityWindow?.mode !== "drain"
  )
    throw new Error("Invalid SHRED continuation");
  return saved;
}
export function answerShred(
  state: GameState,
  user: string,
  revision: number,
  decisionId: string,
  option: number | null,
  evaluated: ShredEvaluation,
): GameState {
  const saved = validateShredDecision(state);
  if (
    state.outcome ||
    revision !== state.revision ||
    saved.id !== decisionId ||
    state.players[saved.player].userId !== user
  )
    throw new Error("Stale or unauthorized SHRED decision");
  if (saved.mandatory && option === null)
    throw Error("Gear attachment is mandatory");
  const options = evaluated.options(structuredClone(state));
  if (
    !isDeepStrictEqual(options, saved.options) ||
    (option !== null &&
      (!Number.isInteger(option) || option < 0 || option >= options.length))
  )
    throw new Error("Invalid SHRED attachment option");
  let next = structuredClone(state);
  next.pendingDecision = null;
  if (option !== null) next = evaluated.transfer(next, options[option]);
  if (
    next.revision !== revision ||
    next.pendingDecision ||
    next.outcome ||
    next.priorityWindow?.resolving?.id !== saved.actionId
  )
    throw new Error("SHRED transfer changed transaction identity");
  next.priorityWindow.resolutionApplied = true;
  next.revision++;
  return next;
}

/** SHRED finishes its optional transfer before any lethal-damage SBA checkpoint. */
export function metalHead(effects: ShredEffects) {
  return gearTakingAbility(effects, false);
}
export function swipePlatinum(effects: ShredEffects) {
  return gearTakingAbility(effects, true);
}
function gearTakingAbility(effects: ShredEffects, swipe: boolean) {
  const shape = (choices: AbilityChoices) => {
    if (
      choices.targets.length < 1 ||
      choices.targets.length > (swipe ? 1 : 2) ||
      choices.modes.length ||
      choices.x !== null ||
      choices.playerTarget !== undefined ||
      choices.sacrificeRam !== undefined
    )
      throw new Error("Invalid SHRED choices");
  };
  const characters = (state: GameState, sourceId: string) => {
    const current = effects.characteristics(state);
    return state.arena.filter(
      (id) =>
        current.get(id)?.cardType === "character" &&
        effects.canTarget(state, sourceId, id),
    );
  };
  const gear = (state: GameState, sourceId: string, hostId?: string) => {
    const current = effects.characteristics(state);
    return state.arena.filter(
      (id) =>
        current.get(id)?.cardType === "gear" &&
        effects.canTarget(state, sourceId, id) &&
        (swipe ||
          state.objects[id].attachments.some(
            (link) => link.kind === "gear" && link.hostId === hostId,
          )),
    );
  };
  const transfer = (
    state: GameState,
    action: ActivatedAction,
    links: GearLink[],
  ) => {
    const gearId = action.activatedAbility.choices.targets[swipe ? 0 : 1];
    const current = effects.characteristics(state),
      card = current.get(gearId);
    if (
      card?.iconic &&
      state.arena.some(
        (id) =>
          id !== gearId &&
          state.objects[id].controller === action.controller &&
          current.get(id)?.iconic &&
          current.get(id)?.name === card.name,
      )
    )
      throw new IllegalAttachment("Duplicate iconic gear");
    return attachGearAndGainControl(
      state,
      action.sourceId,
      action.controller,
      gearId,
      links,
      effects.attachment(state, gearId),
    );
  };
  const options = (state: GameState, action: ActivatedAction): GearLink[][] => {
    const hostId = action.activatedAbility.choices.targets[0],
      gearId = action.activatedAbility.choices.targets[swipe ? 0 : 1];
    if (
      !gearId ||
      !isCurrentIncarnation(state, action.activatedAbility.source) ||
      !state.arena.includes(action.sourceId) ||
      !isCurrentActionTarget(state, action, gearId) ||
      !gear(state, action.sourceId, hostId).includes(gearId)
    )
      return [];
    const candidate = structuredClone(state);
    candidate.objects[gearId].controller = action.controller;
    const evaluated = effects.attachment(candidate, gearId);
    const card = evaluated.characteristics.get(gearId);
    if (
      card?.iconic &&
      state.arena.some(
        (id) =>
          id !== gearId &&
          state.objects[id].controller === action.controller &&
          evaluated.characteristics.get(id)?.iconic &&
          evaluated.characteristics.get(id)?.name === card.name,
      )
    )
      return [];
    const hosts = legalGearHosts(candidate, gearId, evaluated);
    const first = hosts.find((host) => host.hostId === action.sourceId);
    if (!first) return [];
    return first.ports.flatMap((port): GearLink[][] => {
      const link = { hostId: action.sourceId, port };
      return !evaluated.tether
        ? [[link]]
        : hosts
            .filter(
              (host) =>
                host.hostId !== action.sourceId && host.chain !== first.chain,
            )
            .flatMap((host) =>
              host.ports.map((otherPort) => [
                link,
                { hostId: host.hostId, port: otherPort },
              ]),
            );
    });
  };
  const behavior: ActivatedBehavior = {
    hasLegalTargets(state, action) {
      shape(action.activatedAbility.choices);
      if (swipe) {
        const id = action.activatedAbility.choices.targets[0];
        return (
          isCurrentActionTarget(state, action, id) &&
          gear(state, action.sourceId).includes(id)
        );
      }
      const [host, gearId] = action.activatedAbility.choices.targets;
      return (
        (isCurrentActionTarget(state, action, host) &&
          characters(state, action.sourceId).includes(host)) ||
        (!!gearId &&
          isCurrentActionTarget(state, action, gearId) &&
          gear(state, action.sourceId, host).includes(gearId))
      );
    },
    resolve(state, action) {
      const host = action.activatedAbility.choices.targets[0];
      let next = state;
      if (
        !swipe &&
        isCurrentIncarnation(state, action.activatedAbility.source) &&
        isCurrentActionTarget(state, action, host) &&
        characters(state, action.sourceId).includes(host)
      ) {
        const packets = assignDuelDamage(
          state,
          action.sourceId,
          host,
          effects.characteristics(state),
        );
        if (packets.length) next = effects.damage(state, packets);
      }
      const available = options(next, action);
      if (!available.length || next.outcome) return next;
      next = structuredClone(next);
      next.pendingDecision = {
        ...(swipe ? { mandatory: true as const } : {}),
        type: "shred-transfer",
        id: `shred:${action.id}`,
        sourceId: action.sourceId,
        actionId: action.id,
        gearId: action.activatedAbility.choices.targets[swipe ? 0 : 1],
        player: action.controller,
        options: available,
      };
      return next;
    },
  };
  return {
    behavior,
    validate(state: GameState, id: string, choices: AbilityChoices) {
      shape(choices);
      if (swipe) {
        if (!gear(state, id).includes(choices.targets[0]))
          throw Error("Illegal SWIPE PLATINUM target");
        return;
      }
      if (
        !characters(state, id).includes(choices.targets[0]) ||
        (choices.targets[1] &&
          !gear(state, id, choices.targets[0]).includes(choices.targets[1]))
      )
        throw new Error("Illegal SHRED targets");
    },
    variants(state: GameState, id: string): ActivationVariant[] {
      if (swipe)
        return [
          {
            key: "normal",
            label: "SWIPE PLATINUM",
            modes: [],
            x: null,
            targets: [
              {
                label: "Target gear",
                minimum: 1,
                maximum: 1,
                candidates: gear(state, id),
              },
            ],
          },
        ];
      const hosts = characters(state, id);
      return [
        {
          key: "normal",
          label: "SHRED",
          modes: [],
          x: null,
          targets: [
            {
              label: "Duel character",
              minimum: 1,
              maximum: 1,
              candidates: hosts,
            },
            {
              label: "Optional gear to take",
              minimum: 0,
              maximum: 1,
              candidates: [
                ...new Set(hosts.flatMap((host) => gear(state, id, host))),
              ],
              candidatesByFirstTarget: Object.fromEntries(
                hosts.map((host) => [host, gear(state, id, host)]),
              ),
            },
          ],
        },
      ];
    },
    decision(state: GameState): ShredEvaluation {
      validateShredDecision(state);
      const action = state.priorityWindow!.resolving as ActivatedAction;
      return {
        options: (snapshot) => options(snapshot, action),
        transfer: (snapshot, links) => transfer(snapshot, action, links),
      };
    },
  };
}
