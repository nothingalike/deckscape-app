/** Public combat facts supplied by the pinned rules evaluator, never parsed prose. */
export interface BotCombatant {
  id: string;
  seat: 0 | 1;
  attack: number;
  defence: number;
  channel: "MF" | "BF";
  running: boolean;
  stamina: boolean;
  armor: number;
  overrun: boolean;
  canAttack: boolean;
  mustBlock: boolean;
  minimumBlockers: number;
  blocks: string[];
}
export interface BotCombatAssessment {
  now: BotCombatant[];
  reply: BotCombatant[];
}
type Health = { MF: number; BF: number };
type Blocks = Map<string, BotCombatant[]>;
const value = (c: BotCombatant) => c.attack + Math.max(0, c.defence);
const dead = (h: Health) => h.MF <= 0 || h.BF <= 0;
const pressure = (damage: Health, health: Health) =>
  damage.MF / Math.max(1, health.MF) + damage.BF / Math.max(1, health.BF);

const tradeValue = (
  cards: BotCombatant[],
  lost: ReadonlySet<string>,
  seat: 0 | 1,
) =>
  cards.reduce(
    (sum, c) =>
      sum + (lost.has(c.id) ? value(c) * (c.seat === seat ? -1 : 1) : 0),
    0,
  );
/** A bounded tactical estimate, not a simulation of triggers, draws or responses. */
function exchange(attackers: BotCombatant[], blocks: Blocks) {
  const damage: Health = { MF: 0, BF: 0 };
  const lost = new Set<string>();
  const armorUsed = new Set<string>();
  const destroy = (c: BotCombatant) =>
    (c.armor > 0 ? armorUsed : lost).add(c.id);
  for (const attacker of attackers) {
    const group = blocks.get(attacker.id) ?? [];
    if (!group.length) damage[attacker.channel] += attacker.attack;
    else {
      if (attacker.overrun)
        damage[attacker.channel] += Math.max(
          0,
          attacker.attack -
            group.reduce((sum, c) => sum + Math.max(0, c.defence), 0),
        );
      if (group.reduce((sum, c) => sum + c.attack, 0) >= attacker.defence)
        destroy(attacker);
      // Damage assignment favors valuable kills; simultaneous blockers all hit back.
      let remaining = attacker.attack;
      for (const blocker of [...group].sort((a, b) => value(b) - value(a))) {
        if (remaining >= blocker.defence) {
          remaining -= Math.max(0, blocker.defence);
          destroy(blocker);
        }
      }
    }
  }
  return { damage, lost, armorUsed };
}

function defenceScore(
  attackers: BotCombatant[],
  blocks: Blocks,
  health: Health,
) {
  const { damage, lost } = exchange(attackers, blocks);
  const remaining = { MF: health.MF - damage.MF, BF: health.BF - damage.BF };
  const board = [...attackers, ...[...blocks.values()].flat()];
  const attackerIds = new Set(attackers.map((c) => c.id));
  return (
    (dead(remaining) ? -1_000_000 : 0) -
    pressure(damage, health) * 100 +
    board.reduce(
      (sum, c) =>
        sum +
        (lost.has(c.id) ? value(c) * (attackerIds.has(c.id) ? 1 : -1) : 0),
      0,
    )
  );
}

/** Beam search starts with no blocks and retains alternative legal block groups.
 * It models the public eligibility matrix; authoritative commands still validate play.
 */
