import {
  decodeStoredMatch,
  type MatchRuntimeResolver,
  type StoredMatch,
} from "./match-service";

export interface SimulatorRecoveryAuditStore {
  unfinishedMatches(): Promise<readonly StoredMatch[]>;
  acceptedActionRevisions(matchId: string): Promise<readonly number[]>;
}

export type SimulatorRecoveryIssueCode =
  "runtime-unavailable" | "snapshot-invalid" | "action-history-invalid";

export interface SimulatorRecoveryAudit {
  checkedAt: string;
  healthy: boolean;
  matchesChecked: number;
  pendingDecisions: number;
  releases: Record<string, number>;
  issues: {
    matchId: string;
    engineVersion: string;
    rulesVersion: string;
    revision: number;
    code: SimulatorRecoveryIssueCode;
  }[];
}

function releaseKey(match: StoredMatch) {
  return `${match.engineVersion} / rules ${match.rulesVersion}`;
}

function hasContiguousActions(revisions: readonly number[], revision: number) {
  return (
    revisions.length === revision &&
    revisions.every((accepted, index) => accepted === index + 1)
  );
}

/**
 * Metadata-only deployment check. It never returns canonical snapshots, commands,
 * player ids, random state, cards, or pending-decision contents.
 */
export async function auditSimulatorRecovery(
  store: SimulatorRecoveryAuditStore,
  resolveRuntime: MatchRuntimeResolver,
  now = () => new Date(),
): Promise<SimulatorRecoveryAudit> {
  const matches = await store.unfinishedMatches();
  const releases: Record<string, number> = {};
  const issues: SimulatorRecoveryAudit["issues"] = [];
  let pendingDecisions = 0;

  for (const match of matches) {
    const key = releaseKey(match);
    releases[key] = (releases[key] ?? 0) + 1;
    let state;
    try {
      state = decodeStoredMatch(
        match,
        resolveRuntime(match.engineVersion, match.rulesVersion),
      );
    } catch (error) {
      issues.push({
        matchId: match.id,
        engineVersion: match.engineVersion,
        rulesVersion: match.rulesVersion,
        revision: match.revision,
        code:
          error instanceof Error &&
          error.message === "Pinned simulator runtime is unavailable"
            ? "runtime-unavailable"
            : "snapshot-invalid",
      });
      continue;
    }
    if (state.pendingDecision) pendingDecisions++;
    const revisions = await store.acceptedActionRevisions(match.id);
    if (!hasContiguousActions(revisions, match.revision))
      issues.push({
        matchId: match.id,
        engineVersion: match.engineVersion,
        rulesVersion: match.rulesVersion,
        revision: match.revision,
        code: "action-history-invalid",
      });
  }

  return {
    checkedAt: now().toISOString(),
    healthy: issues.length === 0,
    matchesChecked: matches.length,
    pendingDecisions,
    releases,
    issues,
  };
}
