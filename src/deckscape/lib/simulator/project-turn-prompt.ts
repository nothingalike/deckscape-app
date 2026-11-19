import type { GameState } from "./game-state";
import type { PlayerGameView } from "./board-view";
import type { GameCommandRuntime } from "./commands";
import type { TurnPrompt } from "./turn-prompt";
import { canDeclareAttacker, canDeclareBlocker } from "./combat";
import { combatDamageGroups } from "./combat-damage";
import { boardZones } from "./board-view";
import { canAct } from "./priority";

/** Call with the participant projection of the same authorized snapshot. Permissions
 * come from the same pinned runtime used by command validation, never the browser.
 */
export function projectTurnPrompt(
  state: GameState,
  view: PlayerGameView,
  runtime: Pick<
    GameCommandRuntime,
    "drawRestrictions" | "forceQuit" | "combat" | "damage"
  >,
  triggerLabels?: ReadonlyMap<string, string>,
): TurnPrompt | null {
  if (
    state.revision !== view.revision ||
    state.engineVersion !== view.engineVersion ||
    state.rulesVersion !== view.rulesVersion
  )
    throw new Error("Turn projection does not match its snapshot");
  if (state.outcome || state.pendingDecision) return null;
  const common = { revision: state.revision };
  if (!state.triggersOrdered) {
    if (view.seat !== state.turn.activePlayer) return null;
    const triggers = state.pendingTriggers.slice(state.triggerOrderStart);
    if (triggers.length < 2 || view.triggerOrder?.count !== triggers.length)
      throw new Error("Invalid trigger-order projection");
    const visible = new Set(
      boardZones(view).flatMap((zone) =>
        zone.cards.map((card) => card.instanceId),
      ),
    );
    return {
      ...common,
      type: "order-triggers",
      triggers: triggers.map((trigger, index) => {
        const label = triggerLabels?.get(trigger.handler);
        if (!label?.trim() || label.length > 500)
          throw new Error("Public trigger description unavailable");
        return {
          index,
          label: label.trim(),
          yours: trigger.controller === view.seat,
          ...(visible.has(trigger.sourceId)
            ? { sourceId: trigger.sourceId }
            : {}),
        };
      }),
    };
  }
  if (state.pendingRuleEvents.length || state.pendingTriggers.length)
    return null;
  if (state.priorityWindow)
    return canAct(state.priorityWindow, view.seat)
      ? { ...common, type: "pass" }
      : null;
  if (state.cache.length) return null;
  if (state.turn.step === "combat" && state.combat) {
    const stage = state.combat.stage;
    const owner =
      stage === "blockers"
        ? 1 - state.turn.activePlayer
        : state.turn.activePlayer;
    if (view.seat !== owner) return null;
    if (stage === "attackers") {
      const evaluated = runtime.combat(structuredClone(state));
      const required = state.arena.filter(
        (id) =>
          canDeclareAttacker(state, id, evaluated) &&
          evaluated.mustAttack?.(state, id),
      );
      return {
        ...common,
        type: "attack",
        ...(required.length ? { required } : {}),
        candidates: state.arena.filter((id) =>
          canDeclareAttacker(state, id, evaluated),
        ),
      };
    }
    if (stage === "blockers") {
      const evaluated = runtime.combat(structuredClone(state));
      const minimumBlockers = state.combat!.attackers.flatMap((attackerId) => {
        const minimum = evaluated.minimumBlockers?.(state, attackerId) ?? 1;
        return minimum > 1 ? [{ attackerId, minimum }] : [];
      });
      const requiredBlockers = state.arena.filter(
        (id) =>
          evaluated.mustBlock?.(state, id) &&
          state.combat!.attackers.some((a) =>
            canDeclareBlocker(state, id, a, evaluated),
          ),
      );
      return {
        ...common,
        type: "block",
        ...(requiredBlockers.length ? { requiredBlockers } : {}),
        ...(minimumBlockers.length ? { minimumBlockers } : {}),
        blockers: state.arena.flatMap((id) => {
          const attackers = state.combat!.attackers.filter((attackerId) =>
            canDeclareBlocker(state, id, attackerId, evaluated),
          );
          return attackers.length ? [{ blockerId: id, attackers }] : [];
        }),
      };
    }
    if (stage === "damage") {
      const evaluated = runtime.damage(structuredClone(state));
      const groups = combatDamageGroups(
        state,
        evaluated.characteristics,
        evaluated.overrun,
      );
      const overrun = groups
        .filter((group) => group.excess > 0)
        .map((group) => ({
          attackerId: group.attacker.id,
          channel: group.attacker.channel,
          playerDamage: group.excess,
          blockers: group.blockers.map((blocker) => ({
            id: blocker.id,
            amount: blocker.remainingDefence,
          })),
        }));
      return {
        ...common,
        type: "assign-damage",
        ...(overrun.length ? { overrun } : {}),
        splits: groups
          .filter((group) => group.blockers.length > 1 && group.excess === 0)
          .map((group) => ({
            attackerId: group.attacker.id,
            total: group.attacker.amount,
            blockers: group.blockers.map((blocker) => blocker.id),
          })),
      };
    }
    return null;
  }
  if (state.turn.activePlayer !== view.seat) return null;
  if (state.turn.step === "draw-install" && state.drawInstallRemaining > 0) {
    const restrictions = runtime.drawRestrictions(structuredClone(state));
    return {
      ...common,
      type: "draw-install",
      remaining: state.drawInstallRemaining,
      canDraw: !restrictions.cannotDraw,
      canInstall: !restrictions.cannotInstall,
    };
  }
  if (state.turn.step === "force-quit" && !state.turn.forceQuitComplete) {
    const evaluated = runtime.forceQuit(structuredClone(state));
    const inPlay = [
      ...state.arena,
      ...state.environment,
      ...state.players.flatMap((player) => player.zones.ramBank),
    ];
    return {
      ...common,
      type: "force-quit",
      candidates: inPlay.filter(
        (id) =>
          state.objects[id].controller === view.seat &&
          evaluated.canForceQuit(structuredClone(state), id),
      ),
    };
  }
  return null;
}
