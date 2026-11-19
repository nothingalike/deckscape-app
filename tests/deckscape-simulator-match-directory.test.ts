import test from "node:test";
import assert from "node:assert/strict";
import type { MatchDirectoryClient } from "../src/deckscape/lib/simulator/match-directory";
import { listUnfinishedMatches } from "../src/deckscape/lib/simulator/match-directory";

const rows = [1, 2, 3].map((n) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  seat: n % 2,
  engine_version: "retained-engine",
  rules_version: "1.00",
  revision: 12,
  updated_at: "2026-09-08T12:00:00.123456+00:00",
}));
function client(data: unknown, error: unknown = null) {
  const calls: unknown[] = [];
  return {
    calls,
    db: {
      rpc: ((...args: unknown[]) => {
        calls.push(args);
        return Promise.resolve({ data, error });
      }) as unknown as MatchDirectoryClient["rpc"],
    },
  };
}

test("directory pages preserve precise cursors and request identity only from the session RPC", async () => {
  const { db, calls } = client(rows);
  const page = await listUnfinishedMatches(db, null, 2);
  assert.equal(page.matches.length, 2);
  assert.deepEqual(page.nextCursor, {
    id: rows[1].id,
    updatedAt: rows[1].updated_at,
  });
  assert.deepEqual(calls, [
    [
      "list_unfinished_simulator_matches",
      { p_before_updated_at: null, p_before_id: null, p_limit: 3 },
    ],
  ]);
  assert.deepEqual(
    Object.keys(page.matches[0]).sort(),
    [
      "id",
      "seat",
      "engineVersion",
      "rulesVersion",
      "revision",
      "updatedAt",
    ].sort(),
  );
  const next = client([]);
  assert.deepEqual(await listUnfinishedMatches(next.db, page.nextCursor, 2), {
    matches: [],
    nextCursor: null,
  });
  assert.deepEqual(next.calls, [
    [
      "list_unfinished_simulator_matches",
      {
        p_before_updated_at: rows[1].updated_at,
        p_before_id: rows[1].id,
        p_limit: 3,
      },
    ],
  ]);
});

test("directory rejects malformed requests, private response fields, duplicate matches, and storage failures", async () => {
  const valid = client(rows);
  await assert.rejects(listUnfinishedMatches(valid.db, null, 51));
  await assert.rejects(
    listUnfinishedMatches(valid.db, { id: "injected", updatedAt: "yesterday" }),
  );
  assert.equal(valid.calls.length, 0);
  await assert.rejects(
    listUnfinishedMatches(client([{ ...rows[0], state: { secret: true } }]).db),
  );
  await assert.rejects(
    listUnfinishedMatches(client([rows[0], rows[0]]).db),
    /Duplicate/,
  );
  await assert.rejects(
    listUnfinishedMatches(
      client(null, { message: "private database error" }).db,
    ),
    /Unfinished games unavailable/,
  );
  assert.equal(
    (await listUnfinishedMatches(client(rows.slice(0, 2)).db, null, 2))
      .nextCursor,
    null,
  );
});
