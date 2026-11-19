import type { GameState } from "./game-state";
import type { GameCommandRuntime } from "./commands";
import type { BattlefieldSnapshot } from "./match-client-session";
import type { BotCombatAssessment, BotCombatant } from "./bot-combat";
import { expireTimedCombatEffects } from "./timed-combat-effects";
import { expireTimedStatEffects } from "./timed-stat-effects";

/** Bot-only public facts. Never return canonical objects, private zones or evaluators. */
export function projectBotCombat(
  state: GameState,
  snapshot: Pick<BattlefieldSnapshot, "view" | "presentations">,
  runtime: GameCommandRuntime,
): BotCombatAssessment {
  const visible = new Set(
    snapshot.view.arena
      .filter((c) => snapshot.presentations[c.instanceId]?.attack !== undefined)
      .map((c) => c.instanceId),
  );
  const project = (position: GameState): BotCombatant[] => {
    const evaluated = runtime.combat(structuredClone(position));
    const damage = runtime.damage(structuredClone(position));
    return position.arena.flatMap((id) => {
      if (!visible.has(id)) return [];
      const card = evaluated.characteristics.get(id);
      // Zero defence causes unconditional departure at the cleanup SBA check.
      if (card?.cardType !== "character" || card.defence <= 0) return [];
      const object = position.objects[id];
      return [
        {
          id,
          seat: object.controller,
          attack: Math.max(0, card.attack),
          defence: Math.max(
            0,
            card.defence - object.damage.MF - object.damage.BF,
          ),
          channel: card.attackType,
          running: object.running,
          stamina: evaluated.hasStamina(position, id),
          armor: object.counters.ARMOR ?? 0,
          overrun: damage.overrun.has(id),
          canAttack: evaluated.canAttack(position, id),
          mustBlock: evaluated.mustBlock?.(position, id) ?? false,
          minimumBlockers: evaluated.minimumBlockers?.(position, id) ?? 1,
          blocks: position.arena.filter(
            (attacker) =>
              visible.has(attacker) &&
              position.objects[attacker].controller !== object.controller &&
              evaluated.canBlock(position, id, attacker),
          ),
        },
      ];
    });
  };
  // Public-board estimate after ordinary turn-end expiry and opponent refresh.
  // No draws, random outcomes, triggers or hidden cards are inspected by the policy.
  const next = expireTimedStatEffects(
    expireTimedCombatEffects(structuredClone(state)),
  );
  next.turn.number++;
  next.turn.activePlayer = state.turn.activePlayer === 0 ? 1 : 0;
  for (const id of next.arena) {
    next.objects[id].damage = { MF: 0, BF: 0 };
    if (next.objects[id].controller === next.turn.activePlayer)
      next.objects[id].running = false;
  }
  return { now: project(state), reply: project(next) };
}
