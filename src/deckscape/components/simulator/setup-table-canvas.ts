import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  type Texture,
} from "pixi.js";
import { canvasResolution } from "./canvas-resolution";
import { drawBoardSurface } from "./board-surface";
import { layoutTable } from "@/lib/simulator/table-layout";
import type { BoardZone } from "@/lib/simulator/board-view";
import type { BoardAnchorListener } from "./board-anchors";

export type SetupTableCard = {
  id: string;
  name: string;
  artworkUrl?: string;
};

export type SetupTableState = {
  onAnchorLayout?: BoardAnchorListener;
  cards: readonly SetupTableCard[];
  mainframes: readonly { seat: 0 | 1; name: string; artworkUrl?: string }[];
  viewerSeat: 0 | 1;
  roll: readonly [number, number] | null;
  rollVisible: boolean;
  selected: readonly string[];
  transition: "out" | "in" | null;
  transitionIds: readonly string[];
  chooser: boolean;
  revealing: boolean;
};

export async function mountSetupTableCanvas(
  host: HTMLElement,
  stopped: () => boolean,
) {
  const app = new Application();
  await app.init({
    width: 1,
    height: 1,
    backgroundAlpha: 0,
    antialias: true,
    resolution: canvasResolution(3),
    autoDensity: true,
    autoStart: false,
    preference: "webgl",
  });
  if (stopped()) {
    app.destroy(
      { removeView: true, releaseGlobalResources: false },
      { children: true },
    );
    return { update: (_state: SetupTableState) => {}, dispose: () => {} };
  }
  host.prepend(app.canvas);
  app.canvas.style.position = "absolute";
  app.canvas.style.inset = "0";
  app.canvas.style.pointerEvents = "none";
  app.canvas.setAttribute("aria-hidden", "true");
  let disposed = false;
  let frame = 0;
  let scrollFrame = 0;
  let state: SetupTableState | null = null;
  let phaseStart = 0;
  let lastTransition: SetupTableState["transition"] = null;
  const textures = new Map<string, Texture | null>();
  let boardSurface: Container | null = null;
  let boardKey = "";

  function rect(element: Element) {
    const outer = host.getBoundingClientRect();
    const inner = element.getBoundingClientRect();
    return {
      x: inner.left - outer.left,
      y: inner.top - outer.top,
      width: inner.width,
      height: inner.height,
    };
  }
  function render() {
    if (disposed || !state) return;
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    const width = Math.max(1, Math.round(host.clientWidth));
    const height = Math.max(1, Math.round(host.clientHeight));
    if (app.screen.width !== width || app.screen.height !== height)
      app.renderer.resize(width, height);
    for (const child of app.stage.removeChildren())
      if (child !== boardSurface) child.destroy({ children: true });
    const material = textures.get("/simulator/obsidian-material-v1.webp");
    const nextBoardKey = `${width}/${height}/${state.viewerSeat}/${!!material}`;
    if (nextBoardKey !== boardKey) {
      boardSurface?.destroy({ children: true });
      const emptyZones: BoardZone[] = [
        `${1 - state.viewerSeat}:ram`, `${1 - state.viewerSeat}:arena`,
        "environment", `${state.viewerSeat}:arena`, `${state.viewerSeat}:ram`,
        `${state.viewerSeat}:hand`, "cache",
      ].map((id) => ({ id, label: id, cards: [] }));
      const layout = layoutTable(emptyZones, state.viewerSeat);
      boardSurface = drawBoardSurface(
        layout,
        Math.min(width / layout.width, height / layout.height),
        state.viewerSeat,
        material ?? undefined,
      );
      boardSurface.scale.set(width / layout.width, height / layout.height);
      boardKey = nextBoardKey;
    }
    if (boardSurface) app.stage.addChild(boardSurface);
    const mainframeBounds: Record<string, ReturnType<typeof rect>> = {};
    for (const mainframe of state.mainframes) {
      const element = host.querySelector(`[data-setup-mainframe="${mainframe.seat}"]`);
      if (!element) continue;
      const bounds = rect(element);
      mainframeBounds[mainframe.seat] = bounds;
      const dock = new Graphics()
        .roundRect(bounds.x - 7, bounds.y - 7, bounds.width + 14, bounds.height + 14, 10)
        .fill({ color: 0x081116 })
        .stroke({ color: mainframe.seat === state.viewerSeat ? 0x9dc963 : 0x4a7080, width: 2 });
      app.stage.addChild(dock);
      const face = mainframe.artworkUrl ? textures.get(mainframe.artworkUrl) : null;
      if (face) {
        const art = new Sprite(face);
        const scale = Math.min(bounds.width / face.width, bounds.height / face.height);
        art.width = face.width * scale;
        art.height = face.height * scale;
        art.position.set(bounds.x + (bounds.width - art.width) / 2, bounds.y + (bounds.height - art.height) / 2);
        app.stage.addChild(art);
      } else {
        app.stage.addChild(new Graphics().roundRect(bounds.x, bounds.y, bounds.width, bounds.height, 6).fill({ color: 0x213742 }));
        const title = new Text({ text: mainframe.name, style: { fontFamily: "Arial", fontSize: 13, fill: 0xeaf5f4 } });
        title.position.set(bounds.x + 5, bounds.y + bounds.height / 2 - 7);
        title.width = Math.min(title.width, bounds.width - 10);
        app.stage.addChild(title);
      }
    }
    app.canvas.dataset.mainframeBounds = JSON.stringify(mainframeBounds);
    const progress = state.transition
      ? Math.min(
          1,
          (performance.now() - phaseStart) /
            (state.transition === "out" ? 190 : 270),
        )
      : 1;
    for (const card of state.cards) {
      const element = Array.from(
        host.querySelectorAll<HTMLElement>("[data-setup-card]"),
      ).find((node) => node.dataset.setupCard === card.id);
      if (!element) continue;
      const bounds = rect(element);
      const moving = state.transitionIds.includes(card.id);
      const tile = new Container();
      tile.position.set(
        bounds.x,
        bounds.y +
          (moving && state.transition === "out"
            ? -24 * progress
            : moving && state.transition === "in"
              ? 24 * (1 - progress)
              : 0),
      );
      tile.alpha =
        moving && state.transition === "out"
          ? 1 - progress
          : moving && state.transition === "in"
            ? progress
            : 1;
      const selected = state.selected.includes(card.id);
      tile.addChild(
        new Graphics()
          .roundRect(0, 0, bounds.width, bounds.height, 7)
          .fill({ color: 0x101a20 })
          .stroke({
            color: selected ? 0xc4ff65 : 0x6c8790,
            width: selected ? 3 : 1.5,
          }),
      );
      const texture = card.artworkUrl ? textures.get(card.artworkUrl) : null;
      if (texture) {
        const art = new Sprite(texture);
        const scale = Math.min(
          (bounds.width - 8) / texture.width,
          (bounds.height - 29) / texture.height,
        );
        art.width = texture.width * scale;
        art.height = texture.height * scale;
        art.position.set((bounds.width - art.width) / 2, 4);
        tile.addChild(art);
      } else {
        tile.addChild(
          new Graphics()
            .roundRect(5, 5, bounds.width - 10, bounds.height - 34, 4)
            .fill({ color: 0x213742 }),
        );
      }
      tile.addChild(
        new Graphics()
          .rect(3, bounds.height - 27, bounds.width - 6, 24)
          .fill({ color: 0x0a1419, alpha: 0.96 }),
      );
      const label = new Text({
        text: card.name,
        style: {
          fontFamily: "Arial",
          fontSize: 12,
          fontWeight: "bold",
          fill: 0xeaf5f4,
        },
      });
      label.position.set(8, bounds.height - 22);
      label.width = Math.min(label.width, bounds.width - 16);
      tile.addChild(label);
      if (selected) {
        const marker = new Graphics()
          .circle(bounds.width - 15, 15, 11)
          .fill({ color: 0xc4ff65 });
        tile.addChild(marker);
        const number = new Text({
          text: String(state.selected.indexOf(card.id) + 1),
          style: {
            fontFamily: "Arial",
            fontSize: 12,
            fontWeight: "bold",
            fill: 0x162112,
          },
        });
        number.anchor.set(0.5);
        number.position.set(bounds.width - 15, 15);
        tile.addChild(number);
      }
      app.stage.addChild(tile);
    }
    for (const index of [0, 1]) {
      const element = host.querySelector(`[data-setup-die="${index}"]`);
      if (!element) continue;
      const bounds = rect(element);
      const x = bounds.x + bounds.width / 2;
      const y = bounds.y + bounds.height / 2;
      const radius = Math.min(bounds.width, bounds.height) * 0.34;
      const value = state.rollVisible && state.roll
        ? state.roll[index === 0 ? state.viewerSeat : 1 - state.viewerSeat]
        : "?";
      const die = new Graphics();
      const points: number[] = [];
      for (let corner = 0; corner < 10; corner++) {
        const angle = -Math.PI / 2 + corner * Math.PI / 5;
        const distance = radius * (corner % 2 ? 0.83 : 1);
        points.push(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance);
      }
      die.poly(points).fill({ color: 0x16343c }).stroke({ color: 0xc4ff65, width: 3 });
      die.moveTo(x, y - radius * 0.72).lineTo(x - radius * 0.58, y + radius * 0.43)
        .lineTo(x + radius * 0.58, y + radius * 0.43).closePath()
        .stroke({ color: 0x69b8c4, width: 1, alpha: 0.7 });
      app.stage.addChild(die);
      const number = new Text({ text: String(value), style: { fontFamily: "Arial", fontSize: Math.round(radius * 0.65), fontWeight: "bold", fill: 0xf2fff1 } });
      number.anchor.set(0.5);
      number.position.set(x, y + 3);
      app.stage.addChild(number);
      const label = new Text({ text: index === 0 ? "YOU" : "OPPONENT", style: { fontFamily: "Arial", fontSize: 12, fontWeight: "bold", fill: 0xf2fff1 } });
      label.anchor.set(0.5);
      label.position.set(x, bounds.y + bounds.height - 6);
      app.stage.addChild(label);
    }
    if (state.onAnchorLayout) {
      state.onAnchorLayout(Object.fromEntries([
        ...state.cards.map((card) => [card.id, host.querySelector(`[data-setup-card="${card.id}"]`)] as const),
        ...state.mainframes.map((card) => [`mainframe:${card.seat}`, host.querySelector(`[data-setup-mainframe="${card.seat}"]`)] as const),
        ["hand", host.querySelector('[aria-label="Opening hand"]')] as const,
      ].flatMap(([id, element]) => {
        if (!element) return [];
        const box = element.getBoundingClientRect();
        return [[id, {x: box.left, y: box.top, width: box.width, height: box.height}]];
      })));
    }
    app.render();
    if ((state.transition && progress < 1) || state.revealing)
      frame = requestAnimationFrame(render);
  }
  function update(next: SetupTableState) {
    if (disposed) return;
    if (
      next.transition !== lastTransition ||
      (next.revealing && !state?.revealing)
    )
      phaseStart = performance.now();
    lastTransition = next.transition;
    state = next;
    for (const url of ["/simulator/obsidian-material-v1.webp", ...next.cards.map((card) => card.artworkUrl), ...next.mainframes.map((card) => card.artworkUrl)]) {
      if (!url || textures.has(url)) continue;
      textures.set(url, null);
      void Assets.load<Texture>(url)
        .then((texture) => {
          if (disposed) return;
          if (url !== "/simulator/obsidian-material-v1.webp" &&
            !state?.cards.some((item) => item.artworkUrl === url) &&
            !state?.mainframes.some((item) => item.artworkUrl === url))
            return;
          textures.set(url, texture);
          render();
        })
        .catch(() => {});
    }
    cancelAnimationFrame(frame);
    render();
  }
  const resize = new ResizeObserver(render);
  resize.observe(host);
  // The fixed viewport can stay the same size while fonts or setup controls
  // change the grid tracks and move the native card targets.
  const observeLayout = () => {
    for (const child of host.children) {
      if (child !== app.canvas) resize.observe(child, { box: "border-box" });
    }
  };
  observeLayout();
  const layoutChanges = new MutationObserver(() => {
    observeLayout();
    render();
  });
  layoutChanges.observe(host, { childList: true });
  const onFontsLoaded = () => render();
  document.fonts.addEventListener("loadingdone", onFontsLoaded);
  void document.fonts.ready.then(onFontsLoaded);
  const onScroll = () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      render();
    });
  };
  host.addEventListener("scroll", onScroll, true);
  return {
    update,
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(scrollFrame);
      host.removeEventListener("scroll", onScroll, true);
      resize.disconnect();
      layoutChanges.disconnect();
      document.fonts.removeEventListener("loadingdone", onFontsLoaded);
      app.destroy(
        { removeView: true, releaseGlobalResources: false },
        { children: true },
      );
    },
  };
}
