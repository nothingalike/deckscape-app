import {
  rankBotBlocks,
  rankBotAttacks,
  type BotCombatAssessment,
} from "./bot-combat";
import { gameCommandSchema, type GameCommand } from "./commands";
import { boardZones } from "./board-view";
import type { BattlefieldSnapshot } from "./match-client-session";
import type { BotPlaybook } from "./bot-playbook";
import type { ProgramPlayVariant } from "./program-play-option";
import type { WonderlandOptions } from "./wonderland-contract";
import type { ActivationVariant } from "./activation-option";
import { activationValue, activationTargetSide } from "./bot-activation-value";

type Action = GameCommand["action"];
type PlayAction = Extract<
  Action,
  { type: "play-character" | "play-gear" | "play-program" }
>;
export interface BotCandidate {
  action: Action;
  score: number;
}

/** This entire policy consumes the same redacted snapshot a participant receives. */
export function botCandidates(
  snapshot: BattlefieldSnapshot,
  book: BotPlaybook,
  combat?: BotCombatAssessment,
): BotCandidate[] {
  const { view, presentations, decision, turnPrompt: turn } = snapshot;
  if (view.outcome) return [];
  const seat = view.seat;
  const own = view.players.find((p) => p.seat === seat)!;
  const cards = new Map(
    boardZones(view)
      .flatMap((z) => z.cards)
      .map((c) => [c.instanceId, c]),
  );
  const name = (id: string) => presentations[id]?.name.toUpperCase() ?? "";
  const value = (id: string) =>
    Math.max(0, presentations[id]?.attack ?? 0) +
    Math.max(0, presentations[id]?.defence ?? 0);
  const friendly = (id: string) => cards.get(id)?.controller === seat;
  const ownBoard = view.arena.filter((c) => c.controller === seat);
  const enemyBoard = view.arena.filter((c) => c.controller !== seat);
  const result: BotCandidate[] = [];
  const add = (action: unknown, score: number) => {
    const parsed = gameCommandSchema.safeParse({
      expectedRevision: view.revision,
      action,
    });
    if (parsed.success) result.push({ action: parsed.data.action, score });
  };
  const priority = (id: string, action: "play" | "activate", ability = "") => {
    const matches = book.priorities.filter(
      (p) =>
        p.card.toUpperCase() === name(id) &&
        p.action === action &&
        (!p.ability ||
          ability.toUpperCase().includes(p.ability.toUpperCase())) &&
        p.requires.every((n) =>
          ownBoard.some((c) => name(c.instanceId) === n.toUpperCase()),
        ) &&
        (p.when === "always" ||
          (p.when === "own-turn" && view.turn.activePlayer === seat) ||
          (p.when === "opponent-cache" &&
            view.priority?.stack.some((a) => a.controller !== seat)) ||
          (p.when === "enemy-board" && enemyBoard.length > 0) ||
          (p.when === "friendly-board" && ownBoard.length > 0) ||
          (p.when === "low-health" &&
            Math.min(own.mainframeHealth, own.bioframeHealth) <= 7)),
    );
    const active = matches.sort((a, b) => b.weight - a.weight)[0];
    if (active) return active;
    const configured = book.priorities.find(
      (p) =>
        p.card.toUpperCase() === name(id) &&
        p.action === action &&
        (!p.ability || ability.toUpperCase().includes(p.ability.toUpperCase())),
    );
    return configured ? { ...configured, weight: -100 } : undefined;
  };
  const rank = (
    ids: string[],
    target: "enemy" | "friendly" | "weak-friendly" | "any" = "any",
  ) =>
    [...ids].sort((a, b) => {
      const score = (id: string) =>
        (target === "any"
          ? 0
          : friendly(id) === (target !== "enemy")
            ? 100
            : -100) + (target === "weak-friendly" ? -value(id) : value(id));
      return score(b) - score(a) || a.localeCompare(b);
    });
  // Bounded alternatives let the authoritative evaluator reject cross-group choices.
  const selections = (
    variant: ProgramPlayVariant | ActivationVariant,
    target: "enemy" | "friendly" | "weak-friendly" | "any",
  ) => {
    let options: {
      targets: string[];
      sacrificeCharacters?: string[];
      sacrificeRam?: string[];
    }[] = [{ targets: [] }];
    for (const group of variant.targets) {
      const next: typeof options = [];
      for (const previous of options) {
        const available =
          "candidatesByFirstTarget" in group &&
          group.candidatesByFirstTarget &&
          previous.targets[0]
            ? (group.candidatesByFirstTarget[previous.targets[0]] ?? [])
            : group.candidates;
        const sorted = rank(
          available,
          group.purpose ? "weak-friendly" : target,
        );
        const count = Math.min(
          group.maximum,
          Math.max(group.minimum, sorted.length ? 1 : 0),
        );
        for (
          let offset = 0;
          offset < Math.max(1, Math.min(sorted.length, 8));
          offset++
        ) {
          const chosen = [
            ...sorted.slice(offset),
            ...sorted.slice(0, offset),
          ].slice(0, count);
          if (chosen.length < group.minimum) continue;
          const key =
            group.purpose === "sacrifice-character"
              ? "sacrificeCharacters"
              : group.purpose === "sacrifice-ram"
                ? "sacrificeRam"
                : "targets";
          next.push({
            ...previous,
            [key]: [...(previous[key] ?? []), ...chosen],
          });
        }
      }
      options = next.slice(0, 32);
    }
    return options;
  };
  // SWARM STRIKE is legal with no payment, but spending Xandra's run ability
  // needs a removal. Use only public effective stats and marked damage; the
  // authoritative quote still validates every sacrifice and target.
  const swarmStrikeValue = (selected: {
    targets: string[];
    sacrificeCharacters?: string[];
  }): number | null => {
    const sacrifices = selected.sacrificeCharacters ?? [];
    if (!sacrifices.length || sacrifices.length !== selected.targets.length)
      return null;
    const damage = new Map<string, number>();
    for (const [index, id] of sacrifices.entries()) {
      const attack = presentations[id]?.attack;
      const target = selected.targets[index];
      const recipient = cards.get(target);
      if (
        attack === undefined ||
        attack <= 0 ||
        !recipient ||
        recipient.controller === seat ||
        !enemyBoard.some((card) => card.instanceId === target) ||
        (recipient.counters.ARMOR ?? 0) > 0
      )
        return null;
      damage.set(target, (damage.get(target) ?? 0) + attack);
    }
    for (const [id, amount] of damage) {
      const defence = presentations[id]?.defence;
      const marked = cards.get(id)!.damage;
      if (defence === undefined || amount + marked.MF + marked.BF < defence)
        return null;
    }
    // Prefer valuable removals with fewer/less valuable sacrifices. Analyzed
    // priority changes rank, but cannot override the useful-removal gate.
    return (
      [...damage.keys()].reduce((sum, id) => sum + value(id), 0) / 10 -
      sacrifices.reduce((sum, id) => sum + value(id), 0) / 10
    );
  };
  const programActions = (
    options: NonNullable<
      Extract<NonNullable<typeof turn>, { type: "pass" }>["programs"]
    >,
    emit: (action: PlayAction, score: number) => void = add,
    mandatory = false,
  ) => {
    for (const option of options)
      for (const variant of option.variants) {
        // Antivirus may legally remove zero counters. Preserve the card when
        // its untargeted cleanup mode cannot affect the caster's Mainframe.
        if (
          !mandatory &&
          name(option.id) === "ANTIVIRUS" &&
          variant.key === "remove-counters" &&
          !own.mainframe.some((card) =>
            Object.values(card.counters).some((count) => count > 0),
          )
        )
          continue;
        const p = priority(option.id, "play");
        const target = p?.target ?? "enemy";
        const players = variant.playerTargets?.length
          ? variant.playerTargets.map((t) => t.player)
          : [undefined];
        const xs = variant.x
          ? [
              ...new Set([
                variant.x.minimum,
                Math.min(
                  variant.x.maximum,
                  own.ramBank.filter((r) => !r.running).length,
                ),
              ]),
            ]
          : [null];
        for (const selected of selections(variant, target))
          for (const playerTarget of players)
            for (const x of xs) {
              emit(
                {
                  type: "play-program",
                  id: option.id,
                  ram: [],
                  ...(option.freePlays ? { freePlay: true } : {}),
                  choices: {
                    ...selected,
                    modes: variant.modes,
                    reversed: variant.reversed,
                    x,
                    ...(variant.cacheActionId
                      ? { cacheActionId: variant.cacheActionId }
                      : {}),
                    ...(variant.mainframes?.length
                      ? { mainframeTarget: rank(variant.mainframes, target)[0] }
                      : {}),
                    ...(playerTarget !== undefined ? { playerTarget } : {}),
                    ...(variant.runCharacters
                      ? {
                          runCharacters: rank(
                            variant.runCharacters.candidates,
                            "weak-friendly",
                          ).slice(0, x ?? 0),
                        }
                      : {}),
                  },
                },
                (p?.weight ?? 4) +
                  (playerTarget !== undefined &&
                  (playerTarget === seat) === (target !== "enemy")
                    ? 2
                    : 0) +
                  (p &&
                  p.weight >= 0 &&
                  p.damage &&
                  playerTarget !== undefined &&
                  playerTarget !== seat &&
                  p.damage.amount >=
                    (p.damage.channel === "MF"
                      ? view.players.find((o) => o.seat === playerTarget)!
                          .mainframeHealth
                      : view.players.find((o) => o.seat === playerTarget)!
                          .bioframeHealth)
                    ? 1000
                    : 0),
              );
            }
      }
  };
  const playActions = (
    options: WonderlandOptions,
    emit: (action: PlayAction, score: number) => void = add,
    mandatory = false,
  ) => {
    for (const c of options.characters ?? [])
      if (!c.unavailable)
        emit(
          {
            type: "play-character",
            id: c.id,
            ram: c.ram.slice(0, c.freePlays ? 0 : c.cost),
            ...(c.freePlays ? { freePlay: true } : {}),
            ...(c.runCharacters
              ? {
                  runCharacters: rank(
                    c.runCharacters.candidates,
                    "weak-friendly",
                  ).slice(0, c.runCharacters.count),
                }
              : {}),
          },
          (priority(c.id, "play")?.weight ?? 10) + value(c.id) / 10,
        );
    for (const g of options.gear ?? [])
      if (!g.unavailable) {
        const hosts = [...g.hosts].sort(
          (a, b) => value(b.hostId) - value(a.hostId),
        );
        for (const host of hosts) {
          const second = g.tether
            ? hosts.find((h) => h.chain !== host.chain)
            : undefined;
          if (g.tether && !second) continue;
          emit(
            {
              type: "play-gear",
              id: g.id,
              ram: g.ram.slice(0, g.freePlays ? 0 : g.cost),
              ...(g.freePlays ? { freePlay: true } : {}),
              targets: [
                { hostId: host.hostId, port: host.ports[0] },
                ...(second
                  ? [{ hostId: second.hostId, port: second.ports[0] }]
                  : []),
              ],
            },
            priority(g.id, "play")?.weight ?? 5,
          );
        }
      }
    programActions(options.programs ?? [], emit, mandatory);
  };
  if (decision) {
    const d = decision,
      common = { decisionId: d.decisionId };
    switch (d.type) {
      case "damage-prevention":
        d.options.forEach((replacement) =>
          add({ ...common, type: "answer-damage-prevention", replacement }, 10),
        );
        break;
      case "bailout":
        add(
          { ...common, type: "answer-bailout", ram: d.ram.slice(0, d.count) },
          10,
        );
        break;
      case "counter-replacement":
        (d.options ?? ["armor", "spirit", "fan", "decline"]).forEach(
          (replacement) =>
            add(
              { ...common, type: "answer-counter-replacement", replacement },
              replacement === "decline" ? 0 : 10,
            ),
        );
        break;
      case "spirit-entry":
        d.cards.forEach((c) =>
          add(
            { ...common, type: "answer-spirit-entry", id: c.id },
            value(c.id),
          ),
        );
        break;
      case "copy-ability":
        d.options.forEach((o) =>
          add({ ...common, type: "answer-copy-ability", index: o.index }, 10),
        );
        break;
      case "shred-transfer":
        d.options.forEach((o) =>
          add(
            { ...common, type: "answer-shred-transfer", option: o.index },
            10,
          ),
        );
        if (!d.mandatory)
          add({ ...common, type: "answer-shred-transfer", option: null }, 0);
        break;
      case "hand-choice":
        d.cards.forEach((c) =>
          add(
            { ...common, type: "answer-hand-choice", selected: c.id },
            value(c.id),
          ),
        );
        break;
      case "ram-cost-choice":
        add({ ...common, type: "answer-ram-cost-choice", cost: 0 }, 1);
        break;
      case "faction-choice":
        d.factions.forEach((faction) =>
          add({ ...common, type: "answer-faction-choice", faction }, 1),
        );
        break;
      case "optional-trigger":
        add({ ...common, type: "answer-optional-trigger", useEffect: true }, 2);
        add(
          { ...common, type: "answer-optional-trigger", useEffect: false },
          0,
        );
        break;
      case "trigger-choice":
        if (d.cardCount)
          add(
            {
              ...common,
              type: "answer-trigger-cards",
              cards: d.options
                .slice(0, d.cardCount)
                .map((o) => o.cardId ?? o.id),
            },
            1,
          );
        else
          d.options.forEach((o) =>
            add({ ...common, type: "answer-trigger-choice", choice: o.id }, 1),
          );
        break;
      case "trigger-target":
        d.options.forEach((o) =>
          add(
            { ...common, type: "answer-trigger-target", option: o.index },
            "player" in o ? (o.seat !== seat ? 2 : 1) : 1,
          ),
        );
        break;
      case "top-cards":
      case "deck-search":
        d.cards
          .filter((c) => c.eligible)
          .forEach((c) =>
            add(
              {
                ...common,
                type:
                  d.type === "top-cards"
                    ? "answer-top-cards"
                    : "answer-deck-search",
                selected: c.id,
              },
              1,
            ),
          );
        if (d.allowFail)
          add(
            {
              ...common,
              type:
                d.type === "top-cards"
                  ? "answer-top-cards"
                  : "answer-deck-search",
              selected: null,
            },
            0,
          );
        break;
      case "counter-payment":
        add(
          {
            ...common,
            type: "answer-counter-payment",
            pay: d.ram.length >= d.ramCost,
            ram: d.ram.length >= d.ramCost ? d.ram.slice(0, d.ramCost) : [],
          },
          1,
        );
        break;
      case "tether-follow":
        d.options.forEach((o) =>
          add(
            { ...common, type: "answer-tether-follow", option: o.index },
            o.destination === "hand" ? 2 : 1,
          ),
        );
        break;
      case "ram-balance": {
        const ram = [...d.ram]
          .sort((a, b) => Number(a.running) - Number(b.running))
          .map((r) => r.id);
        const allocations = [],
          detach = [];
        for (const host of [...d.hosts].sort(
          (a, b) => value(b.hostId) - value(a.hostId),
        )) {
          const missing = Math.max(0, host.required - host.committed.length);
          if (missing)
            allocations.push({
              hostId: host.hostId,
              ram: ram.splice(0, missing),
            });
          detach.push(...host.committed.slice(host.required));
        }
        add({ ...common, type: "answer-ram-balance", allocations, detach }, 1);
        break;
      }
      case "eclipse-entry":
        d.cards.forEach((c) =>
          add({ ...common, type: "answer-eclipse-entry", selected: c.id }, 1),
        );
        break;
      case "deck-order":
        add(
          {
            ...common,
            type: "answer-deck-order",
            order: d.cards.map((c) => c.id),
          },
          1,
        );
        break;
      case "tower":
        add(
          d.stage === "partition"
            ? {
                ...common,
                type: "answer-tower",
                firstPile: d.cards
                  .slice(0, Math.ceil(d.cards.length / 2))
                  .map((c) => c.id),
              }
            : {
                ...common,
                type: "answer-tower",
                pile: d.counts[0] >= d.counts[1] ? 0 : 1,
              },
          1,
        );
        break;
      case "ducky-play":
        for (const o of d.options)
          for (const v of o.variants)
            for (const selected of selections(v, "enemy"))
              add(
                {
                  ...common,
                  type: "answer-ducky",
                  choices: {
                    ...selected,
                    modes: v.modes,
                    reversed: v.reversed,
                    x: v.x?.minimum ?? null,
                    ...(v.playerTargets?.length
                      ? { playerTarget: v.playerTargets[0].player }
                      : {}),
                  },
                },
                1,
              );
        add({ ...common, type: "answer-ducky", skip: true }, 0);
        break;
      case "wonderland":
        if (d.stage === "play")
          playActions(
            d.play ?? {},
            (action, score) => {
              const { freePlay: _freePlay, ...play } = action;
              add({ ...common, type: "answer-wonderland", play }, score);
            },
            true,
          );
        else if (d.stage === "invert") {
          // INVERT swaps attack channels. Score the change from the current
          // effective presentation, so a later roll cannot blindly undo it.
          for (const selected of d.candidates) {
            const stats = presentations[selected];
            if (!stats?.attackType || !stats.attack || stats.attack <= 0)
              continue;
            const isFriendly = friendly(selected);
            const defender = isFriendly
              ? view.players.find((p) => p.seat !== seat)!
              : own;
            const currentHealth =
              stats.attackType === "MF"
                ? defender.mainframeHealth
                : defender.bioframeHealth;
            const nextHealth =
              stats.attackType === "MF"
                ? defender.bioframeHealth
                : defender.mainframeHealth;
            const score =
              stats.attack *
              (currentHealth - nextHealth) *
              (isFriendly ? 1 : -1);
            if (score > 0)
              add({ ...common, type: "answer-wonderland", selected }, score);
          }
          add({ ...common, type: "answer-wonderland", selected: null }, 0);
        } else {
          rank(d.candidates, "enemy").forEach((selected) =>
            add({ ...common, type: "answer-wonderland", selected }, 1),
          );
          add({ ...common, type: "answer-wonderland", selected: null }, 0);
        }
        break;
      case "retarget-program":
        if (d.objectSlots)
          add(
            {
              ...common,
              type: "answer-retarget-program-slots",
              indices: d.objectSlots.map((s) => s.options[0].index),
            },
            1,
          );
        else
          d.options.forEach((o) =>
            add(
              { ...common, type: "answer-retarget-program", index: o.index },
              1,
            ),
          );
        break;
      case "redirect-ability":
        for (const v of d.variants)
          for (const selected of selections(v, "enemy"))
            add(
              {
                ...common,
                type: "answer-redirect-ability",
                selection: {
                  variant: v.key,
                  groups: v.targets.map((g) =>
                    selected.targets.filter((t) => g.candidates.includes(t)),
                  ),
                  ...(v.playerTargets?.length
                    ? { playerTarget: v.playerTargets[0].player }
                    : {}),
                },
              },
              1,
            );
        break;
    }
  } else if (turn) {
    switch (turn.type) {
      case "draw-install": {
        const installed = own.ramBank.length;
        add(
          {
            type: "draw-install",
            choice:
              turn.canInstall && (installed < 6 || !turn.canDraw)
                ? "install"
                : "draw",
          },
          10,
        );
        if (turn.canDraw) add({ type: "draw-install", choice: "draw" }, 1);
        if (turn.canInstall)
          add({ type: "draw-install", choice: "install" }, 1);
        break;
      }
      case "force-quit":
        // CR 501.5 permits choosing none. Preserve resources unless the policy
        // can establish a concrete benefit from destroying a persistent.
        add({ type: "force-quit", ids: [] }, 0);
        break;
      case "order-triggers":
        add(
          { type: "order-triggers", order: turn.triggers.map((t) => t.index) },
          1,
        );
        break;
      case "attack": {
        if (combat) {
          const opponent = view.players.find((p) => p.seat !== seat)!;
          for (const plan of rankBotAttacks(
            combat,
            seat,
            turn.candidates,
            turn.required ?? [],
            { MF: own.mainframeHealth, BF: own.bioframeHealth },
            { MF: opponent.mainframeHealth, BF: opponent.bioframeHealth },
            book.aggression,
          ))
            add({ type: "attack", ids: plan.ids }, plan.score);
          break;
        }
        const readyDefence = enemyBoard
          .filter((c) => !c.running)
          .reduce((n, c) => n + (presentations[c.instanceId]?.attack ?? 0), 0);
        const ids = turn.candidates.filter(
          (id) =>
            (presentations[id]?.attack ?? 0) > 0 &&
            (book.aggression >= 0.7 ||
              (presentations[id]?.defence ?? 0) > readyDefence ||
              readyDefence === 0),
        );
        add(
          {
            type: "attack",
            ids: [...new Set([...ids, ...(turn.required ?? [])])],
          },
          2,
        );
        add({ type: "attack", ids: turn.required ?? [] }, 0);
        break;
      }
      case "block": {
        if (combat && view.combat) {
          rankBotBlocks(combat, seat, view.combat.attackers, {
            MF: own.mainframeHealth,
            BF: own.bioframeHealth,
          }).forEach((assignments, index) =>
            add({ type: "block", assignments }, 1000 - index),
          );
        }
        const assignments: { blockerId: string; attackerId: string }[] = [];
        const minimum = new Map(
          turn.minimumBlockers?.map((m) => [m.attackerId, m.minimum]) ?? [],
        );
        const attackers = [
          ...new Set(turn.blockers.flatMap((b) => b.attackers)),
        ].sort(
          (a, b) =>
            Number(
              turn.blockers.some(
                (c) =>
                  turn.requiredBlockers?.includes(c.blockerId) &&
                  c.attackers.includes(b),
              ),
            ) -
              Number(
                turn.blockers.some(
                  (c) =>
                    turn.requiredBlockers?.includes(c.blockerId) &&
                    c.attackers.includes(a),
                ),
              ) ||
            (presentations[b]?.attack ?? 0) - (presentations[a]?.attack ?? 0),
        );
        for (const attackerId of attackers) {
          const available = turn.blockers.filter(
            (b) =>
              b.attackers.includes(attackerId) &&
              !assignments.some((a) => a.blockerId === b.blockerId),
          );
          const needed = minimum.get(attackerId) ?? 1;
          if (available.length < needed) continue;
          available.sort(
            (a, b) =>
              Number(turn.requiredBlockers?.includes(b.blockerId)) -
                Number(turn.requiredBlockers?.includes(a.blockerId)) ||
              value(a.blockerId) - value(b.blockerId),
          );
          for (const b of available.slice(0, needed))
            assignments.push({ blockerId: b.blockerId, attackerId });
        }
        add({ type: "block", assignments }, 2);
        add({ type: "block", assignments: [] }, 0);
        break;
      }
      case "assign-damage":
        add(
          {
            type: "assign-damage",
            splits: turn.splits.map((s) => {
              let remaining = s.total;
              return {
                attackerId: s.attackerId,
                assignments: s.blockers.map((blockerId, i) => {
                  const overrun = turn.overrun?.find(
                    (o) => o.attackerId === s.attackerId,
                  );
                  const amount = overrun
                    ? (overrun.blockers.find((b) => b.id === blockerId)
                        ?.amount ?? 0)
                    : i === s.blockers.length - 1
                      ? remaining
                      : Math.min(
                          remaining,
                          Math.max(
                            0,
                            (presentations[blockerId]?.defence ?? 0) -
                              (cards.get(blockerId)?.damage[
                                presentations[s.attackerId]?.attackType ?? "MF"
                              ] ?? 0),
                          ),
                        );
                  remaining -= amount;
                  return { blockerId, amount };
                }),
              };
            }),
          },
          1,
        );
        break;
      case "pass":
        playActions(turn);
        for (const option of turn.activations ?? [])
          for (const ability of option.abilities)
            for (const v of ability.variants) {
              const p = priority(option.id, "activate", ability.label);
              const xs =
                v.x && ability.abilityId === "blood-money"
                  ? Array.from(
                      { length: v.x.maximum - v.x.minimum + 1 },
                      (_, i) => v.x!.minimum + i,
                    )
                  : [v.x?.minimum ?? null];
              for (const x of xs) {
                const paidVariant =
                  ability.abilityId === "blood-money"
                    ? {
                        ...v,
                        targets: v.targets.map((g) =>
                          g.purpose === "sacrifice-ram"
                            ? { ...g, minimum: x ?? 0, maximum: x ?? 0 }
                            : g,
                        ),
                      }
                    : v;
                const side = activationTargetSide(ability.abilityId);
                const variant = side
                  ? {
                      ...paidVariant,
                      targets: paidVariant.targets.map((g) =>
                        g.purpose
                          ? g
                          : {
                              ...g,
                              candidates: g.candidates.filter(
                                (id) => friendly(id) === (side === "friendly"),
                              ),
                            },
                      ),
                    }
                  : paidVariant;
                const selectedOptions = selections(
                  variant,
                  side ?? p?.target ?? "enemy",
                );
                // Optional multi-target damage can benefit from every eligible
                // opponent. Preserve the smaller alternatives for trade evaluation.
                if (
                  ["incinerate", "leap-of-faith"].includes(ability.abilityId) &&
                  v.targets.length === 1
                ) {
                  const g = v.targets[0];
                  selectedOptions.push({
                    targets: rank(
                      g.candidates.filter((id) => !friendly(id)),
                      "enemy",
                    ).slice(0, g.maximum),
                  });
                }
                for (const selected of selectedOptions) {
                  for (const playerTarget of v.playerTargets?.length
                    ? v.playerTargets.map((t) => t.player)
                    : [undefined]) {
                    const choices = {
                      ...selected,
                      modes: v.modes,
                      x,
                      ...(v.cacheActionId
                        ? { cacheActionId: v.cacheActionId }
                        : {}),
                      ...(playerTarget !== undefined ? { playerTarget } : {}),
                    };
                    const utility =
                      ability.abilityId === "swarm-strike"
                        ? swarmStrikeValue(selected)
                        : activationValue(
                            snapshot,
                            option.id,
                            ability.abilityId,
                            choices,
                          );
                    if (utility === null) continue;
                    add(
                      {
                        type: "activate",
                        id: option.id,
                        abilityId: ability.abilityId,
                        ram: [],
                        choices,
                      },
                      (p?.weight ?? 3) + (utility ?? 0),
                    );
                  }
                }
              }
            }
        add({ type: "pass" }, 0);
        break;
    }
  }
  const sorted = result.sort((a, b) => b.score - a.score);
  const bounded = sorted.slice(0, 255);
  const pass = sorted.find((c) => c.action.type === "pass");
  if (pass && !bounded.includes(pass)) bounded.push(pass);
  return bounded;
}
