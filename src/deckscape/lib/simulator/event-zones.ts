import { z } from "zod";
import { assertGameZones, type GameState } from "./game-state";
import { gameObjectSchema } from "./game-object-schema";
import { timedCombatEffectSchema } from "./timed-combat-effects";
import { timedTriggerEffectSchema } from "./timed-trigger-effects";
import { timedDamagePreventionSchema } from "./timed-damage-prevention";
import { destructionProtectionSchema } from "./destruction-protection";
import { psychosisImmunitySchema } from "./psychosis-immunity";

const ids = z.array(z.string().min(1));
export const playerZonesSchema = z
  .object({
    mainframe: ids.length(1),
    cyberdeck: ids,
    hand: ids,
    ramDeck: ids,
    ramBank: ids,
    recycleBin: ids,
    purge: ids,
  })
  .strict();

/** Server-private event facts. Includes all zones so restored objects never also
 * remain in their later destination, and later entrants return to their old zone.
 * Matching object data also preserves departed tokens awaiting cleanup and cards
 * whose properties changed after entering a different zone later in the effect.
 */
export const eventZonesSchema = z
  .object({
    arena: ids,
    environment: ids,
    cache: ids,
    players: z.tuple([playerZonesSchema, playerZonesSchema]),
    objects: z.record(z.string().min(1), gameObjectSchema),
    combatEffects: z.array(timedCombatEffectSchema),
    triggerEffects: z.array(timedTriggerEffectSchema).default([]),
    damagePreventions: z.array(timedDamagePreventionSchema).default([]),
    destructionProtections: z.array(destructionProtectionSchema).default([]),
    psychosisImmunities: z.array(psychosisImmunitySchema).default([]),
  })
  .strict()
  .superRefine((zones, ctx) => {
    const all = zoneIds(zones);
    if (new Set(all).size !== all.length)
      ctx.addIssue({
        code: "custom",
        message: "Duplicate captured zone object",
      });
    const known = new Set(all);
    if (
      all.some((id) => zones.objects[id]?.id !== id) ||
      Object.keys(zones.objects).some((id) => !known.has(id))
    )
      ctx.addIssue({
        code: "custom",
        message: "Inconsistent captured zone objects",
      });
    for (const object of Object.values(zones.objects))
      if (
        object.attachments.some(
          (link) => link.hostId === object.id || !zones.objects[link.hostId],
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "Invalid captured attachment host",
        });
  });
export type EventZones = z.infer<typeof eventZonesSchema>;

function zoneIds(zones: EventZones): string[] {
  return [
    ...zones.arena,
    ...zones.environment,
    ...zones.cache,
    ...zones.players.flatMap((player) => Object.values(player).flat()),
  ];
}

export function captureEventZones(state: GameState): EventZones {
  return structuredClone({
    arena: state.arena,
    environment: state.environment,
    cache: state.cache,
    players: [state.players[0].zones, state.players[1].zones],
    objects: state.objects,
    combatEffects: state.combatEffects,
    triggerEffects: state.triggerEffects,
    damagePreventions: state.damagePreventions,
    destructionProtections: state.destructionProtections ?? [],
    psychosisImmunities: state.psychosisImmunities ?? [],
  });
}

/** Mutates only the dispatcher's private observation copy, after captured objects
 * have been restored. This is a zone/observer view, not a replayable game revision.
 */
export function restoreEventZones(
  snapshot: GameState,
  zones: EventZones,
): void {
  const captured = structuredClone(zones);
  snapshot.arena = captured.arena;
  snapshot.environment = captured.environment;
  snapshot.cache = captured.cache;
  snapshot.players[0].zones = captured.players[0];
  snapshot.players[1].zones = captured.players[1];
  snapshot.objects = captured.objects;
  snapshot.combatEffects = captured.combatEffects;
  snapshot.triggerEffects = captured.triggerEffects;
  snapshot.damagePreventions = captured.damagePreventions;
  snapshot.destructionProtections = captured.destructionProtections;
  snapshot.psychosisImmunities = captured.psychosisImmunities;
  assertGameZones(snapshot);
}
