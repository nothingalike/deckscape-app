import { z } from "zod";
import type { GameState } from "./game-state";
import type { Seat } from "./setup";
export const programReplayPermissionSchema = z
  .object({
    player: z.union([z.literal(0), z.literal(1)]),
    targetId: z.string().min(1),
    targetIncarnation: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER),
    expiresAfterTurn: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    purgeOnResolution: z.literal(true),
  })
  .strict();
export type ProgramReplayPermission = z.infer<
  typeof programReplayPermissionSchema
>;
export function replayPermission(
  state: GameState,
  player: Seat,
  id: string,
): ProgramReplayPermission | undefined {
  if (!state.players[player].zones.recycleBin.includes(id)) return undefined;
  return state.programReplayPermissions.find(
    (p) =>
      p.player === player &&
      p.targetId === id &&
      p.targetIncarnation === state.objects[id]?.incarnation &&
      p.expiresAfterTurn >= state.turn.number,
  );
}
/** The card resolver validates the target. Permission survives source departure,
 * but never a target zone change. Repeated identical grants are redundant. */
export function grantProgramReplay(
  state: GameState,
  player: Seat,
  id: string,
): GameState {
  if (
    state.outcome ||
    !state.players[player].zones.recycleBin.includes(id) ||
    !state.objects[id]
  )
    throw new Error("Replay target is unavailable");
  const next = structuredClone(state);
  if (!replayPermission(next, player, id))
    next.programReplayPermissions.push(
      programReplayPermissionSchema.parse({
        player,
        targetId: id,
        targetIncarnation: state.objects[id].incarnation,
        expiresAfterTurn: state.turn.number,
        purgeOnResolution: true,
      }),
    );
  return next;
}
export function programPlayOrigin(
  state: GameState,
  player: Seat,
  id: string,
  continuousPermission = false,
  fromCyberdeck = false,
): "hand" | "recycleBin" | "cyberdeck" | null {
  if (state.players[player].zones.hand.includes(id)) return "hand";
  if (fromCyberdeck && state.players[player].zones.cyberdeck[0] === id)
    return "cyberdeck";
  return replayPermission(state, player, id) ||
    (continuousPermission &&
      state.players[player].zones.recycleBin.includes(id))
    ? "recycleBin"
    : null;
}
