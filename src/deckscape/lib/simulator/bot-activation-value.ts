import type { BattlefieldSnapshot } from "./match-client-session";
import { boardZones } from "./board-view";
import type { AbilityChoices } from "./ability-choices";
import catalog from "./expanded-cards-v5.json";
import retained from "./character-activation-specifications-v1.json";
import counters from "./counter-character-specifications-v3.json";
import resources from "./resource-character-specifications-v3.json";
import easy from "./easy-character-activation-specifications-v3.json";
import thrashers from "./thrasher-character-specifications-v3.json";
import archangel from "./project-archangel-specification-v3.json";
import moons from "./moon-sister-specifications-v3.json";
import trixie from "./trixie-specification-v3.json";
import alice from "./alice-specification-v5.json";
import eclipse from "./eclipse-dropship-specification-v5.json";

interface Specification {
  abilityId: string;
  index: number;
  damage?: {
    recipient: string;
    channel: string;
    amount: number;
    synergy?: { faction: string; multiplier: number };
    mainframePrograms?: boolean;
  };
  counter?: { counter: string; amount: number };
  installCount?: number;
}
const specifications = new Map<string, Specification>(
  [
    ...retained,
    ...counters,
    ...resources,
    ...easy,
    ...thrashers,
    archangel,
    ...moons,
    trixie,
    alice,
    eclipse,
  ].flatMap((spec) =>
    spec.abilities.map((ability) => [ability.abilityId, ability] as const),
  ),
);
interface PrintedCard {
  cardType: string;
  ramCost?: number;
  factions: readonly string[];
  tags: readonly string[];
  activatedAbilities?: readonly {
    name: string;
    ramCost: number;
    run: boolean;
  }[];
}
const printed = new Map<string, PrintedCard>(
  catalog.map((c) => [c.characteristics.name.toUpperCase(), c.characteristics]),
);

/** Ownership is an effect constraint for these reviewed families, not a sort preference. */
export function activationTargetSide(
  abilityId: string,
): "friendly" | "enemy" | undefined {
  const spec = specifications.get(abilityId);
  if (spec?.counter)
    return spec.counter.counter === "+1/+1" ? "friendly" : "enemy";
  if (
    spec?.damage?.recipient === "character" ||
    ["off-with-their-heads", "detain", "bork", "leap-of-faith"].includes(
      abilityId,
    )
  )
    return "enemy";
  return undefined;
}

/** Positive marginal benefit, null to hold, undefined for a family not yet reviewed.
 * Values are conservative tactical heuristics, not new rules. The only match
 * facts used here are inspectable objects, effective public stats and own hand.
 */
