import cards from "./dustrunner-cards-v1.json";
import activations from "./character-activation-specifications-v1.json";
import passives from "./character-passive-specifications-v1.json";
import programs from "./program-specifications-v1.json";
import environments from "./environment-specifications-v1.json";
import protocols from "./protocol-specifications-v1.json";
import mainframes from "./mainframe-resource-specifications-v1.json";
import gear from "./dustrunner-gear-specifications-v1.json";
import mirage from "./dust-devil-vultures-specification-v1.json";
import { characterImplementationHandlers } from "./character-implementation-handlers";
import { versionDefinition, type EngineManifest } from "./definition-version";

export const dustrunnerEngineVersion = "starter-dustrunner-v1";
export const dustrunnerRulesVersion = "1.00";

/** Retained release inputs; runtime registration is a separate acceptance gate. */
export function dustrunnerDefinitionsV1() {
  const recipes = cards.map((card) => {
    const activation = activations.find((s) => s.cardId === card.cardId);
    if (activation)
      return { ...card, handlers: characterImplementationHandlers(activation) };
    const mainframe = mainframes.find((s) => s.cardId === card.cardId);
    if (mainframe) return { ...card, handlers: mainframe.handlers };
    const spec = [
      ...passives,
      ...programs,
      ...environments,
      ...protocols,
      ...gear,
      mirage,
    ].find((s) => s.cardId === card.cardId);
    if (spec)
      return {
        ...card,
        handlers: [
          { id: spec.handlerId, version: spec.handlerVersion, parameters: {} },
        ],
      };
    // The two explicit vanilla definitions are reviewed blank-text cards, not a
    // fallback for an unknown card or a missing implementation.
    if (
      !["DUST DEVIL INITIATE", "BASIC RAM"].includes(
        card.characteristics.name.toUpperCase(),
      ) ||
      card.characteristics.rulesText ||
      ("activatedAbilities" in card.characteristics &&
        card.characteristics.activatedAbilities?.length)
    )
      throw new Error(
        `Unbound starter definition: ${card.characteristics.name}`,
      );
    return { ...card, handlers: [] };
  });
  const engine: EngineManifest = {
    version: dustrunnerEngineVersion,
    handlers: new Map(
      recipes.flatMap((c) =>
        c.handlers.map((h) => [h.id, new Set([h.version])] as const),
      ),
    ),
    implementedCards: new Set(recipes.map((c) => c.cardId)),
    verifiedCards: new Set(recipes.map((c) => c.cardId)),
  };
  const definitions = new Map(
    recipes.map((card) => [
      card.cardId,
      versionDefinition(
        {
          schemaVersion: 1,
          cardId: card.cardId,
          characteristics: card.characteristics,
          handlers: card.handlers,
          artwork: card.artwork,
          support: "verified",
          engineVersion: engine.version,
          rulesVersion: dustrunnerRulesVersion,
        },
        engine,
      ),
    ]),
  );
  return { engine, rulesVersion: dustrunnerRulesVersion, definitions };
}
