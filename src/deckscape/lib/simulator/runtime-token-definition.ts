import { createHash } from "node:crypto";
import {
  tokenCharacteristics,
  type TokenTemplateId,
  type AttackType,
} from "./tokens";
import { characteristicsSchema } from "./characteristics";

/** Internal token definitions are pinned for replay, but are never admitted into decks. */
export function runtimeTokenDefinition(
  template: TokenTemplateId,
  engineVersion: string,
  rulesVersion: string,
  attackType?: AttackType,
) {
  const { abilities: _abilities, ...printed } = tokenCharacteristics(
    template,
    attackType,
  );
  const characteristics = characteristicsSchema.parse({
    ...printed,
    tags: [],
    rulesText: "",
    copiesLimit: 0,
    activatedAbilities: [],
  });
  const version = createHash("sha256")
    .update(
      JSON.stringify({
        kind: "token-v1",
        template,
        engineVersion,
        rulesVersion,
        characteristics,
      }),
    )
    .digest("hex");
  return { version, characteristics };
}
