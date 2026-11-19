import recipesV5 from "./expanded-cards-v5.json";
import { versionDefinition, type EngineManifest } from "./definition-version";

/** V5 catalog with the artwork-confirmed Synchronize synergy correction.
 * Retained releases and their definition hashes remain unchanged.
 */
export function expandedDefinitionsV6() {
  const recipes = structuredClone(recipesV5);
  const synchronize = recipes.find(
    (recipe) => recipe.cardId === "67832741-300f-4036-947c-68e94315ed2b",
  );
  if (!synchronize) throw Error("Synchronize missing from release");
  synchronize.characteristics.requirements = { DUSTRUNNER: 1 };
  const ids = recipes.map((recipe) => recipe.cardId);
  if (ids.length !== 256 || new Set(ids).size !== ids.length)
    throw Error("Expanded release inventory mismatch");
  const handlers = new Map<string, Set<number>>();
  for (const recipe of recipes)
    for (const handler of recipe.handlers) {
      const versions = handlers.get(handler.id) ?? new Set<number>();
      versions.add(handler.version);
      handlers.set(handler.id, versions);
    }
  const engine: EngineManifest = {
    version: "expanded-v6",
    handlers,
    implementedCards: new Set(ids),
    verifiedCards: new Set(ids),
  };
  const rulesVersion = "1.1";
  const definitions = new Map(
    recipes.map((recipe) => [
      recipe.cardId,
      versionDefinition(
        {
          ...recipe,
          schemaVersion: 1,
          engineVersion: engine.version,
          rulesVersion,
          support: "verified",
        },
        engine,
      ),
    ]),
  );
  return { engine, rulesVersion, definitions };
}
