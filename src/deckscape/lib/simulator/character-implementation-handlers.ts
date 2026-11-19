/** A card has one definition pin containing all of its retained implementations.
 * Keep that handler inventory shared by activation, trigger and release assembly. */
export function characterImplementationHandlers(spec: {
  abilities: readonly { handlerId: string; handlerVersion: number }[];
  passiveTriggers?: readonly { handlerId: string; handlerVersion: number }[];
  hitTriggers?: readonly { handlerId: string; handlerVersion: number }[];
  continuousEffects?: readonly { handlerId: string; handlerVersion: number }[];
  keywords?: readonly { handlerId: string; handlerVersion: number }[];
  damageReplacements?: readonly { handlerId: string; handlerVersion: number }[];
  drawReplacements?: readonly { handlerId: string; handlerVersion: number }[];
  programCostReductions?: readonly {
    handlerId: string;
    handlerVersion: number;
  }[];
}) {
  return [
    ...spec.abilities,
    ...(spec.passiveTriggers ?? []),
    ...(spec.hitTriggers ?? []),
    ...(spec.keywords ?? []),
    ...(spec.continuousEffects ?? []),
    ...(spec.damageReplacements ?? []),
    ...(spec.drawReplacements ?? []),
    ...(spec.programCostReductions ?? []),
  ].map((handler) => ({
    id: handler.handlerId,
    version: handler.handlerVersion,
    parameters: {},
  }));
}
