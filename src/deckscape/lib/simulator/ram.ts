import type { GameState } from "./game-state";
import { advanceObjectIncarnation } from "./object-incarnation";
import type { Seat } from "./setup";
import type { CardCharacteristics } from "./characteristics";
import { recordPersistentRuns } from "./persistent-status";

export function availablePaymentRam(
  state: GameState,
  payer: Seat,
  definitions: ReadonlyMap<string, CardCharacteristics>,
): string[] {
  return state.players[payer].zones.ramBank.filter((id) => {
    const object = state.objects[id];
    return (
      !!object &&
      object.controller === payer &&
      !object.running &&
      !object.attachments.length &&
      definitions.get(object.definitionVersion)?.cardType === "ram"
    );
  });
}

/** Cost must already include all cost modifiers. No floating resource pool (CR 106). */
export function payRam(
  state: GameState,
  payer: Seat,
  cost: number,
  selected: readonly string[],
  definitions: ReadonlyMap<string, CardCharacteristics>,
  commitTo?: string,
  /** Other refreshed controlled sources run simultaneously with this RAM payment. */
  runSources: readonly string[] = [],
): GameState {
  if (
    !Number.isSafeInteger(cost) ||
    cost < 0 ||
    selected.length !== cost ||
    new Set(selected).size !== cost
  )
    throw new Error("Select exactly the required distinct RAM cards");
  if (state.outcome) throw new Error("Game already ended");
  const available = new Set(availablePaymentRam(state, payer, definitions));
  for (const id of selected) {
    if (!available.has(id))
      throw new Error(`RAM unavailable for payment: ${id}`);
  }
  const inPlay = new Set([
    ...state.arena,
    ...state.environment,
    ...state.players.flatMap((p) => [...p.zones.mainframe, ...p.zones.ramBank]),
  ]);
  if (
    new Set(runSources).size !== runSources.length ||
    runSources.some((id) => {
      const object = state.objects[id];
      return (
        !object ||
        !inPlay.has(id) ||
        object.controller !== payer ||
        object.running ||
        selected.includes(id) ||
        object.attachments.some((link) => link.kind === "ram")
      );
    })
  )
    throw new Error("Run-cost source unavailable");
  if (commitTo !== undefined) {
    const host = state.objects[commitTo];
    if (
      !host ||
      host.controller !== payer ||
      definitions.get(host.definitionVersion)?.cardType !== "character" ||
      (!state.arena.includes(commitTo) && !state.cache.includes(commitTo))
    )
      throw new Error("Invalid character commitment target");
  }
  const next = structuredClone(state);
  for (const id of runSources) next.objects[id].running = true;
  for (const id of selected) {
    const object = next.objects[id];
    object.running = commitTo === undefined;
    if (commitTo !== undefined) {
      object.attachments = [{ kind: "ram", hostId: commitTo }];
      if (next.arena.includes(commitTo)) {
        next.players[payer].zones.ramBank = next.players[
          payer
        ].zones.ramBank.filter((card) => card !== id);
        next.arena.push(id);
        advanceObjectIncarnation(next, id);
      }
    }
  }
  return recordPersistentRuns(next, [...selected, ...runSources], state);
}

/** CR 106.4b: committed RAM follows its character into the arena. */
export function moveCommittedRamToArena(
  state: GameState,
  hostId: string,
): GameState {
  if (!state.arena.includes(hostId))
    throw new Error("Character has not entered the arena");
  const next = structuredClone(state);
  for (const object of Object.values(next.objects)) {
    if (
      !object.attachments.some(
        (link) => link.kind === "ram" && link.hostId === hostId,
      )
    )
      continue;
    if (next.arena.includes(object.id)) continue;
    const bank = next.players.find((player) =>
      player.zones.ramBank.includes(object.id),
    );
    if (!bank) throw new Error("Committed RAM is not in a RAM bank or arena");
    bank.zones.ramBank = bank.zones.ramBank.filter((id) => id !== object.id);
    next.arena.push(object.id);
    advanceObjectIncarnation(next, object.id);
  }
  return next;
}

/** CR 106.4c-e / 501.5b. Host movement and triggers are handled by the caller. */
export function releaseCommittedRam(
  state: GameState,
  hostId: string,
  reason: "normal" | "force-quit",
): GameState {
  const next = structuredClone(state);
  for (const object of Object.values(next.objects)) {
    if (
      !object.attachments.some(
        (link) => link.kind === "ram" && link.hostId === hostId,
      )
    )
      continue;
    for (const player of next.players)
      player.zones.ramBank = player.zones.ramBank.filter(
        (id) => id !== object.id,
      );
    next.arena = next.arena.filter((id) => id !== object.id);
    object.attachments = [];
    object.running = reason !== "force-quit";
    object.controller = object.owner;
    next.players[object.owner].zones.ramBank.push(object.id);
    if (state.arena.includes(object.id))
      advanceObjectIncarnation(next, object.id);
  }
  return next;
}
