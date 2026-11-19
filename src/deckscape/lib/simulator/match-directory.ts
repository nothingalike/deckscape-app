import { z } from "zod";

/** Storage adapter: the desktop supplies the same metadata rows from its owned profile. */
export interface MatchDirectoryClient {
  rpc(name: string, input: { p_before_updated_at: string | null; p_before_id: string | null; p_limit: number }): Promise<{ data: unknown; error: unknown }>;
}

const timestamp = z.iso.datetime({ offset: true });
export const matchDirectoryCursorSchema = z
  .object({
    updatedAt: timestamp,
    id: z.uuid(),
  })
  .strict();
export type MatchDirectoryCursor = z.infer<typeof matchDirectoryCursorSchema>;
const rowSchema = z
  .object({
    id: z.uuid(),
    seat: z.union([z.literal(0), z.literal(1)]),
    engine_version: z.string().min(1),
    rules_version: z.string().min(1),
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    updated_at: timestamp,
  })
  .strict();
export interface UnfinishedMatch {
  id: string;
  seat: 0 | 1;
  engineVersion: string;
  rulesVersion: string;
  revision: number;
  updatedAt: string;
  title?: string;
  stage?: 'setup' | 'game';
  compatibility?: { ok: boolean; message?: string };
}
export interface UnfinishedMatchPage {
  matches: UnfinishedMatch[];
  nextCursor: MatchDirectoryCursor | null;
}

/** Read metadata through the owned profile's directory adapter. */
export async function listUnfinishedMatches(
  client: MatchDirectoryClient,
  cursor: MatchDirectoryCursor | null = null,
  pageSize = 20,
): Promise<UnfinishedMatchPage> {
  z.number().int().min(1).max(50).parse(pageSize);
  const parsed =
    cursor === null ? null : matchDirectoryCursorSchema.parse(cursor);
  const { data, error } = await client.rpc(
    "list_unfinished_simulator_matches",
    {
      p_before_updated_at: parsed?.updatedAt ?? null,
      p_before_id: parsed?.id ?? null,
      p_limit: pageSize + 1,
    },
  );
  if (error) throw new Error("Unfinished games unavailable");
  const rows = z
    .array(rowSchema)
    .max(pageSize + 1)
    .parse(data);
  if (new Set(rows.map((row) => row.id)).size !== rows.length)
    throw new Error("Duplicate unfinished match");
  const matches = rows.slice(0, pageSize).map((row) => ({
    id: row.id,
    seat: row.seat,
    engineVersion: row.engine_version,
    rulesVersion: row.rules_version,
    revision: row.revision,
    updatedAt: row.updated_at,
  }));
  const last = matches.at(-1);
  return {
    matches,
    nextCursor:
      rows.length > pageSize && last
        ? { id: last.id, updatedAt: last.updatedAt }
        : null,
  };
}
