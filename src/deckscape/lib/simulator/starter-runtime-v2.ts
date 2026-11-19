import { starterDefinitionsV2 } from "./starter-definitions-v2";
import { createStarterRuntime } from "./starter-runtime";

/** Shared four-starter runtime for new playtest rooms. */
export function createStarterRuntimeV2(artworkBaseUrl?: string) {
  return createStarterRuntime(starterDefinitionsV2(), artworkBaseUrl);
}