function blockPlans(
  attackers: BotCombatant[],
  defenders: BotCombatant[],
  health: Health,
) {
  let plans: Blocks[] = [new Map()];
  const ordered = [...attackers].sort(
    (a, b) =>
      b.attack / Math.max(1, health[b.channel]) -
      a.attack / Math.max(1, health[a.channel]),
  );
  for (const attacker of ordered) {
    const next: Blocks[] = [];
    for (const plan of plans) {
      const used = new Set([...plan.values()].flat().map((c) => c.id));
      const eligible = defenders.filter(
        (c) => !c.running && !used.has(c.id) && c.blocks.includes(attacker.id),
      );
      const minimum = attacker.minimumBlockers;
      const groups: BotCombatant[][] = [[]];
      if (minimum === 1) groups.push(...eligible.map((c) => [c]));
      // Include cheap chumps, strong trades, and broad groups for Overrun/multi-blocks.
      for (const sorted of [
        [...eligible].sort((a, b) => value(a) - value(b)),
        [...eligible].sort((a, b) => b.attack - a.attack),
        [...eligible].sort((a, b) => b.defence - a.defence),
      ]) {
        for (const count of new Set([minimum, 2, sorted.length]))
          if (count >= minimum && count <= sorted.length)
            groups.push(sorted.slice(0, count));
      }
      for (const group of groups) {
        const copy = new Map(plan);
        if (group.length) copy.set(attacker.id, group);
        next.push(copy);
      }
    }
    // Score each distinct plan once. Sorting repeatedly evaluated whole combats
    // on token-heavy boards and amplified the bounded search unnecessarily.
    const unique = new Map<string, Blocks>();
    for (const plan of next) {
      const key = [...plan]
        .map(
          ([id, group]) =>
            `${id}:${group
              .map((c) => c.id)
              .sort()
              .join(",")}`,
        )
        .sort()
        .join("|");
      if (!unique.has(key)) unique.set(key, plan);
    }
    plans = [...unique.values()]
      .map((plan) => ({ plan, score: defenceScore(ordered, plan, health) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((entry) => entry.plan);
  }
  // Prefer assignments satisfying public mandatory blocks among generated plans.
  const mandatory = defenders.filter((c) => c.mustBlock && !c.running);
  const obligation = (plan: Blocks) => {
    const used = new Set([...plan.values()].flat().map((c) => c.id));
    return mandatory.filter((c) => used.has(c.id)).length;
  };
  const most = Math.max(0, ...plans.map(obligation));
  return plans.filter((p) => obligation(p) === most);
}

/** Exhaustive for up to six optional attackers; bounded hybrid alternatives above that. */
function attackGroups(optional: string[], required: string[]) {
  if (optional.length <= 6) {
    return Array.from({ length: 2 ** optional.length }, (_, mask) => [
      ...required,
      ...optional.filter((_, i) => mask & (1 << i)),
    ]);
  }
  const groups = [required, [...required, ...optional]];
  for (let i = 0; i < Math.min(optional.length, 24); i++) {
    groups.push([...required, ...optional.filter((_, j) => j !== i)]);
    groups.push([...required, optional[i]]);
    groups.push([...required, ...optional.slice(0, i)]);
    groups.push([...required, ...optional.slice(i)]);
  }
  return groups;
}

export function rankBotAttacks(
  assessment: BotCombatAssessment,
  seat: 0 | 1,
  candidates: string[],
  required: string[],
  health: Health,
  enemyHealth: Health,
  aggression: number,
): { ids: string[]; score: number }[] {
  const own = assessment.now.filter((c) => c.seat === seat);
  const enemy = assessment.now.filter((c) => c.seat !== seat);
  const requiredIds = new Set(required);
  const optional = candidates.filter(
    (id) =>
      !requiredIds.has(id) && own.some((c) => c.id === id && c.attack > 0),
  );
  const seen = new Set<string>();
  const cache = new Map<string, Blocks[]>();
  const plans = (
    phase: string,
    attack: BotCombatant[],
    defence: BotCombatant[],
    hp: Health,
  ) => {
    const key = `${phase}:${attack.map((c) => `${c.id}/${c.armor}`).join(",")}:${defence.map((c) => `${c.id}/${c.armor}/${c.running}`).join(",")}`;
    let found = cache.get(key);
    if (!found) {
      found = blockPlans(attack, defence, hp);
      cache.set(key, found);
    }
    return found;
  };
  return attackGroups(optional, required)
    .flatMap((ids) => {
      const key = [...ids].sort().join("|");
      if (seen.has(key)) return [];
      seen.add(key);
      const selected = new Set(ids);
      const attackers = own.filter((c) => selected.has(c.id));
      let worst = Infinity;
      for (const blocks of plans("now", attackers, enemy, enemyHealth)) {
        const result = exchange(attackers, blocks);
        const enemyRemaining = {
          MF: enemyHealth.MF - result.damage.MF,
          BF: enemyHealth.BF - result.damage.BF,
        };
        let score: number;
        if (dead(enemyRemaining)) score = 10_000_000;
        else {
          const survivors = assessment.reply
            .filter((c) => !result.lost.has(c.id))
            .map((c) => ({
              ...c,
              armor: Math.max(0, c.armor - Number(result.armorUsed.has(c.id))),
            }));
          const reply = survivors.filter(
            (c) => c.seat !== seat && !c.running && c.canAttack && c.attack > 0,
          );
          const reserved = survivors.filter(
            (c) =>
              c.seat === seat &&
              (!selected.has(c.id) || own.find((a) => a.id === c.id)?.stamina),
          );
          // Current STAMINA leaves an attacker ready even if the grant expires later.
          const ready = reserved.map((c) => ({
            ...c,
            running: own.find((a) => a.id === c.id)?.running ?? true,
          }));
          let bestReply = -Infinity;
          for (const defence of plans("reply", reply, ready, health)) {
            const counter = exchange(reply, defence);
            const remaining = {
              MF: health.MF - counter.damage.MF,
              BF: health.BF - counter.damage.BF,
            };
            const replyUtility =
              (dead(remaining) ? -1_000_000 : 0) +
              // If every line loses, reduce the most urgent frame deficit.
              Math.min(0, remaining.MF, remaining.BF) * 1000 -
              pressure(counter.damage, health) * (60 - 20 * aggression) +
              tradeValue(survivors, counter.lost, seat) * 2;
            // The opponent can decline a losing counterattack. Do not reward
            // waiting for hypothetical favorable blocks that may never happen.
            const utility =
              pressure(result.damage, enemyHealth) * (20 + 40 * aggression) +
              tradeValue(assessment.now, result.lost, seat) * 2 +
              Math.min(0, replyUtility);
            bestReply = Math.max(bestReply, utility);
          }
          score = bestReply;
        }
        worst = Math.min(worst, score);
      }
      return [{ ids, score: worst }];
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.ids.length - a.ids.length ||
        a.ids.join().localeCompare(b.ids.join()),
    );
}

export function rankBotBlocks(
  assessment: BotCombatAssessment,
  seat: 0 | 1,
  attackers: string[],
  health: Health,
) {
  const ids = new Set(attackers);
  const attack = assessment.now.filter((c) => ids.has(c.id));
  return blockPlans(
    attack,
    assessment.now.filter((c) => c.seat === seat),
    health,
  )
    .sort(
      (a, b) =>
        defenceScore(attack, b, health) - defenceScore(attack, a, health),
    )
    .map((plan) =>
      [...plan].flatMap(([attackerId, blockers]) =>
        blockers.map((c) => ({ attackerId, blockerId: c.id })),
      ),
    );
}
