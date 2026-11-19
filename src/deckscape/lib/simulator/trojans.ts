import duckyCard from "./rubber-ducky-card-v5.json";
import { beginDucky, duckyTargets, duckyHandler } from "./rubber-ducky";
import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { ActivationEvaluation, AbilityChoices } from "./activate-ability";
import type { ActivationAbilityOption } from "./activation-option";
import type { ProgramPlayEvaluation, ProgramChoices } from "./play-program";
import type { ProgramPlayVariant } from "./program-play-option";
import type { ActivatedBehavior } from "./resolve-ability";
import type { CombatDamagePacket } from "./combat-damage";
import type { Seat } from "./setup";
import { versionDefinition } from "./definition-version";
import { resolveProtocolEntry, hasOpenProtocolSlot } from "./protocol";
import retainedSpecifications from "./trojan-cards-v1.json";
const specifications = [...retainedSpecifications, duckyCard];
import { isDeepStrictEqual } from "node:util";
import {
  pendingActivated,
  redirectVariants,
  type RedirectEvaluation,
} from "./redirect-ability";

/** Rule 707 characteristics are rules-visible; inspection still uses the retained
 * definition/artwork. A face-down Trojan contributes no faction or abilities. */
export function faceDownTrojanCharacteristics(
  card: CardCharacteristics,
): CardCharacteristics {
  if (card.cardType !== "program" || !card.tags.includes("TROJAN")) return card;
  return {
    ...card,
    name: "Face-down Trojan",
    factions: [],
    iconic: false,
    rulesText: "",
    ramCost: 2,
    requirements: {},
    activatedAbilities: [],
  };
}

