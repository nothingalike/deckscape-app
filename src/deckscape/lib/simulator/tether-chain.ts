import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";

/** Effective TETHER links form undirected chains. Duplicate links and cycles do
 * not count a character twice; a departed host no longer joins two components. */
export function tetherChains(
  state: GameState,
  cards: ReadonlyMap<string, CardCharacteristics>,
  hasTether: (id: string) => boolean,
): ReadonlyMap<string, ReadonlySet<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const id of state.arena) {
    const card = cards.get(id);
    if (!card) throw new Error("Missing tether characteristics");
    if (card.cardType === "character") adjacency.set(id, new Set());
  }
  for (const id of state.arena) {
    if (!hasTether(id)) continue;
    const hosts = state.objects[id].attachments
      .filter(
        (link) =>
          link.kind === "gear" &&
          (link.port === "leftArm" || link.port === "rightArm"),
      )
      .map((link) => link.hostId);
    if (
      hosts.length !== 2 ||
      hosts[0] === hosts[1] ||
      hosts.some((host) => !adjacency.has(host))
    )
      continue;
    adjacency.get(hosts[0])!.add(hosts[1]);
    adjacency.get(hosts[1])!.add(hosts[0]);
  }
  const result = new Map<string, ReadonlySet<string>>();
  for (const root of adjacency.keys()) {
    if (result.has(root)) continue;
    const found = new Set<string>(),
      pending = [root];
    while (pending.length) {
      const id = pending.pop()!;
      if (found.has(id)) continue;
      found.add(id);
      pending.push(...adjacency.get(id)!);
    }
    for (const id of found) result.set(id, found);
  }
  return result;
}
