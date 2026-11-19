import { createHash } from "node:crypto";
import type { GameState } from "./game-state";
import type { PersistentDeparture } from "./destruction";
import { chooseOptionalDeparture } from "./counter-replacement-continuation";
import { payPlayerHealth } from "./health";
export const frenziedFanId = "b0a39dc5-61ff-4c27-b987-6c0b585675e5";
function canonical(x: unknown): string {
  if (Array.isArray(x)) return "[" + x.map(canonical).join(",") + "]";
  if (x && typeof x === "object")
    return (
      "{" +
      Object.entries(x)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(x);
}
export function replaceFrenziedFan(
  state: GameState,
  intents: readonly PersistentDeparture[],
  version: string | undefined,
  hasAbility: (s: GameState, id: string) => boolean,
) {
  let next = state;
  const departures = intents.map((i) => structuredClone(i));
  const ordered = departures
    .map((intent, index) => ({ intent, index }))
    .sort(
      (a, b) =>
        Number(
          state.objects[a.intent.id].controller !== state.turn.activePlayer,
        ) -
        Number(
          state.objects[b.intent.id].controller !== state.turn.activePlayer,
        ),
    );
  for (const { intent, index } of ordered) {
    // PROVISIONAL_RULING: destruction paid as a cost bypasses Fan; official follow-up pending.
    if (
      intent.kind !== "destroy" ||
      intent.reason === "cost" ||
      !version ||
      !next.arena.includes(intent.id) ||
      next.objects[intent.id].definitionVersion !== version ||
      !hasAbility(next, intent.id)
    )
      continue;
    const player = next.objects[intent.id].controller,
      p = next.players[player];
    if (p.mainframeHealth < 2 || p.bioframeHealth < 2) continue;
    const fingerprint = createHash("sha256")
      .update(
        canonical({
          state: next,
          intents: departures,
          index,
          kind: "frenzied-fan",
        }),
      )
      .digest("hex");
    if (!chooseOptionalDeparture(next, intent.id, player, fingerprint))
      continue;
    next = payPlayerHealth(next, intent.id, [
      { player, channel: "MF", amount: 2 },
      { player, channel: "BF", amount: 2 },
    ]);
    departures[index] = { id: intent.id, kind: "move", destination: "hand" };
  }
  return { state: next, departures };
}
