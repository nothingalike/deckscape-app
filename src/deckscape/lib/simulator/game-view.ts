import { projectGameLog, projectPublicGameLog } from "./game-log";
import { isEndgameRevealed } from "./endgame-reveal";
import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { CacheAction } from "./priority";
import { projectCardInspection } from "./card-inspection";

export interface GameVisibility {
  canInspectOpponentHand?(state: GameState, viewer: Seat): boolean;
  canInspectCyberdeckTop?(state: GameState, viewer: Seat): boolean;
  /** Trusted visibility evaluator for explicit face-down inspection permissions. */
  canInspectFaceDown(
    state: GameState,
    instanceId: string,
    viewer: Seat,
  ): boolean;
}

/** Allowlist projection. Canonical snapshots, pending events, and private random state are
 * never client responses. Legal choices are supplied separately by the decision evaluator.
 */
export function projectGame(
  state: GameState,
  userId: string,
  visibility: GameVisibility,
) {
  const seat = state.players.findIndex((player) => player.userId === userId);
  if (seat !== 0 && seat !== 1) throw new Error("Not a match participant");
  return projectGameForViewer(state, seat as Seat, visibility, false);
}

/** Public-only projection for a neutral viewer. Seat 0 controls board orientation only. */
export function projectSpectatorGame(
  state: GameState,
  visibility: GameVisibility,
) {
  return projectGameForViewer(state, 0, visibility, true);
}

