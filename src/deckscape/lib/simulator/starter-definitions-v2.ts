import corpo from "./corpo-cards-v1.json";
import cybernetic from "./cybernetic-cards-v1.json";
import hacker from "./hacker-cards-v1.json";
import trojans from "./trojan-cards-v1.json";
import cortex from "./cortex-crab-v1.json";
import cyberneticGear from "./cybernetic-gear-specifications-v1.json";
import grantedGear from "./gear-granted-specifications-v1.json";
import { dustrunnerDefinitionsV1 } from "./dustrunner-definitions-v1";
import { versionDefinition, type EngineManifest } from "./definition-version";

/** Four-starter playtest release. Retained v1 pins never change. */
export function starterDefinitionsV2() {
  const recipes = [
    ...[...dustrunnerDefinitionsV1().definitions.values()].map((p) => ({
      cardId: p.definition.cardId,
      characteristics: p.definition.characteristics,
      handlers: p.definition.handlers,
      artwork: p.definition.artwork,
    })),
    ...corpo,
    ...cybernetic,
    ...hacker,
    ...trojans,
    cortex,
    ...[...cyberneticGear, ...grantedGear].map((spec) => ({
      cardId: spec.cardId,
      characteristics: spec.characteristics,
      handlers: [
        { id: spec.handlerId, version: spec.handlerVersion, parameters: {} },
      ],
      artwork: {
        path: `${spec.cardId}/${spec.reviewArtworkSha256}.webp`,
        sha256: spec.reviewArtworkSha256,
      },
    })),
  ];
  if (new Set(recipes.map((c) => c.cardId)).size !== recipes.length)
    throw new Error("Duplicate starter release card");
  const engine: EngineManifest = {
    version: "starters-v2",
    handlers: new Map(),
    implementedCards: new Set(recipes.map((c) => c.cardId)),
    verifiedCards: new Set(recipes.map((c) => c.cardId)),
  };
  const handlers = new Map<string, Set<number>>();
  for (const recipe of recipes)
    for (const h of recipe.handlers) {
      const versions = handlers.get(h.id) ?? new Set<number>();
      versions.add(h.version);
      handlers.set(h.id, versions);
    }
  engine.handlers = handlers;
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
