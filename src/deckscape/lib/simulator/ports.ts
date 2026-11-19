import { z } from "zod";

export const portRegions = ["head", "body", "leftArm", "rightArm"] as const;
export type PortRegion = (typeof portRegions)[number];
const level = z.number().int().nonnegative();
export const portsSchema = z
  .object({
    head: level,
    body: level,
    leftArm: level,
    rightArm: level,
  })
  .strict();
export type Ports = z.infer<typeof portsSchema>;
export type CardEdge = "top" | "bottom" | "left" | "right";

/** Comprehensive Rules 209.2-209.3. These are printed sides, not camera orientation. */
export function portsByCardEdge(
  type: "character" | "gear",
  ports: Ports,
): Record<CardEdge, number> {
  return type === "character"
    ? {
        top: ports.head,
        bottom: ports.body,
        left: ports.leftArm,
        right: ports.rightArm,
      }
    : {
        top: ports.body,
        bottom: ports.head,
        left: ports.rightArm,
        right: ports.leftArm,
      };
}

/** Port compatibility only; callers must separately enforce targeting, costs, and permissions. */
export function compatibleGearPorts(
  character: Ports,
  gear: Ports,
  occupied: readonly PortRegion[] = [],
): PortRegion[] {
  return portRegions.filter(
    (region) =>
      gear[region] > 0 &&
      character[region] >= gear[region] &&
      !occupied.includes(region),
  );
}
