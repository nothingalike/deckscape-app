import type { MatchRuntime, MatchRuntimeResolver } from "./match-service";
import { versionDefinition, type EngineManifest } from "./definition-version";
import type { PinnedDefinition } from "./deck-admission";

export interface RuntimeAdmission {
  engine: EngineManifest;
  rulesVersion: string;
  definitions: ReadonlyMap<string, PinnedDefinition>;
}

export interface RuntimeRelease {
  engineVersion: string;
  rulesVersion: string;
  availableForNewMatches: boolean;
  runtime: MatchRuntime;
  admission?: RuntimeAdmission;
  defaultForNewMatches?: boolean;
}

/** Build once from deployment-owned versioned modules. Older releases remain resolvable
 * even when new-match admission is disabled. No latest-version fallback or key replacement.
 */
export function createRuntimeRegistry(releases: readonly RuntimeRelease[]) {
  const entries = new Map<
    string,
    {
      runtime: MatchRuntime;
      availableForNewMatches: boolean;
      admission?: RuntimeAdmission;
    }
  >();
  let defaultPins: { engineVersion: string; rulesVersion: string } | null =
    null;
  const key = (engineVersion: string, rulesVersion: string) =>
    JSON.stringify([engineVersion, rulesVersion]);
  for (const release of releases) {
    const { engineVersion, rulesVersion } = release;
    if (!engineVersion.trim() || !rulesVersion.trim())
      throw new Error("Runtime version pins are required");
    const releaseKey = key(engineVersion, rulesVersion);
    if (entries.has(releaseKey))
      throw new Error("Duplicate engine/rules runtime registration");
    const admission = release.admission
      ? structuredClone(release.admission)
      : undefined;
    if (admission) {
      if (
        admission.engine.version !== engineVersion ||
        admission.rulesVersion !== rulesVersion
      )
        throw new Error("Runtime admission pins mismatch");
      for (const [cardId, pinned] of admission.definitions) {
        const definition = versionDefinition(
          pinned.definition,
          admission.engine,
        );
        if (
          definition.version !== pinned.version ||
          definition.definition.cardId !== cardId ||
          definition.definition.rulesVersion !== rulesVersion
        )
          throw new Error("Runtime admission definition mismatch");
      }
    }
    if (release.defaultForNewMatches) {
      if (defaultPins || !release.availableForNewMatches || !admission)
        throw new Error("Invalid default new-match release");
      defaultPins = { engineVersion, rulesVersion };
    }
    const decode = release.runtime.decodeState.bind(release.runtime);
    const runtime: MatchRuntime = Object.freeze({
      commands: release.runtime.commands,
      visibility: release.runtime.visibility,
      battlefield: release.runtime.battlefield,
      decodeState(input: unknown) {
        const state = decode(input);
        if (
          state.engineVersion !== engineVersion ||
          state.rulesVersion !== rulesVersion
        )
          throw new Error("Saved state does not match its registered runtime");
        return state;
      },
    });
    entries.set(releaseKey, {
      runtime,
      availableForNewMatches: release.availableForNewMatches,
      admission,
    });
  }
  const resolve: MatchRuntimeResolver = (engineVersion, rulesVersion) => {
    const entry = entries.get(key(engineVersion, rulesVersion));
    if (!entry) throw new Error("Pinned simulator runtime is unavailable");
    return entry.runtime;
  };
  const availablePins = releases
    .filter((release) => release.availableForNewMatches && release.admission)
    .map((release) => ({
      engineVersion: release.engineVersion,
      rulesVersion: release.rulesVersion,
    }));
  return Object.freeze({
    resolve,
    newMatchReleases() {
      return availablePins.map((pins) => ({ ...pins }));
    },
    defaultNewMatch() {
      return defaultPins ? { ...defaultPins } : null;
    },
    admissionForExistingMatch(
      engineVersion: string,
      rulesVersion: string,
    ): RuntimeAdmission {
      const entry = entries.get(key(engineVersion, rulesVersion));
      if (!entry?.admission)
        throw new Error("Pinned match admission unavailable");
      return structuredClone(entry.admission);
    },
    admissionForNewMatch(
      engineVersion: string,
      rulesVersion: string,
    ): RuntimeAdmission {
      const entry = entries.get(key(engineVersion, rulesVersion));
      if (!entry?.availableForNewMatches || !entry.admission)
        throw new Error("Simulator admission is not enabled for new matches");
      return structuredClone(entry.admission);
    },
    forNewMatch(engineVersion: string, rulesVersion: string): MatchRuntime {
      const entry = entries.get(key(engineVersion, rulesVersion));
      if (!entry?.availableForNewMatches)
        throw new Error("Simulator runtime is not enabled for new matches");
      return entry.runtime;
    },
  });
}
