export type CharacterPort = "head" | "body" | "leftArm" | "rightArm";

/** Screen-space character cluster. Empty ports are shown only while they are legal targets. */
export function characterCluster(
  ramCount: number,
  tapped = false,
  visiblePorts: ReadonlySet<CharacterPort> = new Set([
    "head",
    "body",
    "leftArm",
    "rightArm",
  ]),
) {
  const slot = 36,
    gap = 4,
    ramWidth = 48,
    ramHeight = 68,
    ramGap = 4,
    left = visiblePorts.has("leftArm") ? slot + gap : 0,
    top = visiblePorts.has("head") ? slot + gap : 0;
  const cardWidth = tapped ? 181 : 128;
  const cardHeight = tapped ? 128 : 181;
  const bottom = top + cardHeight + gap;
  const right = left + cardWidth + gap;
  const ramRight = right + (visiblePorts.has("rightArm") ? slot + gap : 0);
  const ramBottom = bottom + (visiblePorts.has("body") ? slot + gap : 0);
  const ramColumns = tapped ? Math.min(ramCount, 4) : Math.ceil(ramCount / 2);
  const ramRows = tapped ? Math.ceil(ramCount / 4) : Math.min(ramCount, 2);
  return {
    width: tapped
      ? Math.max(
          right + (visiblePorts.has("rightArm") ? slot : 0),
          left + ramColumns * (ramWidth + ramGap),
        )
      : ramRight + ramColumns * (ramWidth + ramGap),
    height:
      tapped && ramCount
        ? ramBottom + ramRows * (ramHeight + ramGap)
        : bottom + (visiblePorts.has("body") ? slot : 0),
    center: { x: left, y: top },
    slots: [
      {
        port: "head",
        label: "HEAD",
        x: left + (cardWidth - slot) / 2,
        y: 0,
        size: slot,
      },
      {
        port: "body",
        label: "BODY",
        x: left + (cardWidth - slot) / 2,
        y: bottom,
        size: slot,
      },
      {
        port: "leftArm",
        label: "L ARM",
        x: 0,
        y: top + (cardHeight - slot) / 2,
        size: slot,
      },
      {
        port: "rightArm",
        label: "R ARM",
        x: right,
        y: top + (cardHeight - slot) / 2,
        size: slot,
      },
    ].filter((item) => visiblePorts.has(item.port as CharacterPort)),
    ram: Array.from({ length: ramCount }, (_, index) => ({
      x: tapped
        ? left + (index % 4) * (ramWidth + ramGap)
        : ramRight + Math.floor(index / 2) * (ramWidth + ramGap),
      y: tapped
        ? ramBottom + Math.floor(index / 4) * (ramHeight + ramGap)
        : top + (index % 2) * (ramHeight + ramGap),
      width: ramWidth,
      height: ramHeight,
    })),
  };
}
