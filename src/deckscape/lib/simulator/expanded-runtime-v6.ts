import { expandedDefinitionsV6 } from "./expanded-definitions-v6";
import { createStarterRuntime } from "./starter-runtime";

export function createExpandedRuntimeV6(artworkBaseUrl?: string, admission = expandedDefinitionsV6()) {
  return createStarterRuntime(admission, artworkBaseUrl, {
    abilityCopy: true,
    tokenCopies: true,
    armorCounters: true,
    spiritCounters: true,
    invertCounters: true,
  });
}
