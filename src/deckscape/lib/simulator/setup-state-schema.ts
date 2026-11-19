import { z } from "zod";
import type { SetupDeck, SetupState } from "./setup";

const seat = z.union([z.literal(0), z.literal(1)]),
  id = z.string().min(1);
const startingHealth = z
  .number()
  .int()
  .refine((value): boolean => value === 20);
const player = z
  .object({
    userId: id,
    mainframe: id,
    cyberdeck: z.array(id),
    ramDeck: z.array(id),
    hand: z.array(id).max(5),
    mainframeHealth: startingHealth,
    bioframeHealth: startingHealth,
  })
  .strict();
export const setupStateSchema = z
  .object({
    revision: z.number().int().min(0).max(3),
    openingRolls: z.array(z.tuple([
      z.number().int().min(1).max(20),
      z.number().int().min(1).max(20),
    ])).min(1).optional().nullable(),
    random: z
      .object({
        algorithm: z.literal("hmac-sha256-counter-v1"),
        seed: z.string().regex(/^[a-f0-9]{64}$/),
        counter: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      })
      .strict(),
    instances: z.record(
      id,
      z
        .object({
          definitionVersion: z.string().regex(/^[a-f0-9]{64}$/),
          owner: seat,
        })
        .strict(),
    ),
    players: z.tuple([player, player]),
    decision: z.discriminatedUnion("type", [
      z.object({ type: z.literal("choose-starter"), seat }).strict(),
      z.object({ type: z.literal("mulligan"), seat }).strict(),
      z.object({ type: z.literal("ready") }).strict(),
    ]),
    startingPlayer: seat.nullable(),
  })
  .strict()
  .superRefine((state, ctx) => {
    const fail = () =>
      ctx.addIssue({ code: "custom", message: "Invalid saved setup" });
    if (state.players[0].userId === state.players[1].userId) fail();
    if (state.openingRolls?.length) {
      const final = state.openingRolls.at(-1)!;
      if (
        final[0] === final[1] ||
        state.openingRolls.slice(0, -1).some(([a, b]) => a !== b) ||
        (state.revision === 0 &&
          (state.decision.type !== "choose-starter" ||
            state.decision.seat !== (final[0] > final[1] ? 0 : 1)))
      ) fail();
    }
    if (
      state.revision === 0
        ? state.decision.type !== "choose-starter" ||
          state.startingPlayer !== null
        : state.startingPlayer === null ||
          (state.revision === 3
            ? state.decision.type !== "ready"
            : state.decision.type !== "mulligan" ||
              state.decision.seat !==
                (state.revision === 1
                  ? state.startingPlayer
                  : 1 - state.startingPlayer))
    )
      fail();
    const placed: string[] = [];
    for (const [index, player] of state.players.entries()) {
      if (player.hand.length !== (state.revision === 0 ? 0 : 5)) fail();
      const zones = [
        player.mainframe,
        ...player.cyberdeck,
        ...player.ramDeck,
        ...player.hand,
      ];
      if (zones.some((card) => state.instances[card]?.owner !== index)) fail();
      placed.push(...zones);
    }
    if (
      new Set(placed).size !== placed.length ||
      placed.length !== Object.keys(state.instances).length
    )
      fail();
  });

/** Confirm saved identities still refer to exactly the admitted decks, including zone families. */
export function validateSetupDecks(
  state: SetupState,
  users: readonly [string, string],
  decks: readonly [SetupDeck, SetupDeck],
) {
  for (const [seat, deck] of decks.entries()) {
    const player = state.players[seat];
    if (
      player.userId !== users[seat] ||
      player.mainframe !== `${seat}:mainframe:0` ||
      state.instances[player.mainframe]?.definitionVersion !== deck.mainframe
    )
      throw new Error("Setup mainframe or player pin mismatch");
    for (const [section, versions, actual] of [
      ["cyberdeck", deck.cyberdeck, [...player.cyberdeck, ...player.hand]],
      ["ram-deck", deck.ramDeck, player.ramDeck],
    ] as const) {
      const expected = versions.map((version, index) => {
        const id = `${seat}:${section}:${index}`;
        if (
          state.instances[id]?.definitionVersion !== version ||
          state.instances[id]?.owner !== seat
        )
          throw new Error("Setup definition pin mismatch");
        return id;
      });
      if (
        actual.length !== expected.length ||
        actual.some((id) => !expected.includes(id))
      )
        throw new Error("Setup deck identity mismatch");
    }
  }
}