function projectGameForViewer(
  state: GameState,
  seat: Seat,
  visibility: GameVisibility,
  spectator: boolean,
) {
  const publicIds = new Set([
    ...state.arena,
    ...state.environment,
    ...state.cache,
    ...state.players.flatMap((player) => [
      ...player.zones.mainframe,
      ...player.zones.ramBank,
      ...player.zones.recycleBin,
      ...player.zones.purge,
    ]),
  ]);
  const top = !spectator && visibility.canInspectCyberdeckTop?.(structuredClone(state), seat)
    ? state.players[seat].zones.cyberdeck[0]
    : undefined;
  const revealedHands = state.players.map((player, index) => {
    const viewer = spectator ? ((1 - index) as Seat) : seat;
    return (spectator || index !== seat) &&
      visibility.canInspectOpponentHand?.(structuredClone(state), viewer)
      ? player.zones.hand
      : undefined;
  });
  const visibleIds = new Set([
    ...revealedHands.flatMap((hand) => hand ?? []),
    ...publicIds,
    ...(!spectator ? state.players[seat].zones.hand : []),
    ...(top ? [top] : []),
  ]);
  const priorityActions = state.priorityWindow
    ? [
        ...state.priorityWindow.stack,
        ...state.priorityWindow.triggers,
        ...(state.priorityWindow.resolving
          ? [state.priorityWindow.resolving]
          : []),
      ]
    : [];
  const actionIds = new Set(priorityActions.map((item) => item.id));
  const card = (instanceId: string, inOwnHand = false) => {
    const object = state.objects[instanceId];
    if (!object) throw new Error("Missing visible object");
    const inspect =
      !object.faceDown ||
      isEndgameRevealed(state, instanceId) ||
      (!spectator && inOwnHand) ||
      (spectator
        ? ([0, 1] as const).every((viewer) =>
            visibility.canInspectFaceDown(
              structuredClone(state),
              instanceId,
              viewer,
            ),
          )
        : visibility.canInspectFaceDown(
            structuredClone(state),
            instanceId,
            seat,
          ));
    return {
      instanceId,
      token: object.token,
      owner: object.owner,
      controller: object.controller,
      faceDown: object.faceDown,
      running: object.running,
      abilitySpent: object.abilitySpent,
      damage: { ...object.damage },
      counters: { ...object.counters },
      attachments: object.attachments
        .filter((link) => publicIds.has(link.hostId))
        .map((link) => ({ ...link })),
      ...(inspect ? { definitionVersion: object.definitionVersion } : {}),
    };
  };
  const action = (item: CacheAction) => {
    const announcedObjects = [
      ...(item.gearTargets ?? []).map((link) => link.hostId),
      ...(item.protocolTarget ? [item.protocolTarget] : []),
      ...(item.programChoices?.targets ?? []),
      ...(item.activatedAbility?.choices.targets ?? []),
    ].filter((id) => Object.hasOwn(item.targetIncarnations ?? {}, id));
    const objectTarget = (id: string, group: string, port?: string) => {
      const captured = item.targetIncarnations?.[id];
      return visibleIds.has(id) &&
        captured !== undefined &&
        state.objects[id]?.incarnation === captured
        ? [{ type: "object" as const, id, group, ...(port ? { port } : {}) }]
        : [];
    };
    const targets = [
      ...(item.gearTargets ?? []).flatMap((link) =>
        objectTarget(link.hostId, "Gear attachment", link.port),
      ),
      ...(item.protocolTarget
        ? objectTarget(item.protocolTarget, "Mainframe attachment")
        : []),
      ...(item.programChoices?.targets ?? []).flatMap((id) =>
        objectTarget(id, "Program target"),
      ),
      ...(item.activatedAbility?.choices.targets ?? []).flatMap((id) =>
        objectTarget(id, "Ability target"),
      ),
      ...(item.programChoices?.playerTarget !== undefined
        ? [
            {
              type: "player" as const,
              player: item.programChoices.playerTarget,
              group: "Program target",
            },
          ]
        : []),
      ...(item.activatedAbility?.choices.playerTarget !== undefined
        ? [
            {
              type: "player" as const,
              player: item.activatedAbility.choices.playerTarget,
              group: "Ability target",
            },
          ]
        : []),
      ...[
        item.programChoices?.cacheActionId,
        item.activatedAbility?.choices.cacheActionId,
      ].flatMap((id) =>
        id && actionIds.has(id)
          ? [{ type: "cache-action" as const, id, group: "Cache target" }]
          : [],
      ),
    ];
    const sourceIsCurrent =
      visibleIds.has(item.sourceId) &&
      (item.sourceIncarnation === undefined ||
        state.objects[item.sourceId]?.incarnation === item.sourceIncarnation);
    return {
      id: item.id,
      kind: item.kind,
      controller: item.controller,
      ...(sourceIsCurrent ? { sourceId: item.sourceId } : {}),
      targets,
      ...(announcedObjects.length >
      targets.filter((target) => target.type === "object").length
        ? {
            unavailableTargetCount:
              announcedObjects.length -
              targets.filter((target) => target.type === "object").length,
          }
        : {}),
    };
  };
  return {
    gameLog: spectator
      ? projectPublicGameLog(state)
      : projectGameLog(state, seat),
    revision: state.revision,
    reveals: state.reveals.map((reveal) => ({
      player: reveal.player,
      definitionVersion: reveal.definitionVersion,
      ...projectCardInspection(reveal.characteristics),
    })),
    seat: seat as Seat,
    rulesVersion: state.rulesVersion,
    engineVersion: state.engineVersion,
    turn: {
      number: state.turn.number,
      activePlayer: state.turn.activePlayer,
      step: state.turn.step,
    },
    outcome: state.outcome ? { ...state.outcome } : null,
    triggerOrder:
      !state.outcome && !state.triggersOrdered
        ? {
            player: state.turn.activePlayer,
            count: state.pendingTriggers.length - state.triggerOrderStart,
          }
        : null,
    pendingDecision:
      state.pendingDecision && !state.outcome
        ? {
            type: state.pendingDecision.type,
            player: state.pendingDecision.player,
            ...(state.pendingDecision.type === "counter-payment"
              ? { ramCost: state.pendingDecision.ramCost }
              : {}),
            ...(visibleIds.has(state.pendingDecision.sourceId)
              ? { sourceId: state.pendingDecision.sourceId }
              : {}),
            ...(!spectator && seat === state.pendingDecision.player
              ? {
                  decisionId: state.pendingDecision.id,
                  ...(state.pendingDecision.type === "ram-balance"
                    ? {
                        hosts: state.pendingDecision.hosts.map((host) => ({
                          hostId: host.hostId,
                          required: host.required,
                          committed: [...host.committed],
                        })),
                        availableRam: [...state.pendingDecision.available],
                      }
                    : {}),
                  ...(state.pendingDecision.type === "tether-follow"
                    ? {
                        options: state.pendingDecision.options.map(
                          (option, index) => ({
                            index,
                            destination: option.destination,
                            ...(visibleIds.has(option.hostId)
                              ? { hostId: option.hostId }
                              : {}),
                          }),
                        ),
                      }
                    : {}),
                }
              : {}),
          }
        : null,
    players: state.players.map((player, index) => ({
      seat: index as Seat,
      mainframeHealth: player.mainframeHealth,
      bioframeHealth: player.bioframeHealth,
      cyberdeckCount: player.zones.cyberdeck.length,
      ramDeckCount: player.zones.ramDeck.length,
      handCount: player.zones.hand.length,
      mainframe: player.zones.mainframe.map((id) => card(id)),
      ramBank: player.zones.ramBank.map((id) => card(id)),
      recycleBin: player.zones.recycleBin.map((id) => card(id)),
      purge: player.zones.purge.map((id) => card(id)),
      ...(revealedHands[index]
        ? { revealedHand: revealedHands[index]!.map((id) => card(id, true)) }
        : {}),
      ...(!spectator && index === seat
        ? {
            hand: player.zones.hand.map((id) => card(id, true)),
            ...(top ? { cyberdeckTop: card(top, true) } : {}),
          }
        : {}),
    })),
    arena: state.arena.map((id) => card(id)),
    environment: state.environment.map((id) => card(id)),
    cache: state.cache.map((id) => card(id)),
    priority: state.priorityWindow
      ? {
          player: state.priorityWindow.priority,
          mode: state.priorityWindow.mode,
          stack: state.priorityWindow.stack.map(action),
          resolving: state.priorityWindow.resolving
            ? action(state.priorityWindow.resolving)
            : null,
        }
      : null,
    combat: state.combat
      ? {
          stage: state.combat.stage,
          attackers: state.combat.attackers.filter((id) => publicIds.has(id)),
          blockers: state.combat.blockers
            .filter(
              (assignment) =>
                publicIds.has(assignment.blockerId) &&
                publicIds.has(assignment.attackerId),
            )
            .map((assignment) => ({ ...assignment })),
        }
      : null,
  };
}
