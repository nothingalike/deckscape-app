import { z } from "zod";
import { programPlayRecordSchema } from "./program-history";
import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { Seat } from "./setup";

export const cardPlayRecordSchema = programPlayRecordSchema.extend({
  cardType: z.enum(["character", "gear", "program"]),
});
export type CardPlayRecord = z.infer<typeof cardPlayRecordSchema>;
/** Called only after a successful paid play. Resolution, installation and entry do not count. */
export function recordCardPlay(
  state: GameState,
  id: string,
  player: Seat,
  card: CardCharacteristics,
) {
  if (state.cardPlayHistory == null) return; // Legacy history remains unknown.
  if (
    card.cardType !== "character" &&
    card.cardType !== "gear" &&
    card.cardType !== "program"
  )
    throw Error("Invalid played card type");
  const object = state.objects[id];
  state.cardPlayHistory.push({
    turn: state.turn.number,
    player,
    actionId: `play:${state.revision}:${id}`,
    instanceId: id,
    incarnation: object.incarnation,
    definitionVersion: object.definitionVersion,
    factions: [...new Set(card.factions)],
    tags: [...new Set(card.tags)],
    cardType: card.cardType,
  });
}
export function validateCardPlayHistory(state: GameState) {
  const history = state.cardPlayHistory;
  if (history == null) return;
  if (
    new Set(history.map((p) => p.actionId)).size !== history.length ||
    history.some(
      (p) =>
        p.turn > state.turn.number ||
        new Set(p.factions).size !== p.factions.length ||
        new Set(p.tags).size !== p.tags.length,
    )
  )
    throw Error("Invalid saved card play history");
}
