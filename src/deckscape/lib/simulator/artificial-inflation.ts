import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import { evaluateCardAttributes } from "./attribute-layers";
export function applyArtificialInflation(
  s: GameState,
  version: string | undefined,
  current: Map<string, CardCharacteristics>,
  hasAbility: (s: GameState, id: string) => boolean,
) {
  if (!version) return current;
  const sources = s.arena.filter(
    (id) =>
      s.objects[id].definitionVersion === version &&
      hasAbility(s, id) &&
      current.get(id)?.cardType === "program",
  );
  if (!sources.length) return current;
  return new Map(
    [...current].map(([id, card]) => [
      id,
      !("ramCost" in card) || card.factions.includes("CORPO")
        ? card
        : evaluateCardAttributes(
            card,
            sources.map((source) => ({
              id: `${source}:${s.objects[source].incarnation}:inflation`,
              timestamp: s.objects[source].timestamp,
              dependsOn: [],
              kind: "add-ram" as const,
              value: 1,
            })),
          ),
    ]),
  );
}
