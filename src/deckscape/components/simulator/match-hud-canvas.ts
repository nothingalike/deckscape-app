import { drawIntent } from "./intent-graphics";
import { canvasResolution } from "./canvas-resolution";
import { recordSimulatorMetric } from "./performance-metrics";
import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  type Texture,
} from "pixi.js";

export async function mountHudCanvas(
  host: HTMLElement,
  content: HTMLElement,
  stopped: () => boolean,
  background = true,
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
    return () => {};
  }
  host.appendChild(app.canvas);
  let disposed = false,
    frame = 0;
  const artwork = new Map<string, Texture | null>();
  const backgroundLayer = new Container();
  const controlLayer = new Container();
  const linkLayer = new Container();
  app.stage.addChild(backgroundLayer, controlLayer, linkLayer);
  const controlsByNode = new Map<HTMLElement, {
    signature: string;
    visual: Container;
    label?: string;
    primary?: { enabled: boolean; fill: string };
  }>();
  let backgroundSignature = "";
  let linkSignature = "";
  let lastSize = "";
  const render = () => {
    frame = 0;
    if (disposed) return;
    const contentBounds = content.getBoundingClientRect();
    const turnPanel = content.querySelector<HTMLElement>("[data-turn-panel]");
    const split = turnPanel && getComputedStyle(turnPanel).position === "fixed";
    const turnBounds = split ? turnPanel.getBoundingClientRect() : contentBounds;
    const toolbarBounds = content.querySelector<HTMLElement>("[data-hud-toolbar]")?.getBoundingClientRect() ?? contentBounds;
    const autoBounds = content.querySelector<HTMLElement>("[data-pixi-switch]")?.closest("label")?.parentElement?.getBoundingClientRect() ?? contentBounds;
    const faces = [contentBounds, turnBounds, toolbarBounds, autoBounds];
    const measuredBounds = {
      left: Math.min(...faces.map((face) => face.left)),
      top: Math.min(...faces.map((face) => face.top)),
      width: Math.max(...faces.map((face) => face.right)) - Math.min(...faces.map((face) => face.left)),
      height: Math.max(...faces.map((face) => face.bottom)) - Math.min(...faces.map((face) => face.top)),
    };
    const resolution = canvasResolution(3);
    const left = Math.floor(measuredBounds.left * resolution) / resolution;
    const top = Math.floor(measuredBounds.top * resolution) / resolution;
    const bounds = {
      left, top,
      width: Math.ceil((measuredBounds.left + measuredBounds.width - left) * resolution) / resolution,
      height: Math.ceil((measuredBounds.top + measuredBounds.height - top) * resolution) / resolution,
    };
    app.canvas.style.position = "absolute";
    app.canvas.style.left = `${bounds.left - contentBounds.left}px`;
    app.canvas.style.top = `${bounds.top - contentBounds.top}px`;
    const size = JSON.stringify([bounds.width, bounds.height, resolution]);
    let changed = size !== lastSize;
    if (size !== lastSize) {
      app.renderer.resize(Math.max(1, bounds.width), Math.max(1, bounds.height), resolution);
      lastSize = size;
    }
    app.canvas.dataset.pixelResolution = String(resolution);
    const cacheSurface = content.hasAttribute("data-cache-surface");
    const actionSurface = content.hasAttribute("data-action-surface");
    const nextBackground = JSON.stringify([background, actionSurface, cacheSurface, split, bounds, contentBounds, turnBounds]);
    if (nextBackground !== backgroundSignature) {
      changed = true;
      for (const child of backgroundLayer.removeChildren()) child.destroy({ children: true });
      backgroundSignature = nextBackground;
    if (actionSurface) {
      backgroundLayer.addChild(new Graphics()
        .roundRect(contentBounds.left - bounds.left + 0.5, contentBounds.top - bounds.top + 0.5, contentBounds.width - 1, contentBounds.height - 1, 7)
        .fill({ color: "#101719", alpha: 245 / 255 })
        .stroke({ color: "#293236", width: 1 }));
    }
    if (background && cacheSurface) {
      const w = bounds.width, h = bounds.height;
      const plate = new Graphics();
      plate.poly([11,1,w-11,1,w-1,11,w-1,h-11,w-11,h-1,11,h-1,1,h-11,1,11])
        .fill("#091216").stroke({color:"#38545d",width:2});
      plate.poly([12,5,w-12,5,w-5,12,w-5,h-12,w-12,h-5,12,h-5,5,h-12,5,12])
        .stroke({color:"#1c333c",width:1});
      plate.moveTo(5,25).lineTo(5,12).lineTo(12,5).lineTo(30,5)
        .moveTo(w-5,h-25).lineTo(w-5,h-12).lineTo(w-12,h-5).lineTo(w-30,h-5)
        .stroke({color:"#71becb",width:1,alpha:0.7});
      backgroundLayer.addChild(plate);
    }
    if (background && !cacheSurface) for (const face of split ? [contentBounds, turnBounds] : [contentBounds])
      backgroundLayer.addChild(
        new Graphics()
          .roundRect(face.left - bounds.left + 1, face.top - bounds.top + 1, face.width - 2, face.height - 2, 8)
          .fill("#10232b")
          .stroke({ color: "#527080", width: 1 }),
      );
    }
    const controls: string[] = [];
    const primaryActions: { enabled: boolean; fill: string }[] = [];
    const usedNodes = new Set<HTMLElement>();
    for (const node of content.querySelectorAll<HTMLElement>(
      "[data-pixi-text], [data-pixi-button], [data-pixi-switch], [data-pixi-card], [data-pixi-primary='true'] button",
    )) {
      if (!node.getClientRects().length) continue;
      const rect = node.getBoundingClientRect();
      const x = rect.left - bounds.left,
        y = rect.top - bounds.top;
      const button = node.matches("button,summary");
      const phaseIcon = !!node.closest('[aria-label="Turn stages"]');
      const current = node.getAttribute("aria-current") === "step";
      const focused = node === document.activeElement || node.matches(":hover");
      const disabled = node.matches(":disabled");
      const card = node.hasAttribute("data-pixi-card");
      const primary = button && !!node.closest('[data-pixi-primary="true"]');
      const url = card ? node.dataset.pixiArtwork : undefined;
      const signature = JSON.stringify([
        x, y, rect.width, rect.height, button, phaseIcon, current, focused,
        disabled, card, primary, cacheSurface, split, resolution,
        node.dataset.pixiSwitch, node.dataset.pixiLabel, url,
        url ? !!artwork.get(url) : false,
        node.textContent, node.getAttribute("aria-label"), node.tagName,
        node.hasAttribute("data-pixi-nowrap"),
        node.previousElementSibling === document.activeElement,
        getComputedStyle(node).fontSize,
      ]);
      usedNodes.add(node);
      const previous = controlsByNode.get(node);
      if (previous?.signature === signature) {
        if (previous.label !== undefined) controls.push(previous.label);
        if (previous.primary) primaryActions.push(previous.primary);
        continue;
      }
      changed = true;
      if (previous) {
        controlLayer.removeChild(previous.visual);
        previous.visual.destroy({ children: true });
      }
      const visual = new Container();
      recordSimulatorMetric("hudVisualBuild");
      let controlLabel: string | undefined;
      let primaryAction: { enabled: boolean; fill: string } | undefined;
      if (node.hasAttribute("data-pixi-switch")) {
        const enabled = node.dataset.pixiSwitch === "on";
        const arrow = new Text({ text: "»", resolution, roundPixels: true, style: { fontFamily: "Arial", fontSize: 24, fill: enabled ? "#d5ff9d" : "#789096" } });
        arrow.anchor.set(0.5);
        arrow.position.set(x + rect.width / 2, y + rect.height / 2);
        visual.addChild(new Graphics().roundRect(x, y, rect.width, rect.height, 5).fill(enabled ? "#425b2e" : "#183440").stroke({ color: node.previousElementSibling === document.activeElement ? "#ffffff" : "#527080", width: 1 }), arrow);
        controlLayer.addChild(visual);
        controlsByNode.set(node, { signature, visual });
        continue;
      }
      if (button) {
        const fill = primary
          ? disabled
            ? "#26332b"
            : focused
              ? "#d1ff80"
              : "#c3f66b"
          : current
            ? "#425b2e"
            : focused
              ? "#294a5b"
              : "#183440";
        if (!phaseIcon && !cacheSurface)
        visual.addChild(
          new Graphics()
            .roundRect(x, y, rect.width, rect.height, 5)
            .fill(fill)
            .stroke({
              color: focused
                ? "#eef5ff"
                : primary && !disabled
                  ? "#c3f66b"
                  : current
                    ? "#b7ed78"
                    : "#527080",
              width: focused ? 2 : 1,
            }),
        );
        if (primary) {
          primaryAction = { enabled: !disabled, fill };
          primaryActions.push(primaryAction);
        }
        controlLabel = node.getAttribute("aria-label") ?? node.textContent ?? "";
        controls.push(controlLabel);
      }
      const label = new Text({
        resolution,
        roundPixels: true,
        text: node.dataset.pixiLabel ?? node.textContent ?? "",
        style: {
          fontFamily: "Arial",
          fontSize: phaseIcon ? (node.hasAttribute("data-step-name") ? 12 : 27) : card ? 11 : node.dataset.pixiLabel ? 19 : Number.parseFloat(getComputedStyle(node).fontSize) || 12,
          fontWeight: phaseIcon || node.tagName === "STRONG" ? "bold" : "normal",
          fill: disabled
            ? "#789096"
            : primary
              ? "#10140d"
              : current
                ? "#d5ff9d"
                : phaseIcon
                  ? "#d3e5e8"
                  : "#e4f1f2",
          dropShadow: phaseIcon
            ? {
                color: current ? "#a7ed5e" : "#7dc8d8",
                alpha: focused ? 1 : current ? 0.85 : 0.65,
                blur: focused ? 9 : 6,
                distance: 0,
              }
            : !button && !card
              ? { color: "#000000", alpha: 0.85, blur: 4, distance: 1 }
              : undefined,
          wordWrap: !!split || !node.hasAttribute("data-pixi-nowrap"),
          wordWrapWidth: Math.max(1, rect.width - 8),
          align: button ? "center" : "left",
        },
      });
      label.position.set(
        x + (button ? rect.width / 2 : 0),
        y + (button ? rect.height / 2 : 0),
      );
      if (button) label.anchor.set(0.5);
      visual.addChild(label);
      if (url && !artwork.has(url)) {
        artwork.set(url, null);
        void Assets.load<Texture>(url)
          .then((texture) => {
            if (disposed) return;
            artwork.set(url, texture);
            schedule();
          })
          .catch(() => {});
      }
      const texture = url ? artwork.get(url) : null;
      if (texture) {
        label.visible = false;
        const sprite = new Sprite(texture);
        const scale = Math.min(
          rect.width / texture.width,
          rect.height / texture.height,
        );
        sprite.scale.set(scale);
        sprite.position.set(
          x + (rect.width - sprite.width) / 2,
          y + (rect.height - sprite.height) / 2,
        );
        visual.addChild(sprite);
      }
      controlLayer.addChild(visual);
      controlsByNode.set(node, { signature, visual, label: controlLabel, primary: primaryAction });
    }
    for (const [node, entry] of controlsByNode) {
      if (usedNodes.has(node)) continue;
      controlLayer.removeChild(entry.visual);
      entry.visual.destroy({ children: true });
      controlsByNode.delete(node);
      changed = true;
    }
    // Continue the same measured board links above the floating Cache artwork.
    // The canvas clips this pass to the Cache surface; the board owns the rest.
    const intents: import("./board-canvas").ViewportIntent[] = JSON.parse(
      content.dataset.pixiIntents ?? "[]",
    );
    const nextLinks = JSON.stringify([bounds.left, bounds.top, intents]);
    if (nextLinks !== linkSignature) {
    for (const child of linkLayer.removeChildren()) child.destroy({ children: true });
    linkSignature = nextLinks;
    changed = true;
    const links = new Graphics();
    for (const line of intents) {
      const from = {
        x: line.from.x - bounds.left,
        y: line.from.y - bounds.top,
      };
      const to = { x: line.to.x - bounds.left, y: line.to.y - bounds.top };
      drawIntent(links, from, to, line.target, line.draft, line.scale);
    }
    linkLayer.addChild(links);
    }
    app.canvas.dataset.intentLayer = "above-cards";
    app.canvas.dataset.intentCount = String(intents.length);
    app.canvas.dataset.hudControls = JSON.stringify(controls);
    app.canvas.dataset.hudPrimaryActions = JSON.stringify(primaryActions);
    if (changed) {
      recordSimulatorMetric("hudPaint");
      app.render();
    }
  };
  const schedule = () => {
    if (!disposed && !frame) frame = requestAnimationFrame(render);
  };
  const resize = new ResizeObserver(schedule);
  resize.observe(content);
  const mutations = new MutationObserver((records) => {
    // A floating surface may host its canvas inside the measured content.
    // Canvas resizing/diagnostics must not schedule another paint of themselves.
    if (records.some((record) => !host.contains(record.target))) schedule();
  });
  mutations.observe(content, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  const events = ["pointerover", "pointerout", "focusin", "focusout", "toggle"];
  for (const event of events) content.addEventListener(event, schedule, true);
  window.addEventListener("resize", schedule);
  render();
  return () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    resize.disconnect();
    mutations.disconnect();
    for (const event of events)
      content.removeEventListener(event, schedule, true);
    window.removeEventListener("resize", schedule);
    // Do not clear global pools while the battlefield renderer still uses them.
    app.destroy(
      { removeView: true, releaseGlobalResources: false },
      { children: true },
    );
  };
}
