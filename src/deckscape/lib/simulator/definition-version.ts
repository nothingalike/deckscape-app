import { createHash } from "node:crypto";
import { z } from "zod";
import { characteristicsSchema } from "./characteristics";

const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);

export const definitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    cardId: z.uuid(),
    rulesVersion: z.string().min(1),
    engineVersion: z.string().min(1),
    characteristics: characteristicsSchema,
    artwork: z
      .object({
        path: z.string().regex(/^[a-f0-9-]{36}\/[a-f0-9]{64}\.(webp|png|jpg)$/),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .optional(),
    handlers: z.array(
      z
        .object({
          id: z.string().min(1),
          version: z.number().int().positive(),
          parameters: z.record(z.string(), jsonValue),
        })
        .strict(),
    ),
    support: z.enum(["unimplemented", "implemented", "verified"]),
  })
  .strict();

export type SimulatorDefinition = z.infer<typeof definitionSchema>;
export interface EngineManifest {
  version: string;
  handlers: ReadonlyMap<string, ReadonlySet<number>>;
  /** Cards whose complete behavior is implemented, including vanilla cards. */
  implementedCards: ReadonlySet<string>;
  /** Card integration suites passed for this exact engine release. */
  verifiedCards: ReadonlySet<string>;
}

/** Sort object keys only: array order may encode effect/choice order. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

export function versionDefinition(input: unknown, engine: EngineManifest) {
  const definition = definitionSchema.parse(input);
  if (
    definition.artwork &&
    !definition.artwork.path.startsWith(
      `${definition.cardId}/${definition.artwork.sha256}.`,
    )
  )
    throw new Error("Artwork path must match its card and content hash");
  if (definition.engineVersion !== engine.version)
    throw new Error("Definition targets a different engine version");
  for (const handler of definition.handlers) {
    if (!engine.handlers.get(handler.id)?.has(handler.version))
      throw new Error(
        `Unknown handler version: ${handler.id}@${handler.version}`,
      );
  }
  if (
    definition.support !== "unimplemented" &&
    !engine.implementedCards.has(definition.cardId)
  )
    throw new Error("Card has no complete implementation in this engine");
  if (
    definition.support === "verified" &&
    !engine.verifiedCards.has(definition.cardId)
  )
    throw new Error("Card has no verified integration coverage in this engine");
  const serialized = canonical(definition);
  return {
    version: createHash("sha256").update(serialized).digest("hex"),
    definition,
    serialized,
  };
}

/** Pure publication preview. Existing snapshots remain byte-for-byte intact. */
export function planDefinitionVersions(
  inputs: readonly unknown[],
  engine: EngineManifest,
  existing: ReadonlyMap<string, string>,
) {
  const additions = new Map<string, string>();
  const cardVersions = new Map<string, string>();
  for (const input of inputs) {
    const candidate = versionDefinition(input, engine);
    if (cardVersions.has(candidate.definition.cardId))
      throw new Error(
        `Duplicate card definition: ${candidate.definition.cardId}`,
      );
    cardVersions.set(candidate.definition.cardId, candidate.version);
    const previous = existing.get(candidate.version);
    if (previous !== undefined && previous !== candidate.serialized)
      throw new Error(
        "Immutable definition version conflicts with existing content",
      );
    if (previous === undefined)
      additions.set(candidate.version, candidate.serialized);
  }
  return { additions, cardVersions };
}