export function activationValue(
  snapshot: BattlefieldSnapshot,
  sourceId: string,
  abilityId: string,
  choices: AbilityChoices,
  quotedCost?: number,
): number | null | undefined {
  const { view, presentations } = snapshot;
  const seat = view.seat;
  const own = view.players.find((p) => p.seat === seat)!;
  const opponent = view.players.find((p) => p.seat !== seat)!;
  const visible = new Map(
    boardZones(view)
      .flatMap((z) => z.cards)
      .map((c) => [c.instanceId, c]),
  );
  const name = (id: string) =>
    visible.get(id)?.definitionVersion
      ? (presentations[id]?.name.toUpperCase() ?? "")
      : "";
  const traits = (id: string) => printed.get(name(id));
  const source = visible.get(sourceId);
  const spec = specifications.get(abilityId);
  // The projected ability identifies the actual activation. Printed metadata is
  // used only for its costs; unreviewed/copied sources keep the existing fallback.
  const projected =
    snapshot.turnPrompt?.type === "pass"
      ? snapshot.turnPrompt.activations
          ?.find((o) => o.id === sourceId)
          ?.abilities.find((a) => a.abilityId === abilityId)
      : undefined;
  const metadata = traits(sourceId)?.activatedAbilities?.find(
    (a) => a.name === projected?.label,
  );
  if (!source || !metadata) return undefined;
  const characters = view.arena.filter(
    (c) =>
      presentations[c.instanceId]?.defence !== undefined && c.definitionVersion,
  );
  const friends = characters.filter((c) => c.controller === seat);
  const enemies = characters.filter((c) => c.controller !== seat);
  const friendly = (id: string) => visible.get(id)?.controller === seat;
  const stats = (id: string) => presentations[id];
  const body = (id: string) =>
    Math.max(1, (stats(id)?.attack ?? 0) + (stats(id)?.defence ?? 0));
  const destruction = (id: string) =>
    (visible.get(id)?.counters.ARMOR ?? 0) > 0 ? 1 : body(id);
  const readyRam = own.ramBank.filter((r) => !r.running).length;
  // Before quoting, assess effect and opportunity cost only. A printed cost can
  // be discounted; the executor supplies the authoritative current RAM cost.
  const cost = quotedCost ?? 0;
  const ownTurn = view.turn.activePlayer === seat;
  const beforeAttack =
    ownTurn &&
    (["deploy", "netcheck"].includes(view.turn.step) ||
      (view.turn.step === "combat" &&
        view.combat?.stage === "attackers-window"));
  const inCombat = (id: string) =>
    !!view.combat &&
    !["damage-applied", "end"].includes(view.combat.stage) &&
    (view.combat.attackers.includes(id) ||
      view.combat.blockers.some((b) => b.blockerId === id));
  const canFight = (id: string) =>
    inCombat(id) || (!visible.get(id)?.running && beforeAttack);
  const faction = (id: string, f: string) =>
    snapshot.synergy
      ?.find((p) => p.seat === visible.get(id)?.controller)
      ?.contributors.factions[f]?.cardIds.includes(id) ??
    traits(id)?.factions.includes(f) ??
    false;
  // Spending RAM is cheaper than losing a body. Running costs the likely combat
  // contribution, but not another attack after the source has already attacked.
  const runCost =
    metadata.run && !source.running
      ? beforeAttack
        ? Math.max(0, stats(sourceId)?.attack ?? 0)
        : !ownTurn && enemies.some((c) => !c.running)
          ? body(sourceId) / 2
          : 0
      : 0;
  const net = (benefit: number, extraCost = 0) => {
    const value = benefit - cost * 0.5 - runCost - extraCost;
    return value > 0 ? value : null;
  };
  const characterDamage = (id: string, amount: number) => {
    const card = visible.get(id);
    const defence = stats(id)?.defence;
    if (
      !card ||
      defence === undefined ||
      amount <= 0 ||
      (card.counters.ARMOR ?? 0) > 0
    )
      return 0;
    return amount + card.damage.MF + card.damage.BF >= defence
      ? body(id)
      : Math.min(amount, defence) * 0.75;
  };
  const hostileTargets = () =>
    choices.targets.length > 0 && choices.targets.every((id) => !friendly(id));
  const playerDamage = (amount: number, channel: string, extraCost = 0) => {
    if (choices.playerTarget !== opponent.seat || amount <= 0) return null;
    const health =
      channel === "MF" ? opponent.mainframeHealth : opponent.bioframeHealth;
    return amount >= health ? 1000 : net(amount, extraCost);
  };

  if (spec?.damage) {
    const d = spec.damage;
    const amount =
      d.amount +
      (d.synergy
        ? (snapshot.synergy?.find((p) => p.seat === seat)?.contributors
            .factions[d.synergy.faction]?.current ?? 0) * d.synergy.multiplier
        : 0) +
      (d.mainframePrograms
        ? view.arena.filter(
            (c) =>
              traits(c.instanceId)?.cardType === "program" &&
              c.attachments.some((a) =>
                opponent.mainframe.some((m) => m.instanceId === a.hostId),
              ),
          ).length
        : 0);
    if (d.recipient === "player") return playerDamage(amount, d.channel);
    if (!hostileTargets()) return null;
    return net(
      choices.targets.reduce((sum, id) => sum + characterDamage(id, amount), 0),
    );
  }
  if (spec?.counter) {
    const beneficial = spec.counter.counter === "+1/+1";
    if (
      !choices.targets.length ||
      choices.targets.some((id) => friendly(id) !== beneficial)
    )
      return null;
    return net(
      choices.targets.reduce(
        (sum, id) =>
          sum +
          (beneficial
            ? 2
            : (stats(id)?.defence ?? Infinity) <= spec.counter!.amount
              ? body(id)
              : 2),
        0,
      ),
    );
  }
  if (spec?.installCount)
    return own.ramDeckCount > 0
      ? net(Math.min(own.ramDeckCount, spec.installCount) * 3)
      : null;
  switch (abilityId) {
    case "path-of-darkness":
    case "path-of-light": {
      const count = own.recycleBin.filter(
        (c) =>
          traits(c.instanceId)?.cardType === "program" &&
          traits(c.instanceId)?.tags.includes("TAROT"),
      ).length;
      const partner =
        abilityId === "path-of-darkness"
          ? "LUNA, THE SACRED MOON"
          : "LILITH, THE DARK MOON";
      const amount =
        count * (friends.some((c) => name(c.instanceId) === partner) ? 2 : 1);
      return abilityId === "path-of-darkness"
        ? playerDamage(amount, "MF")
        : net(amount * 2);
    }
    case "checkmate":
      return enemies.length === 1 &&
        ["PAWN", "BISHOP", "ROOK"].every((n) =>
          friends.some((c) => c.token && name(c.instanceId) === n),
        )
        ? 1000
        : null;
    case "detain":
      return hostileTargets() &&
        choices.targets.every((id) => !visible.get(id)?.running)
        ? net(choices.targets.reduce((sum, id) => sum + body(id) / 2, 0))
        : null;
    case "off-with-their-heads":
      return hostileTargets()
        ? net(choices.targets.reduce((sum, id) => sum + destruction(id), 0))
        : null;
    case "judgment-day": {
      const permanents = [...view.arena, ...view.environment].filter(
        (c) => c.instanceId !== sourceId,
      );
      if (permanents.some((c) => !c.definitionVersion)) return null;
      const affected = permanents.filter(
        (c) =>
          stats(c.instanceId)?.defence !== undefined ||
          traits(c.instanceId)?.cardType === "program",
      );
      const boardValue = (id: string) =>
        stats(id)?.defence !== undefined
          ? destruction(id)
          : Math.max(1, traits(id)?.ramCost ?? 1);
      return net(
        affected.reduce(
          (sum, c) =>
            sum + (c.controller === seat ? -1 : 1) * boardValue(c.instanceId),
          0,
        ),
        body(sourceId),
      );
    }
    case "windmill":
    case "gas-cloud": {
      const affected = characters.filter((c) =>
        abilityId === "windmill"
          ? c.instanceId !== sourceId
          : name(c.instanceId) !== "EXTERMINATOR" || c.token,
      );
      return net(
        affected.reduce(
          (sum, c) =>
            sum +
            (c.controller === seat ? -1 : 1) * characterDamage(c.instanceId, 1),
          0,
        ),
        abilityId === "windmill" ? 2 : 0,
      );
    }
    case "leap-of-faith":
      return hostileTargets()
        ? net(
            choices.targets.reduce(
              (sum, id) => sum + characterDamage(id, 1),
              0,
            ),
            body(sourceId),
          )
        : null;
    case "blood-money": {
      const amount = choices.x ?? 0;
      if (!amount || amount !== choices.sacrificeRam?.length) return null;
      // Sacrificed RAM removes future resources. Nonlethal pressure only pays
      // when it uses spare bank capacity; lethal damage can spend the bank.
      const lostCapacity = Math.max(0, 5 - (own.ramBank.length - amount));
      return playerDamage(amount, "BF", amount * 0.5 + lostCapacity * 2);
    }
    case "cash-out": {
      const amount = Math.min(source.counters.interest ?? 0, own.ramDeckCount);
      if (!amount) return null;
      // Installed RAM is running: plan for next refresh, not an immediate cast.
      const prompt =
        snapshot.turnPrompt?.type === "pass" ? snapshot.turnPrompt : null;
      const costs = [
        ...(prompt?.characters ?? [])
          .filter((c) => c.unavailable === null || c.unavailable === "ram")
          .map((c) => c.cost),
        ...(prompt?.gear ?? [])
          .filter((c) => c.unavailable === null || c.unavailable === "ram")
          .map((c) => c.cost),
        ...(prompt?.programs ?? [])
          .filter((p) => p.variants.length)
          .flatMap((p) => traits(p.id)?.ramCost ?? []),
      ];
      const needed = costs.filter(
        (c) => c > own.ramBank.length && c <= own.ramBank.length + amount,
      );
      const threatened = enemies.some(
        (c) =>
          !c.running &&
          (stats(c.instanceId)?.attack ?? 0) >=
            (stats(sourceId)?.defence ?? Infinity),
      );
      const deckExhausted = amount === own.ramDeckCount;
      return needed.length || threatened || deckExhausted
        ? net(amount * 2)
        : null;
    }
    case "floor-score": {
      if (!ownTurn) return null;
      const drugs =
        snapshot.turnPrompt?.type === "pass"
          ? (snapshot.turnPrompt.programs?.filter(
              (p) =>
                traits(p.id)?.tags.includes("DRUG") &&
                (traits(p.id)?.ramCost ?? 0) > 0 &&
                (traits(p.id)?.ramCost ?? Infinity) <= readyRam - cost + 1,
            ) ?? [])
          : [];
      // One discount merely reimburses FLOOR SCORE; two visible plays produce
      // a saving. Quotes will still reject any unavailable drug play.
      return drugs.length >= 2 ? net(drugs.length, 0) : null;
    }
    case "quicken-the-pulse": {
      const dustrunners = friends.filter((c) =>
        faction(c.instanceId, "DUSTRUNNER"),
      );
      const environments = view.environment.filter(
        (c) => !c.faceDown || c.definitionVersion,
      );
      const pulse =
        beforeAttack &&
        environments.some((c) => name(c.instanceId) === "THE PULSE")
          ? dustrunners.filter((c) => c.instanceId !== sourceId && !c.running)
              .length
          : 0;
      // THE AMRITA triggers on NETCHECK, which still occurs after deployment.
      const amrita =
        ownTurn &&
        view.turn.step === "deploy" &&
        environments.some((c) => name(c.instanceId) === "THE AMRITA")
          ? dustrunners.length * 2
          : 0;
      return net(pulse + amrita);
    }
    case "infiltrate": {
      if (!beforeAttack) return null;
      const eligible = (own.hand ?? []).filter(
        (c) =>
          traits(c.instanceId)?.cardType === "character" &&
          traits(c.instanceId)?.factions.includes("DUSTRUNNER"),
      );
      return eligible.length
        ? net(Math.max(...eligible.map((c) => body(c.instanceId))))
        : null;
    }
    case "bork":
      return beforeAttack &&
        hostileTargets() &&
        choices.targets.every((id) => !visible.get(id)?.running) &&
        friends.some(
          (c) =>
            c.instanceId !== sourceId &&
            !c.running &&
            (stats(c.instanceId)?.attack ?? 0) > 0,
        )
        ? net(choices.targets.reduce((sum, id) => sum + body(id) / 2, 0))
        : null;
    case "cloaked-strike":
      return beforeAttack && !source.running && enemies.some((c) => !c.running)
        ? net(Math.max(0, stats(sourceId)?.attack ?? 0))
        : null;
    case "count-in": {
      const recipients = friends.filter(
        (c) =>
          c.instanceId !== sourceId &&
          faction(c.instanceId, "THRASHER") &&
          canFight(c.instanceId),
      );
      return recipients.length ? net(recipients.length * 2) : null;
    }
    case "rampage": {
      if (!canFight(sourceId)) return null;
      const bonus =
        (snapshot.synergy?.find((p) => p.seat === seat)?.contributors.factions
          .CYBERNETIC?.current ?? 0) * 2;
      if (beforeAttack && !enemies.some((c) => !c.running)) {
        const channel =
          stats(sourceId)?.attackType === "MF"
            ? opponent.mainframeHealth
            : opponent.bioframeHealth;
        if ((stats(sourceId)?.attack ?? 0) + bonus >= channel) return 1000;
      }
      if (!view.combat) return null;
      const opposing = view.combat.blockers
        .filter((b) => b.blockerId === sourceId || b.attackerId === sourceId)
        .map((b) => (b.blockerId === sourceId ? b.attackerId : b.blockerId));
      // Value only removals that the added attack enables, not kills available
      // without spending the ability; later destruction must also pay off.
      const gain = opposing.reduce(
        (sum, id) =>
          sum +
          Math.max(
            0,
            characterDamage(id, (stats(sourceId)?.attack ?? 0) + bonus) -
              characterDamage(id, stats(sourceId)?.attack ?? 0),
          ),
        0,
      );
      return net(gain, body(sourceId));
    }
    default:
      return undefined;
  }
}
