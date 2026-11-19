import { assertGameZones, type GameState } from "./game-state";
import { advanceObjectIncarnation } from "./object-incarnation";
import type { CardCharacteristics } from "./characteristics";
import { compatibleGearPorts, type PortRegion } from "./ports";
import type { Seat } from "./setup";
import { changePersistentControl } from "./control";
import type { GearHostOption } from "./gear-play-option";

export interface GearLink {
  hostId: string;
  port: PortRegion;
}
export class IllegalAttachment extends Error {}
export interface AttachmentEvaluation {
  afterAttach?(state: GameState): GameState;
  observeAttachment?: boolean;
  /** Effective per-instance characteristics after continuous effects. */
  characteristics: ReadonlyMap<string, CardCharacteristics>;
  malicious: boolean;
  tether: boolean;
  /** Targeting restrictions such as cloaked are evaluated by the interpreter. */
  permittedHosts: ReadonlySet<string>;
}

/** For an explicitly resolved attach-and-gain-control effect. Validate its complete
 * result before exposing either change to SBAs. This does not grant malicious.
 */
export function attachGearAndGainControl(
  state: GameState,
  sourceId: string,
  controller: Seat,
  gearId: string,
  links: readonly GearLink[],
  evaluated: AttachmentEvaluation,
): GameState {
  if (!state.arena.includes(gearId))
    throw new IllegalAttachment("Control effect requires in-play gear");
  // Check ordinary attachment legality against the effect's resulting controller.
  const candidate = structuredClone(state);
  const previousController = candidate.objects[gearId].controller;
  candidate.objects[gearId].controller = controller;
  const attached = attachGear(candidate, gearId, links, evaluated);
  attached.objects[gearId].controller = previousController;
  return changePersistentControl(
    attached,
    sourceId,
    [{ instanceId: gearId, controller }],
    evaluated.characteristics,
  );
}

function availableGear(
  state: GameState,
  gearId: string,
  evaluated: AttachmentEvaluation,
) {
  const gear = state.objects[gearId];
  const card = evaluated.characteristics.get(gearId);
  if (
    state.outcome ||
    !gear ||
    card?.cardType !== "gear" ||
    (!state.arena.includes(gearId) && !state.cache.includes(gearId))
  )
    throw new IllegalAttachment("Gear is not available to attach");
  return { gear, card };
}

function hostPorts(
  state: GameState,
  gearId: string,
  hostId: string,
  evaluated: AttachmentEvaluation,
): { ports: PortRegion[]; reason: string | null } {
  const { gear, card } = availableGear(state, gearId, evaluated);
  const host = state.objects[hostId],
    hostCard = evaluated.characteristics.get(hostId);
  if (
    !host ||
    hostCard?.cardType !== "character" ||
    !state.arena.includes(hostId) ||
    !evaluated.permittedHosts.has(hostId)
  )
    return { ports: [], reason: "Illegal gear target" };
  if (!evaluated.malicious && host.controller !== gear.controller)
    return { ports: [], reason: "Gear and character controllers differ" };
  const occupied = state.arena
    .filter((id) => id !== gearId)
    .flatMap((id) =>
      state.objects[id].attachments
        .filter(
          (link) => link.kind === "gear" && link.hostId === hostId && link.port,
        )
        .map((link) => link.port!),
    );
  return {
    reason: null,
    ports: compatibleGearPorts(hostCard.ports, card.ports, occupied).filter(
      (port) => !evaluated.tether || port === "leftArm" || port === "rightArm",
    ),
  };
}

/** Components of the public attachment graph; candidate gear is excluded on reattachment. */
function gearChains(state: GameState, gearId: string): Map<string, number> {
  const adjacency = new Map<string, string[]>();
  for (const id of state.arena) {
    if (id === gearId) continue;
    const hosts = state.objects[id].attachments
      .filter((link) => link.kind === "gear")
      .map((link) => link.hostId);
    if (hosts.length !== 2) continue;
    adjacency.set(hosts[0], [...(adjacency.get(hosts[0]) ?? []), hosts[1]]);
    adjacency.set(hosts[1], [...(adjacency.get(hosts[1]) ?? []), hosts[0]]);
  }
  const chains = new Map<string, number>();
  let chain = 0;
  for (const root of state.arena) {
    if (chains.has(root)) continue;
    const pending = [root];
    while (pending.length) {
      const id = pending.pop()!;
      if (chains.has(id)) continue;
      chains.set(id, chain);
      pending.push(...(adjacency.get(id) ?? []));
    }
    chain++;
  }
  return chains;
}

/** Linear-size attachment choices. Tethers require two hosts in different components;
 * no pair enumeration or mutation is needed to describe every legal placement.
 */
export function legalGearHosts(
  state: GameState,
  gearId: string,
  evaluated: AttachmentEvaluation,
): GearHostOption[] {
  availableGear(state, gearId, evaluated);
  const chains = gearChains(state, gearId);
  return state.arena.flatMap((hostId) => {
    const { ports } = hostPorts(state, gearId, hostId, evaluated);
    return ports.length ? [{ hostId, ports, chain: chains.get(hostId)! }] : [];
  });
}

/** CR 209/304/702.14. Candidate gear is excluded when checking a reattachment. */
export function attachGear(
  state: GameState,
  gearId: string,
  links: readonly GearLink[],
  evaluated: AttachmentEvaluation,
): GameState {
  availableGear(state, gearId, evaluated);
  if (
    links.length !== (evaluated.tether ? 2 : 1) ||
    new Set(links.map((link) => link.hostId)).size !== links.length
  )
    throw new IllegalAttachment("Invalid number of distinct gear hosts");
  for (const link of links) {
    const { ports, reason } = hostPorts(state, gearId, link.hostId, evaluated);
    if (reason) throw new IllegalAttachment(reason);
    if (evaluated.tether && link.port !== "leftArm" && link.port !== "rightArm")
      throw new IllegalAttachment("Tethers require arm ports");
    if (!ports.includes(link.port))
      throw new IllegalAttachment(
        "Gear port is absent, occupied or too low level",
      );
  }
  if (evaluated.tether) {
    const chains = gearChains(state, gearId);
    if (chains.get(links[0].hostId) === chains.get(links[1].hostId))
      throw new IllegalAttachment("Tether would close a chain");
  }
  const next = structuredClone(state);
  next.cache = next.cache.filter((id) => id !== gearId);
  if (!next.arena.includes(gearId)) {
    next.arena.push(gearId);
    advanceObjectIncarnation(next, gearId, true);
  }
  next.objects[gearId].attachments = links.map((link) => ({
    ...link,
    kind: "gear",
  }));
  for (const link of evaluated.observeAttachment ? links : []) {
    if (
      state.arena.includes(gearId) &&
      state.objects[gearId].attachments.some(
        (old) => old.kind === "gear" && old.hostId === link.hostId,
      )
    )
      continue;
    next.pendingRuleEvents.push({
      type: "gear-attached",
      instanceId: gearId,
      player: next.objects[gearId].controller,
      hostId: link.hostId,
      hostIncarnation: next.objects[link.hostId].incarnation,
      hostController: next.objects[link.hostId].controller,
      observers: [
        ...next.arena,
        ...next.environment,
        ...next.players.flatMap((p) => [
          ...p.zones.mainframe,
          ...p.zones.ramBank,
        ]),
      ].map((id) => structuredClone(next.objects[id])),
    });
  }
  assertGameZones(next);
  return evaluated.afterAttach?.(next) ?? next;
}
