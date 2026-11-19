import type { PortRegion } from "./ports";
/** Namespaced UI choice identity; never sent as a card ID to the game engine. */
export const gearPortChoiceId = (hostId: string, port: PortRegion | string) =>
  `gear-port:${JSON.stringify([hostId, port])}`;
