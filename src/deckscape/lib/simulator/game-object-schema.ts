import { z } from "zod";
import { copiedAbilitySchema } from "./copied-abilities";
import { tokenCopyOverridesSchema } from "./token-copy-schema";

const id = z.string().min(1);
const nonnegative = z.number().int().nonnegative();
const seat = z.union([z.literal(0), z.literal(1)]);

/** Shared by canonical state and server-private event snapshots. */
export const gameObjectSchema = z
  .object({
    token: z.boolean(),
    scriptCopy: z.literal(true).optional(),
    id,
    incarnation: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    timestamp: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    definitionVersion: z.string().regex(/^[a-f0-9]{64}$/),
    owner: seat,
    controller: seat,
    running: z.boolean(),
    abilitySpent: z.boolean(),
    faceDown: z.boolean(),
    setRamCost: nonnegative.max(Number.MAX_SAFE_INTEGER).optional(),
    copiedAbility: copiedAbilitySchema.optional(),
    tokenCopyOverrides: tokenCopyOverridesSchema.optional(),
    trojanPlayedTurn: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    damage: z.object({ MF: nonnegative, BF: nonnegative }).strict(),
    lastDamageSourceId: id.nullable(),
    lastDamageController: z
      .union([z.literal(0), z.literal(1)])
      .nullable()
      .optional(),
    lastDamagedTurn: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .nullable(),
    counters: z.record(id, nonnegative),
    attachments: z.array(
      z
        .object({
          hostId: id,
          kind: z.enum(["gear", "protocol", "ram"]),
          port: z.enum(["head", "body", "leftArm", "rightArm"]).optional(),
        })
        .strict(),
    ),
  })
  .strict()
  .refine(
    (object) => !object.tokenCopyOverrides || object.token,
    "Copy overrides require a token",
  );
