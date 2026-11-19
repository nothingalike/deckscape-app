import { assertGameZones, type GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import {
  dispatchRuleEvent,
  type EventBehavior,
  type RuleTriggerDiscovery,
} from "./rule-events";
import { nextResolution, finishResolution } from "./priority";
import {
  performSystemCheck,
  enterRefresh,
  type SystemCheckEvaluation,
  type RefreshEvaluation,
} from "./initialize";
import { enterDrawInstall, finishDrawInstall } from "./turn-actions";
import { enterDeploy, beginDeployPriority } from "./force-quit";
import {
  enterNetcheck,
  enterCombat,
  beginCombatWindow,
  finishCombatWindow,
  canDeclareAttacker,
  canDeclareBlocker,
  declareAttackers,
  declareBlockers,
  type CombatEvaluation,
} from "./combat";
import {
  combatDamageGroups,
  resolveCombatDamage,
  type CombatDamageEvaluation,
} from "./combat-damage";
import {
  beginCombatEnd,
  enterReset,
  performResetCleanup,
  beginNextTurn,
} from "./reset";

export interface SettlementRuntime {
  log?(state: GameState): GameState;
  /** Performs one simultaneous SBA pass; decisions pause without skipping remaining work. */
  stateBasedActions(state: GameState): {
    state: GameState;
    changed: boolean;
    decisionPending: boolean;
  };
  eventBehaviors(state: GameState): ReadonlyMap<string, EventBehavior>;
  ruleTriggers?: RuleTriggerDiscovery;
  resolveTrigger(state: GameState): GameState;
  /** Handlers may suspend with a serialized pendingDecision and resume through a command. */
  resolveCache(state: GameState): GameState;
  /** Resume remaining instructions after post-damage SBAs, before queued triggers. */
  resumeCache?(state: GameState): GameState;
  systemCheck(state: GameState): SystemCheckEvaluation;
  refresh(state: GameState): RefreshEvaluation;
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  expireTurnEffects(state: GameState): GameState;
  combat?(state: GameState): CombatEvaluation;
  damage?(state: GameState): CombatDamageEvaluation;
}

/** Deterministic automatic processing between player decisions. No polling, clocks, or UI state.
 * The bound prevents an unsupported loop from blocking a request; it does not declare a draw.
 */
export function settleGame(
  state: GameState,
  runtime: SettlementRuntime,
  maxSteps = 10000,
): GameState {
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 1)
    throw new Error("Invalid settlement limit");
  const checkpoint = (state: GameState) => runtime.log?.(state) ?? state;
  let next = structuredClone(state);
  for (let step = 0; step < maxSteps; step++) {
    next = checkpoint(next);
    assertGameZones(next);
    if (next.outcome) return checkpoint(next);
    if (next.pendingDecision) return checkpoint(next);
    const sba = runtime.stateBasedActions(next);
    next = sba.state;
    if (next.outcome || sba.decisionPending) {
      assertGameZones(next);
      return checkpoint(next);
    }
    if (sba.changed) continue;
    if (next.resolutionContinuation) {
      if (!runtime.resumeCache)
        throw new Error("Cache continuation runtime unavailable");
      next = runtime.resumeCache(next);
      continue;
    }
    if (!next.triggersOrdered) return checkpoint(next);
    if (next.pendingRuleEvents.length) {
      next = dispatchRuleEvent(
        next,
        runtime.eventBehaviors(structuredClone(next)),
        runtime.ruleTriggers,
        runtime.characteristics,
      );
      continue;
    }
    if (next.pendingTriggers.length) {
      next = runtime.resolveTrigger(next);
      continue;
    }
    const window = next.priorityWindow;
    if (window?.resolving) {
      if (!window.resolutionApplied) {
        const actionId = window.resolving.id;
        next = runtime.resolveCache(next);
        if (next.outcome) return checkpoint(next);
        if (next.priorityWindow?.resolving?.id !== actionId)
          throw new Error("Cache handler changed the resolving action");
        next.priorityWindow.resolutionApplied = true;
      } else next.priorityWindow = finishResolution(window);
      continue;
    }
    if (window?.triggers.length || window?.mode === "drain") {
      next.priorityWindow = nextResolution(window);
      continue;
    }
    if (window?.mode === "priority") return checkpoint(next);
    if (window?.mode === "complete") {
      if (next.turn.step === "netcheck" && window.origin === "netcheck") {
        next.priorityWindow = null;
        continue;
      }
      next =
        next.turn.step === "deploy"
          ? enterNetcheck(next)
          : finishCombatWindow(next);
      continue;
    }
    switch (next.turn.step) {
      case "system-check":
        next = next.turn.systemCheckComplete
          ? enterRefresh(next, runtime.refresh(structuredClone(next)))
          : performSystemCheck(
              next,
              runtime.systemCheck(structuredClone(next)),
            );
        break;
      case "refresh":
        next = enterDrawInstall(next);
        break;
      case "draw-install":
        if (next.drawInstallRemaining > 0) return checkpoint(next);
        next = finishDrawInstall(next);
        break;
      case "force-quit":
        if (!next.turn.forceQuitComplete) return checkpoint(next);
        next = enterDeploy(next);
        break;
      case "deploy":
        next = beginDeployPriority(next);
        break;
      case "netcheck":
        next = enterCombat(next);
        break;
      case "combat":
        if (!next.combat) throw new Error("Missing combat state");
        if (next.combat.stage.endsWith("-window"))
          next = beginCombatWindow(next);
        else if (next.combat.stage === "attackers" && runtime.combat) {
          const evaluated = runtime.combat(structuredClone(next));
          const hasLegalAttacker = next.arena.some((id) =>
            canDeclareAttacker(next, id, evaluated),
          );
          if (hasLegalAttacker) return checkpoint(next);
          const revision = next.revision;
          next = declareAttackers(
            next,
            next.players[next.turn.activePlayer].userId,
            revision,
            [],
            evaluated,
          );
          next.revision = revision;
        } else if (next.combat.stage === "blockers" && runtime.combat) {
          const evaluated = runtime.combat(structuredClone(next));
          const defender = (1 - next.turn.activePlayer) as 0 | 1;
          const hasLegalBlock =
            next.combat.attackers.length > 0 &&
            next.arena.some((blockerId) =>
              next.combat!.attackers.some((attackerId) =>
                canDeclareBlocker(next, blockerId, attackerId, evaluated),
              ),
            );
          if (hasLegalBlock) return checkpoint(next);
          const revision = next.revision;
          next = declareBlockers(
            next,
            next.players[defender].userId,
            revision,
            [],
            evaluated,
          );
          next.revision = revision;
        } else if (next.combat.stage === "damage" && runtime.damage) {
          const evaluated = runtime.damage(structuredClone(next));
          const requiresSplit = combatDamageGroups(
            next,
            evaluated.characteristics,
            evaluated.overrun,
          ).some((group) => group.blockers.length > 1 && group.excess === 0);
          if (requiresSplit) return checkpoint(next);
          const revision = next.revision;
          next = resolveCombatDamage(
            next,
            next.players[next.turn.activePlayer].userId,
            revision,
            [],
            evaluated,
          );
          next.revision = revision;
        } else if (next.combat.stage === "damage-applied")
          next = beginCombatEnd(next);
        else if (next.combat.stage === "end") next = enterReset(next);
        else return checkpoint(next);
        break;
      case "reset":
        next = next.turn.resetComplete
          ? beginNextTurn(next)
          : performResetCleanup(
              next,
              runtime.characteristics(structuredClone(next)),
              runtime.expireTurnEffects.bind(runtime),
            );
        break;
    }
  }
  throw new Error(
    "Automatic resolution limit reached; game requires diagnostics",
  );
}
