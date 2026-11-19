import type { Graphics } from "pixi.js";

type Point = { x: number; y: number };

/** Shared by the board and Cache foreground so clipped continuations match. */
export function drawIntent(
  graphics: Graphics,
  from: Point,
  to: Point,
  target: boolean,
  draft = false,
  scale = 1,
) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  if (!distance || scale <= 0) return;
  const color = target ? "#55d9fa" : "#c4ff65";
  const width = (target ? 4 : 3) * scale;
  const path = (stroke: string, weight: number) => {
    const dash = 14 * scale;
    const step = draft ? 22 * scale : distance;
    for (let start = 0; start < distance; start += step) {
      const end = draft ? Math.min(start + dash, distance) : distance;
      graphics
        .moveTo(
          from.x + ((to.x - from.x) * start) / distance,
          from.y + ((to.y - from.y) * start) / distance,
        )
        .lineTo(
          from.x + ((to.x - from.x) * end) / distance,
          from.y + ((to.y - from.y) * end) / distance,
        );
    }
    graphics.stroke({ color: stroke, width: weight, alpha: 0.95 });
  };
  path("#081018", width + 3 * scale);
  path(color, width);
  graphics
    .circle(from.x, from.y, 5 * scale)
    .fill(color)
    .stroke({ color: "#081018", width: 2 * scale });
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const length = Math.min(13 * scale, distance / 2);
  graphics
    .poly([
      to.x,
      to.y,
      to.x - Math.cos(angle - 0.55) * length,
      to.y - Math.sin(angle - 0.55) * length,
      to.x - Math.cos(angle + 0.55) * length,
      to.y - Math.sin(angle + 0.55) * length,
    ])
    .fill(color)
    .stroke({ color: "#081018", width: scale });
}