export function bindTrojans(
  pins: readonly ReturnType<typeof versionDefinition>[],
  effects: {
    definitions: ReadonlyMap<string, CardCharacteristics>;
    characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
    play(
      state: GameState,
      id: string,
    ): import("./play-character").CharacterPlayEvaluation;
    canTarget(state: GameState, source: string, target: string): boolean;
    bin(state: GameState, source: string): GameState;
    destroy(state: GameState, source: string, ids: string[]): GameState;
    damage(state: GameState, packets: readonly CombatDamagePacket[]): GameState;
    redirect?: RedirectEvaluation;
  },
) {
  const known = new Map(
    pins
      .filter((p) =>
        specifications.some((s) => s.cardId === p.definition.cardId),
      )
      .map((p) => [p.version, p]),
  );
  for (const p of known.values()) {
    const spec = specifications.find((s) => s.cardId === p.definition.cardId)!;
    if (
      !isDeepStrictEqual(p.definition.characteristics, spec.characteristics) ||
      !isDeepStrictEqual(p.definition.handlers, spec.handlers) ||
      p.definition.support === "unimplemented"
    )
      throw Error(
        "Trojan definition does not match its retained specification",
      );
  }
  const isTrojan = (state: GameState, id: string) =>
    known.has(state.objects[id]?.definitionVersion);
  const pin = (state: GameState, id: string) => {
    const p = known.get(state.objects[id]?.definitionVersion);
    if (
      !p ||
      p.definition.rulesVersion !== state.rulesVersion ||
      p.definition.engineVersion !== state.engineVersion
    )
      throw Error("Trojan pin unavailable");
    return p;
  };
  const attachment = (state: GameState, id: string) => ({
    characteristics: effects.characteristics(state),
    permittedMainframes: new Set(
      state.players
        .flatMap((p) => p.zones.mainframe)
        .filter((host) => effects.canTarget(state, id, host) && hasOpenProtocolSlot(state, host)),
    ),
  });
  const validateProgram = (
    _state: GameState,
    _id: string,
    c: ProgramChoices,
  ) => {
    if (
      c.targets.length ||
      c.modes.length ||
      c.x !== null ||
      c.reversed ||
      c.playerTarget !== undefined ||
      !c.mainframeTarget ||
      c.runCharacters !== undefined
    )
      throw Error("Invalid Trojan play choices");
  };
  const validateChoice = (_state: GameState, c: AbilityChoices) => {
    if (
      c.targets.length ||
      c.modes.length ||
      c.x !== null ||
      c.playerTarget !== undefined ||
      c.sacrificeRam !== undefined ||
      c.cacheActionId !== undefined
    )
      throw Error("Trojan has no chosen targets");
  };
  const canActivate = (state: GameState, id: string) => {
    const o = state.objects[id];
    return (
      isTrojan(state, id) &&
      state.arena.includes(id) &&
      o.faceDown &&
      o.trojanPlayedTurn !== undefined &&
      o.trojanPlayedTurn < state.turn.number &&
      o.attachments.some(
        (a) =>
          a.kind === "protocol" &&
          state.players.some((p) => p.zones.mainframe.includes(a.hostId)),
      )
    );
  };
  const activated = new Map<string, ActivatedBehavior>();
  const redirectChoices = (state: GameState, c: AbilityChoices) => {
    validateChoice(state, { ...c, cacheActionId: undefined });
    if (!c.cacheActionId || !pendingActivated(state, c.cacheActionId))
      throw Error("Choose a pending activated ability");
  };
  const redirectOptions = (state: GameState) =>
    (state.priorityWindow?.stack ?? [])
      .filter((a) => a.kind === "activated" && a.activatedAbility)
      .map((a, index) => ({
        key: a.id,
        cacheActionId: a.id,
        label: `${index + 1}. ${a.activatedAbility!.characteristics.name} — ${a.activatedAbility!.abilityId.replaceAll("-", " ")}`,
        modes: [],
        targets: [],
        x: null,
      }));
  const duckyChoices = (state: GameState, c: AbilityChoices, player: Seat) => {
    validateChoice(state, { ...c, cacheActionId: undefined });
    if (
      !c.cacheActionId ||
      !duckyTargets(state, player, effects.characteristics(state)).some(
        (a) => a.id === c.cacheActionId,
      )
    )
      throw Error("Choose an opponent's cached script");
  };
  const duckyOptions = (state: GameState, player: Seat) =>
    duckyTargets(state, player, effects.characteristics(state)).map((a) => ({
      key: a.id,
      cacheActionId: a.id,
      label: effects.characteristics(state).get(a.sourceId)!.name,
      modes: [],
      targets: [],
      x: null,
    }));
  for (const p of known.values()) {
    const handler = p.definition.handlers[0].id;
    activated.set(handler, {
      hasLegalTargets: (_state, action) => {
        if (handler === duckyHandler)
          return duckyTargets(
            _state,
            action.controller,
            effects.characteristics(_state),
          ).some((a) => a.id === action.activatedAbility.choices.cacheActionId);
        if (handler === "trojan/redirect")
          return (
            !!action.activatedAbility.choices.cacheActionId &&
            !!pendingActivated(
              _state,
              action.activatedAbility.choices.cacheActionId,
            )
          );
        validateChoice(_state, action.activatedAbility.choices);
        return true;
      },
      resolve(state, action) {
        if (handler === duckyHandler)
          return beginDucky(state, action, effects.characteristics(state));
        if (handler === "trojan/redirect") {
          if (!effects.redirect) throw Error("Redirect evaluator unavailable");
          const target = pendingActivated(
            state,
            action.activatedAbility.choices.cacheActionId!,
          )!;
          if (!redirectVariants(state, target, effects.redirect).length)
            return state;
          const next = structuredClone(state);
          next.pendingDecision = {
            type: "redirect-ability",
            id: `redirect:${action.id}`,
            actionId: action.id,
            sourceId: action.sourceId,
            targetActionId: target.id,
            player: action.controller,
          };
          return next;
        }
        const link = action.activatedAbility.source.attachments.find(
          (a) => a.kind === "protocol",
        );
        const player = state.players.findIndex((p) =>
          p.zones.mainframe.includes(link?.hostId ?? ""),
        );
        if (player !== 0 && player !== 1)
          throw Error("Trojan captured mainframe unavailable");
        const current = effects.characteristics(state);
        const attackers = (state.combat?.attackers ?? []).filter(
          (id) =>
            state.arena.includes(id) &&
            state.objects[id].controller === player &&
            current.get(id)?.cardType === "character",
        );
        if (handler === "trojan/fatal-error-75")
          return effects.destroy(state, action.sourceId, attackers);
        const amount =
          handler === "trojan/power-spike"
            ? attackers.length * 3
            : state.players[player].zones.ramBank.some(
                  (id) =>
                    current.get(id)?.cardType === "ram" &&
                    !state.objects[id].running,
                )
              ? 0
              : 4;
        return amount
          ? effects.damage(state, [
              {
                sourceId: action.sourceId,
                sourceController: action.controller,
                recipient: "player",
                player: player as Seat,
                channel: "MF",
                amount,
              },
            ])
          : state;
      },
    });
  }
  return {
    isTrojan,
    retargetVariants: (
      state: GameState,
      action: import("./resolve-ability").ActivatedAction,
    ) =>
      action.activatedAbility.handler === duckyHandler
        ? duckyOptions(state, action.controller)
        : action.activatedAbility.handler === "trojan/redirect"
          ? redirectOptions(state).filter((v) => v.cacheActionId !== action.id)
          : [],
    activated,
    program(
      state: GameState,
      id: string,
      choices: ProgramChoices,
    ): ProgramPlayEvaluation {
      pin(state, id);
      validateProgram(state, id, choices);
      return {
        ...effects.play(state, id),
        faceDown: true,
        allowReversed: false,
        announcement: { factions: [], tags: ["TROJAN"] },
        protocol: attachment(state, id),
        validateChoices: validateProgram,
      };
    },
    programVariants(state: GameState, id: string): ProgramPlayVariant[] {
      pin(state, id);
      return [
        {
          key: "trojan",
          label: "Install face-down Trojan",
          modes: [],
          targets: [],
          reversed: false,
          x: null,
          mainframes: [...attachment(state, id).permittedMainframes],
        },
      ];
    },
    entry(state: GameState): GameState {
      const id = state.priorityWindow!.resolving!.sourceId;
      pin(state, id);
      const turn = state.objects[id].trojanPlayedTurn;
      if (turn === undefined || turn > state.turn.number)
        throw Error("Trojan play turn unavailable");
      const next = resolveProtocolEntry(state, attachment(state, id));
      if (next.arena.includes(id)) {
        next.objects[id].faceDown = true;
        next.objects[id].trojanPlayedTurn = turn;
      } else next.objects[id].faceDown = false;
      return next;
    },
    activation(
      state: GameState,
      id: string,
      abilityId: string,
      _choices: AbilityChoices,
    ): ActivationEvaluation {
      const p = pin(state, id),
        card = p.definition.characteristics;
      const validate =
        p.definition.handlers[0].id === duckyHandler
          ? (s: GameState, c: AbilityChoices) =>
              duckyChoices(s, c, state.objects[id].controller)
          : p.definition.handlers[0].id === "trojan/redirect"
            ? redirectChoices
            : validateChoice;
      if (card.cardType !== "program") throw Error("Trojan is not a program");
      return {
        definitions: effects.definitions,
        sourceCharacteristics: card,
        abilityId: "activate",
        handler: p.definition.handlers[0].id,
        allowed: abilityId === "activate" && canActivate(state, id),
        ramCost: card.activatedAbilities[0].ramCost,
        run: false,
        revealSource: true,
        additionalCostText: "Reveal and bin this Trojan.",
        validateChoices: validate,
        additionalCost: {
          validate(snapshot, c) {
            validate(snapshot, c);
            if (!canActivate(snapshot, id))
              throw Error("Trojan cannot activate this turn");
          },
          pay(snapshot) {
            return effects.bin(snapshot, id);
          },
        },
      };
    },
    activationOptions(state: GameState, id: string): ActivationAbilityOption[] {
      if (!canActivate(state, id)) return [];
      return [
        {
          abilityId: "activate",
          label: "Activate Trojan — reveal and bin",
          variants:
            pin(state, id).definition.handlers[0].id === duckyHandler
              ? duckyOptions(state, state.objects[id].controller)
              : pin(state, id).definition.handlers[0].id === "trojan/redirect"
                ? redirectOptions(state)
                : [
                    {
                      key: "normal",
                      label: "Activate",
                      modes: [],
                      targets: [],
                      x: null,
                    },
                  ],
        },
      ];
    },
  };
}
