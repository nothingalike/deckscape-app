import { dustrunnerDefinitionsV1 } from "./dustrunner-definitions-v1";
import { createStarterRuntime } from "./starter-runtime";

/** Retained Dustrunner release: existing matches keep their exact definition pins. */
export function createDustrunnerRuntimeV1(artworkBaseUrl?: string) {
  return createStarterRuntime(dustrunnerDefinitionsV1(), artworkBaseUrl);
}
