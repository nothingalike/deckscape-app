import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import type { layoutTable } from "@/lib/simulator/table-layout";

export function arenaPlateBounds(
  layout: ReturnType<typeof layoutTable>,
  displayScale: number,
) {
  const px = 1 / Math.max(0.01, displayScale);
  const plates = layout.areas
    .filter((area) => area.zone.id.endsWith(":arena"))
    .map((area) => {
      const top = Math.min(area.y, ...area.cards.map((card) => card.y));
      const bottom = Math.max(
        area.y + area.height,
        ...area.cards.map((card) => card.y + card.height),
      );
      const y = Math.max(10 * px, top - 10 * px);
      return {
        y,
        bottom: Math.min(layout.height - 10 * px, y + bottom - top + 20 * px),
      };
    })
    .sort((a, b) => a.y - b.y);
  const gap = 12 * px;
  for (let index = 1; index < plates.length; index++) {
    const upper = plates[index - 1];
    const lower = plates[index];
    if (lower.y >= upper.bottom + gap) continue;
    const middle = (upper.bottom + lower.y) / 2;
    upper.bottom = middle - gap / 2;
    lower.y = middle + gap / 2;
  }
  return plates;
}

/** Decorative only: consume final placement geometry without changing hit targets. */
export function drawBoardSurface(
  layout: ReturnType<typeof layoutTable>,
  displayScale: number,
  seat: 0 | 1,
  material?: Texture,
) {
  const layer = new Container();
  layer.eventMode = "none";
  layer.zIndex = -100;
  let g = layer.addChild(new Graphics());
  const px = 1 / Math.max(0.01, displayScale);
  const { width, height } = layout;
  const cut = 18 * px;
  // Screen-space falloff keeps the light restrained at both phone and desktop
  // scales. Geometry is cached by the caller; no animated glow or blur pass.
  const light = (trace: () => void, strength = 1) => {
    for (const [weight, alpha] of [
      [20, 0.012],
      [13, 0.022],
      [8, 0.04],
      [4, 0.09],
      [1, 0.65],
    ]) {
      trace();
      g.stroke({
        color: 0x79deed,
        width: weight * px,
        alpha: alpha * strength,
      });
    }
  };
  const plate = (x: number, y: number, w: number, h: number, fill: number) => {
    const c = Math.min(cut, w / 8, h / 4);
    const points = [
      x + c,
      y,
      x + w - c,
      y,
      x + w,
      y + c,
      x + w,
      y + h - c,
      x + w - c,
      y + h,
      x + c,
      y + h,
      x,
      y + h - c,
      x,
      y + c,
    ];
    g.poly(points).fill(fill);
    if (material) {
      const surface = layer.addChild(new Sprite(material));
      const scale = Math.max(w / material.width, h / material.height);
      surface.width = material.width * scale;
      surface.height = material.height * scale;
      surface.position.set(
        x + (w - surface.width) / 2,
        y + (h - surface.height) / 2,
      );
      surface.alpha = fill === 0x0b1217 ? 0.18 : 0.3;
      const mask = layer.addChild(new Graphics().poly(points).fill(0xffffff));
      surface.mask = mask;
      g = layer.addChild(new Graphics());
    }
    g.poly(points).stroke({ color: 0x030709, width: 7 * px });
    g.poly(points).stroke({ color: 0x24363d, width: 3 * px });
    g.poly(points).stroke({ color: 0x48616b, alpha: 0.3, width: px });
    g.moveTo(x + c, y + px)
      .lineTo(x + w - c, y + px)
      .stroke({ color: 0x6b8790, alpha: 0.22, width: px });
  };
  g.rect(0, 0, width, height).fill(0x070c10);
  // Thin outer chassis: no large hardware border stealing mobile play space.
  plate(5 * px, 5 * px, width - 10 * px, height - 10 * px, 0x10191e);
  const inset = Math.min(width * 0.055, 60 * px);
  for (const { y, bottom } of arenaPlateBounds(layout, displayScale)) {
    const h = bottom - y;
    plate(inset, y, width - inset * 2, h, 0x0b1217);
    // Layered strokes give a soft light channel without GPU blur filters.
    for (const side of [-1, 1]) {
      const x = side === -1 ? inset : width - inset;
      light(() => {
        g.moveTo(x - side * cut, y + 3 * px)
          .lineTo(x - side * 3 * px, y + cut)
          .lineTo(x - side * 3 * px, y + Math.min(h / 3, cut * 1.6))
          .moveTo(x - side * 3 * px, y + h - Math.min(h / 3, cut * 1.6))
          .lineTo(x - side * 3 * px, y + h - cut)
          .lineTo(x - side * cut, y + h - 3 * px);
      });
    }
  }
  const environment = layout.areas.find((a) => a.zone.id === "environment");
  if (environment) {
    const card = environment.cards[0];
    const cx = card ? card.x + card.width / 2 : width / 2;
    const cy = card
      ? card.y + card.height / 2
      : environment.y + environment.height / 2;
    const radius = card ? Math.max(card.width, card.height) * 0.57 : 24 * px;
    for (let spread = 16; spread >= 4; spread -= 3) {
      g.circle(cx, cy, radius + spread * px).fill({
        color: 0x58b7c9,
        alpha: 0.009,
      });
    }
    g.circle(cx, cy, radius + 5 * px)
      .fill(0x070c10)
      .stroke({ color: 0x33464e, width: 2 * px });
    g.circle(cx, cy, radius)
      .fill(0x111d23)
      .stroke({ color: 0x67cddd, alpha: 0.38, width: px });
    g.circle(cx, cy, radius - 4 * px).stroke({
      color: 0x365560,
      alpha: 0.5,
      width: px,
    });
    // Broken rim segments read as hardware lighting, not a selection outline.
    for (const angle of [Math.PI * 0.12, Math.PI * 1.12]) {
      light(() => {
        const r = radius + 2 * px;
        g.moveTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r).arc(
          cx,
          cy,
          r,
          angle,
          angle + Math.PI * 0.36,
        );
      }, 0.65);
    }
    for (const direction of [-1, 1]) {
      const start = cx + direction * (radius + 8 * px);
      const end = direction < 0 ? inset + cut : width - inset - cut;
      g.moveTo(start, cy)
        .lineTo(end, cy)
        .stroke({ color: 0x47636c, alpha: 0.35, width: px });
      g.circle(start, cy, 1.5 * px).fill(0x68b6c5);
    }
  }
  // Docks follow the existing desktop-centered / mobile-left Mainframes.
  for (const panel of layout.panels) {
    const y = panel.y + (panel.seat === seat ? 40 : 0);
    plate(panel.x - 55, y - 6, 340, 164, 0x080f14);
    light(() => {
      g.moveTo(panel.x + 12, y + 158)
        .lineTo(panel.x + 82, y + 158)
        .moveTo(panel.x + 148, y + 158)
        .lineTo(panel.x + 218, y + 158);
    }, 0.55);
    g.moveTo(panel.x - 35, y - 5)
      .lineTo(panel.x + 10, y - 5)
      .stroke({ color: 0xc4dfe5, alpha: 0.28, width: px });
  }
  // Static contact shadows share the exact final card bounds. No blur filters,
  // ticker, hidden-card inspection or changes to interactive geometry.
  for (const area of layout.areas) {
    if (!area.zone.id.endsWith(":arena") && area.zone.id !== "environment")
      continue;
    for (const card of area.cards) {
      if (card.compact) continue;
      for (const [spread, opacity] of [
        [4, 0.08],
        [2, 0.14],
        [0, 0.3],
      ]) {
        g.roundRect(
          card.x - spread * px,
          card.y + (3 - spread) * px,
          card.width + 2 * spread * px,
          card.height + 2 * spread * px,
          4 * px,
        ).fill({ color: 0x000000, alpha: opacity });
      }
    }
  }
  return layer;
}
