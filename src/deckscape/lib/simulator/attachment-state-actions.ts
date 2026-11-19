import type { CardCharacteristics } from "./characteristics";
import type { GameState } from "./game-state";
import type { PersistentDeparture } from "./destruction";

export interface AttachmentStateEvaluation {
  /** Effective characteristics and keywords, never inferred from rules prose. */
  characteristics: ReadonlyMap<string, CardCharacteristics>;
  malicious: ReadonlySet<string>;
  tether: ReadonlySet<string>;
  canDestroy: ReadonlySet<string>;
}
export interface AttachmentStatePlan {
  departures: PersistentDeparture[];
  /** CR 702.14 takes precedence over ordinary host-departure destruction.
   * Two departed hosts require the tether controller's choice before applying the batch.
   */
  tetherFollowers: { id: string; departedHosts: string[] }[];
}

/** Collect from one unchanged snapshot; caller combines with other simultaneous SBAs and
 * evaluates movement replacements before applying the complete departure batch.
 * Targeting restrictions are intentionally not reapplied to existing attachments (113.3d).
 */
export function planAttachmentStateActions(
  state: GameState,
  evaluated: AttachmentStateEvaluation,
): AttachmentStatePlan {
  const result: AttachmentStatePlan = { departures: [], tetherFollowers: [] };
  const arena = new Set(state.arena);
  const mainframes = new Set(
    state.players.flatMap((player) => player.zones.mainframe),
  );
  const destroyOrBin = (id: string) =>
    result.departures.push(
      evaluated.canDestroy.has(id)
        ? { id, kind: "destroy", sourceId: null, reason: "normal" }
        : { id, kind: "bin" },
    );
  for (const id of state.arena) {
    const object = state.objects[id];
    const card = evaluated.characteristics.get(id);
    if (!card) throw new Error(`Missing attachment characteristics: ${id}`);
    if (card.cardType === "gear") {
      const links = object.attachments.filter((link) => link.kind === "gear");
      const tether = evaluated.tether.has(id);
      const departedHosts = links
        .filter((link) => !arena.has(link.hostId))
        .map((link) => link.hostId);
      if (tether && departedHosts.length) {
        result.tetherFollowers.push({
          id,
          departedHosts: [...new Set(departedHosts)],
        });
        continue;
      }
      if (departedHosts.length) {
        destroyOrBin(id);
        continue;
      }
      if (
        links.length !== (tether ? 2 : 1) ||
        new Set(links.map((link) => link.hostId)).size !== links.length
      ) {
        result.departures.push({ id, kind: "bin" });
        continue;
      }
      let illegalHost = false,
        bin = false;
      for (const link of links) {
        const host = state.objects[link.hostId];
        const hostCard = evaluated.characteristics.get(link.hostId);
        if (!hostCard)
          throw new Error(`Missing host characteristics: ${link.hostId}`);
        if (hostCard.cardType !== "character") {
          illegalHost = true;
          continue;
        }
        if (
          (!evaluated.malicious.has(id) &&
            host.controller !== object.controller) ||
          !link.port ||
          card.ports[link.port] === 0 ||
          hostCard.ports[link.port] < card.ports[link.port]
        )
          bin = true;
      }
      if (bin) result.departures.push({ id, kind: "bin" });
      else if (illegalHost) destroyOrBin(id);
    } else if (card.cardType === "program" && card.subtype === "protocol") {
      const links = object.attachments.filter(
        (link) => link.kind === "protocol",
      );
      if (links.length !== 1 || !mainframes.has(links[0].hostId))
        destroyOrBin(id);
      // Entry capacity and controller restrictions do not become continuous target checks.
    }
  }
  return result;
}
