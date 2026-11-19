import type { GameState } from "./game-state";
import type { CardCharacteristics } from "./characteristics";
import type { CombatDamagePacket } from "./combat-damage";

export interface CharacterDamageReplacementSpecification {
  handlerId: string;
  handlerVersion: number;
  kind: "double-attack-damage-to-countered-character";
}
export interface CharacterDamageReplacementEffects {
  characteristics(state: GameState): ReadonlyMap<string, CardCharacteristics>;
  hasAbility(state: GameState, sourceId: string, handler: string): boolean;
}

/** One current source replacement per packet. The damage interpreter invokes this
 * phase once before prevention (CR 613.5), for ordinary combat and DUEL alike.
 * Other competing replacements need the owning interpreter's ordering decisions. */
export function characterDamageReplacements(
  definitions: readonly {
    version: string;
    replacements: readonly CharacterDamageReplacementSpecification[];
  }[],
  engineVersion: string,
  rulesVersion: string,
  effects: CharacterDamageReplacementEffects,
) {
  const bound = new Map<string, CharacterDamageReplacementSpecification>();
  for (const definition of definitions) {
    if (bound.has(definition.version) || definition.replacements.length !== 1)
      throw new Error("Invalid character damage replacement inventory");
    const spec = definition.replacements[0];
    if (
      !spec.handlerId ||
      spec.handlerVersion !== 1 ||
      spec.kind !== "double-attack-damage-to-countered-character"
    )
      throw new Error("Unsupported character damage replacement");
    bound.set(definition.version, structuredClone(spec));
  }
  return {
    replaceAttackDamage(
      state: GameState,
      packets: readonly CombatDamagePacket[],
    ): CombatDamagePacket[] {
      if (
        state.engineVersion !== engineVersion ||
        state.rulesVersion !== rulesVersion
      )
        throw new Error("Character damage replacement version mismatch");
      const current = effects.characteristics(structuredClone(state));
      return packets.map((packet) => {
        if (!Number.isSafeInteger(packet.amount) || packet.amount < 0)
          throw new Error("Invalid unreplaced damage amount");
        const next = structuredClone(packet);
        if (
          !packet.combat ||
          packet.recipient !== "character" ||
          !packet.amount
        )
          return next;
        const source = state.objects[packet.sourceId],
          spec = source && bound.get(source.definitionVersion);
        if (
          !spec ||
          source.faceDown ||
          !state.arena.includes(source.id) ||
          !state.arena.includes(packet.instanceId)
        )
          return next;
        const attacker = current.get(source.id),
          recipient = current.get(packet.instanceId);
        if (!attacker || !recipient)
          throw new Error(
            "Character damage replacement characteristics unavailable",
          );
        if (
          attacker.cardType !== "character" ||
          recipient.cardType !== "character" ||
          !Object.values(state.objects[packet.instanceId].counters).some(
            (amount) => amount > 0,
          ) ||
          !effects.hasAbility(structuredClone(state), source.id, spec.handlerId)
        )
          return next;
        next.amount *= 2;
        if (!Number.isSafeInteger(next.amount))
          throw new Error("Replaced damage exceeds supported range");
        return next;
      });
    },
  };
}
