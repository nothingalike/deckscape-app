import { z } from "zod";
import type { GameState } from "./game-state";

const id = z.string().min(1);
export const programPlayRecordSchema = z
  .object({
    turn: z.number().int().positive(),
    player: z.union([z.literal(0), z.literal(1)]),
    actionId: id,
    instanceId: id,
    incarnation: z.number().int().nonnegative(),
    definitionVersion: z.string().regex(/^[a-f0-9]{64}$/),
    factions: z.array(id),
    tags: z.array(id),
  })
  .strict();
export type ProgramPlayRecord = z.infer<typeof programPlayRecordSchema>;

/** Null represents a legacy snapshot with unknown earlier plays, never an empty history. */
export function validateProgramHistory(state: GameState) {
  if (state.programHistory === null) return;
  if (
    new Set(state.programHistory.map((play) => play.actionId)).size !==
      state.programHistory.length ||
    state.programHistory.some(
      (play) =>
        play.turn > state.turn.number ||
        new Set(play.factions).size !== play.factions.length ||
        new Set(play.tags).size !== play.tags.length,
    )
  )
    throw new Error("Invalid saved program history");
}
