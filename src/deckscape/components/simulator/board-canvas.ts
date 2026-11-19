import {
  Application,
  Assets,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  type Texture,
} from "pixi.js";
import {
  presentationFor,
  type BoardZone,
  type CardPresentation,
  type VisibleBoardCard,
} from "@/lib/simulator/board-view";
import {
  TABLE_WIDTH as BOARD_WIDTH,
  TABLE_CARD_WIDTH as CARD_WIDTH,
  TABLE_CARD_HEIGHT as CARD_HEIGHT,
  layoutTable,
} from "@/lib/simulator/table-layout";
import { gearPortChoiceId } from "@/lib/simulator/gear-port-choice";
import { canvasResolution } from "./canvas-resolution";
import { recordSimulatorMetric } from "./performance-metrics";
import type { BoardIntentLink } from "./board-interaction";
import { boardCardStateSummary } from "@/lib/simulator/board-card-status";
import type { CardActionCue } from "@/lib/simulator/card-action-cues";
import { badgeArtForLabel } from "@/lib/achievements/badge-artwork";
import { drawIntent } from "./intent-graphics";
import type { BoardAnchorListener } from "./board-anchors";
import { drawBoardSurface } from "./board-surface";
import { shouldAnnouncePhase, type PhaseAnnouncement } from "@/lib/simulator/phase-announcement";

export interface BoardCanvasState {
  compactHand?: boolean;
  onAnchorLayout?: BoardAnchorListener;
  phaseAnnouncement?: PhaseAnnouncement | null;
  touchHandExpanded?: boolean;
  combatRoles?: Readonly<Record<string, "Attacking" | "Blocking">>;
  actionCues?: Readonly<Record<string, CardActionCue>>;
  fitViewport?: boolean;
  onIntentLayout?: (lines: ViewportIntent[]) => void;
  zones: readonly BoardZone[];
  presentations: Readonly<Record<string, CardPresentation>>;
  selected: string | null;
  previewedCardId?: string | null;
  inspect: (id: string) => void;
  seat: 0 | 1;
  candidates?: readonly string[];
  chosen?: readonly string[];
  descriptions?: Readonly<Record<string, string>>;
  hover?: (card: { id: string; x: number; y: number } | null) => void;
  activeCardId?: string | null;
  assignments?: readonly BoardIntentLink[];
  endpointPlacements?: Readonly<Record<string, { x: number; y: number }>>;
  cacheEntries?: readonly {
    endpointId: string;
    card?: VisibleBoardCard;
  }[];
  playerPanels?: readonly {
    seat: 0 | 1;
    name: string;
    title?: string | null;
    badge?: string | null;
    active: boolean;
    mainframeHealth: number;
    bioframeHealth: number;
    readyRam: number;
    runningRam: number;
    committedRam: number;
    cyberdeckCount: number;
    ramDeckCount: number;
    recycleCount: number;
    purgeCount: number;
    tiers: readonly { index: number; active: boolean; replaced?: boolean }[];
  }[];
  highlightedPanelControl?: string | null;
  openResourceSeats?: readonly number[];
  expandedRamStacks?: readonly string[];
  toggleRamStack?: (key: string) => void;
  forceQuit?: boolean;
  cacheHidden?: boolean;
  onPlayerPanelLayout?: (
    placements: readonly {
      seat: 0 | 1;
      x: number;
      y: number;
      width: number;
      height: number;
      scale: number;
      nameX: number;
      nameY: number;
      piles: { x: number; y: number; width: number; gap: number; height: number };
    }[],
  ) => void;
}

export interface ViewportIntent {
  draft?: boolean;
  from: { x: number; y: number };
  to: { x: number; y: number };
  target: boolean;
  scale: number;
}

export interface BoardCanvasRenderer {
  readonly canvas: HTMLCanvasElement;
  update(state: BoardCanvasState): void;
  dispose(): void;
}

function pileSpacing(panelX: number, scale: number, mobile: boolean) {
  const width = mobile ? Math.max(64, 28 / scale) : 64;
  const start = mobile ? panelX + 285 + 6 / scale : panelX - 216;
  const step = mobile ? width + 4 / scale : 70;
  return { start, step, width, bankStart: start + step + width + 6 / scale };
}

function measureLayout(host: HTMLElement, state: BoardCanvasState) {
  recordSimulatorMetric("boardLayout");
  const { zones, presentations, seat } = state;
  const expandedRam = new Set(state.expandedRamStacks ?? []);
  const candidates = new Set(state.candidates ?? []);
  const panelHeight = Math.max(
    240,
    ...(state.playerPanels ?? []).map((panel) => panel.tiers.length * 58 + 60),
  );
  const cropHand = (layout: ReturnType<typeof layoutTable>) => {
    const hand = layout.areas.find((area) => area.zone.id === `${seat}:hand`);
    return state.fitViewport && hand?.cards.length
      ? { ...layout, height: layout.height - 62 }
      : layout;
  };
  const baseLayout = cropHand(
    layoutTable(
      zones,
      seat,
      BOARD_WIDTH,
      presentations,
      expandedRam,
      candidates,
      panelHeight,
    ),
  );
  // Widen the zones rather than leaving an unused strip beside a height-fitted canvas.
  const availableHeight = state.fitViewport
    ? Math.max(1, host.clientHeight)
    : Math.max(
        420,
        window.innerHeight -
          Math.max(0, host.getBoundingClientRect().top + window.scrollY) -
          62,
      );
  let width = Math.max(
    BOARD_WIDTH,
    Math.ceil((host.clientWidth * baseLayout.height) / availableHeight),
  );
  // Find the largest card scale that fits after wider banks reduce row wrapping.
  let minimum = BOARD_WIDTH;
  while (minimum < width) {
    const candidate = Math.floor((minimum + width) / 2);
    const candidateLayout = cropHand(
      layoutTable(
        zones,
        seat,
        candidate,
        presentations,
        expandedRam,
        candidates,
        panelHeight,
      ),
    );
    if (
      (host.clientWidth * candidateLayout.height) / candidate <=
      availableHeight
    )
      width = candidate;
    else minimum = candidate + 1;
  }
  const layout = cropHand(
    layoutTable(
      zones,
      seat,
      // Preserve readable desktop cards instead of shrinking a crowded table indefinitely.
      // Narrow screens retain the existing horizontally scrollable composition.
      !state.fitViewport && host.clientWidth >= 1000
        ? Math.min(
            width,
            Math.max(BOARD_WIDTH, Math.floor(host.clientWidth / 0.8)),
          )
        : width,
      presentations,
      expandedRam,
      candidates,
      panelHeight,
    ),
  );
  if (state.fitViewport) {
    const extra = Math.max(
      0,
      (host.clientHeight * layout.width) / host.clientWidth - layout.height,
    );
    // Distribute spare height through the play area instead of leaving one
    // large void above the local support row. Keep the hand anchored below.
    for (const panel of layout.panels)
      if (panel.seat === seat) panel.y += extra;
    for (const area of layout.areas) {
      const fraction =
        area.zone.id === `${seat}:ram` || area.zone.id === `${seat}:hand`
          ? 1
          : area.zone.id === `${seat}:arena`
            ? 2 / 3
            : area.zone.id === `${1 - seat}:arena`
              ? 1 / 3
              : area.zone.id === "environment"
                ? 1 / 2
                : area.zone.id === "cache"
                  ? 2 / 3
                  : 0;
      const offset = extra * fraction;
      area.y += offset;
      for (const card of area.cards) card.y += offset;
      for (const slot of area.slots) slot.y += offset;
    }
    layout.height += extra;
  }
  if (state.fitViewport && window.innerWidth <= 1280 && window.innerHeight <= 600 && window.innerWidth > window.innerHeight) {
    // Mobile landscape keeps the play area wide, with local support tucked
    // toward the bottom-left. Transform shared geometry, not canvas alone.
    const dx = -layout.width * 0.25;
    const localPanel = layout.panels.find((item) => item.seat === seat);
    const supportAreas = layout.areas.filter((area) =>
      [`${seat}:ram`, `${seat}:recycle`, `${seat}:purge`].includes(area.zone.id),
    );
    // Include the resource control and pile faces, not the panel's unused
    // layout padding, when anchoring the visible support group to the edge.
    const supportBottom = Math.max(
      localPanel ? localPanel.y + 190 : 0,
      ...supportAreas.flatMap((area) => area.cards.map((card) => card.y + card.height)),
    );
    const dy = layout.height - supportBottom - 4;
    for (const panel of layout.panels) {
      if (panel.seat === seat) { panel.x += dx; panel.y += dy; }
    }
    for (const area of layout.areas) {
      if (![`${seat}:ram`, `${seat}:recycle`, `${seat}:purge`].includes(area.zone.id)) continue;
      area.x += dx;
      area.y += dy;
      for (const card of area.cards) { card.x += dx; card.y += dy; }
      for (const slot of area.slots) { slot.x += dx; slot.y += dy; }
    }
    const hand = layout.areas.find((area) => area.zone.id === `${seat}:hand`);
    const panel = layout.panels.find((item) => item.seat === seat);
    if (panel) {
      const right = Math.max(panel.x + 280, ...supportAreas.flatMap((area) => area.cards.map((card) => card.x + card.width)));
      const shift = layout.width / 2 - 20 - right;
      panel.x += shift;
      for (const area of supportAreas) {
        area.x += shift;
        for (const card of area.cards) card.x += shift;
        for (const slot of area.slots) slot.x += shift;
      }
    }
    if (hand?.cards.length && panel) {
      const left = Math.min(...hand.cards.map((card) => card.x));
      const right = Math.max(...hand.cards.map((card) => card.x + card.width));
      const top = Math.min(...hand.cards.map((card) => card.y));
      const handDx = layout.width / 2 - (left + right) / 2;
      const handDy = layout.height - Math.max(...hand.cards.map((card) => card.height)) * 0.75 - top;
      hand.x += handDx;
      hand.y += handDy;
      for (const card of hand.cards) { card.x += handDx; card.y += handDy; }
      {
        const center = (Math.min(...hand.cards.map((card) => card.x)) + Math.max(...hand.cards.map((card) => card.x + card.width))) / 2;
        const scale = state.touchHandExpanded ? Math.min(3.4, layout.width * 0.9 / (right - left), layout.height * 0.72 / Math.max(...hand.cards.map((card) => card.height))) : 1.2;
        for (const card of hand.cards) {
          card.x = (state.touchHandExpanded ? layout.width / 2 : center) + (card.x - center) * scale;
          card.width *= scale;
          card.height *= scale;
          if (card.handHitWidth) card.handHitWidth *= scale;
          card.y = layout.height - card.height * (state.touchHandExpanded ? 0.95 : 0.75) + (state.touchHandExpanded ? Math.abs(card.x + card.width / 2 - layout.width / 2) * 0.08 : 0);
        }
      }
    }
    // Both mobile support groups follow the left-edge player identity. Leave
    // space after synergy for the two pile icons before the RAM bank.
    for (const supportPanel of layout.panels) {
      const shift = 300 - supportPanel.x;
      supportPanel.x += shift;
      const bank = layout.areas.find((area) => area.zone.id === `${supportPanel.seat}:ram`);
      if (bank) {
        const bankShift = pileSpacing(supportPanel.x, host.clientWidth / layout.width, true).bankStart - bank.x;
        bank.x += bankShift;
        for (const card of bank.cards) card.x += bankShift;
        for (const slot of bank.slots) slot.x += bankShift;
      }
    }
    // Spend the reclaimed middle of the mobile screen on card size, not gaps.
    // Keep a clear right-side HUD/Cache strip; transform entire formations so
    // attachments, selection slots and intent endpoints remain aligned.
    const screenScale = host.clientWidth / layout.width;
    const arenaWidth = layout.width - 132 / screenScale;
    const arenaLeft = 132 / screenScale;
    const centerX = (arenaLeft + arenaWidth) / 2;
    const environment = layout.areas.find((area) => area.zone.id === "environment");
    const environmentHeight = environment?.cards.length
      // Reserve the rendered (enlarged) card plus 12 screen pixels per side.
      ? Math.max(...environment.cards.map((card) => card.height)) * 1.5 + 24 / screenScale
      : 24;
    const top = layout.height * 0.16;
    const bottom = layout.height * 0.81;
    const laneHeight = Math.max(1, (bottom - top - environmentHeight) / 2);
    for (const area of layout.areas) {
      if (![`${seat}:arena`, `${1 - seat}:arena`, "environment"].includes(area.zone.id)) continue;
      const objects = [...area.cards, ...area.slots];
      if (!objects.length) continue;
      const left = Math.min(...objects.map((item) => item.x));
      const right = Math.max(...objects.map((item) => item.x + ("size" in item ? item.size : item.width)));
      const upper = Math.min(...objects.map((item) => item.y));
      const lower = Math.max(...objects.map((item) => item.y + ("size" in item ? item.size : item.height)));
      const isEnvironment = area.zone.id === "environment";
      // Tune relative prominence without moving the established lane centers.
      const scale = isEnvironment ? 1.5 : 0.85 * Math.min(1.6, (arenaWidth - arenaLeft) / (right - left), laneHeight / (lower - upper));
      const centerY = isEnvironment
        ? top + laneHeight + environmentHeight / 2
        : area.zone.id === `${seat}:arena`
          ? bottom - laneHeight / 2
          : top + laneHeight / 2;
      for (const item of objects) {
        item.x = centerX + (item.x - (left + right) / 2) * scale;
        item.y = centerY + (item.y - (upper + lower) / 2) * scale;
        if ("size" in item) item.size *= scale;
        else { item.width *= scale; item.height *= scale; item.formationScale = (item.formationScale ?? 1) * scale; }
      }
      area.x = arenaLeft;
      area.width = arenaWidth - arenaLeft;
      area.y = centerY - (lower - upper) * scale / 2;
      area.height = (lower - upper) * scale;
    }
  }
  if (state.fitViewport && state.touchHandExpanded && !(window.innerWidth <= 1280 && window.innerHeight <= 600 && window.innerWidth > window.innerHeight)) {
    const hand = layout.areas.find((area) => area.zone.id === `${seat}:hand`);
    if (hand?.cards.length) {
      const left = Math.min(...hand.cards.map(card => card.x));
      const right = Math.max(...hand.cards.map(card => card.x + card.width));
      const scale = Math.min(2.4, layout.width * 0.88 / (right - left), layout.height * 0.48 / Math.max(...hand.cards.map(card => card.height)));
      for (const card of hand.cards) {
        card.x = layout.width / 2 + (card.x - (left + right) / 2) * scale;
        card.width *= scale;
        card.height *= scale;
        if (card.handHitWidth) card.handHitWidth *= scale;
        card.y = layout.height - card.height * 0.95 + Math.abs(card.x + card.width / 2 - layout.width / 2) * 0.08;
      }
    }
  }
  return layout;
}

/** No ticker or game commands: retain one canvas and repaint only from React state. */
export async function mountBoardCanvas(
  host: HTMLElement,
  signal: AbortSignal,
  initialState: BoardCanvasState,
): Promise<BoardCanvasRenderer | undefined> {
  const app = new Application();
  const initialLayout = measureLayout(host, initialState);
  await app.init({
    width: initialLayout.width,
    height: initialLayout.height,
    background: "#070c10",
    antialias: true,
    resolution: canvasResolution(),
    autoStart: false,
    preference: "webgl",
  });
  if (signal.aborted) {
    app.destroy(
      { removeView: true, releaseGlobalResources: false },
      { children: true },
    );
    return;
  }
  let disposed = false;
  let boardMaterial: Texture | undefined;
  let boardSurface: Container | undefined;
  let boardSurfaceKey = "";
  let renderVersion = 0;
  let currentHover = initialState.hover;
  let hoveredCard: { id: string; x: number; y: number } | null = null;
  let latestState = initialState;
  let touchHandExpanded = false;
  let mouseHandExpanded = false;
  let handHitCards: readonly { x: number; y: number; width: number; height: number }[] = [];
  const hoverHand = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || !latestState.fitViewport) return;
    const bounds = app.canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * app.screen.width / bounds.width;
    const y = (event.clientY - bounds.top) * app.screen.height / bounds.height;
    const inside = handHitCards.some(card => x >= card.x - 8 && x <= card.x + card.width + 8 && y >= card.y - 56 && y <= card.y + card.height) && event.clientY <= bounds.bottom;
    if (inside !== mouseHandExpanded) {
      mouseHandExpanded = inside;
      if (!inside) { hoveredCard = null; currentHover?.(null); }
      redraw?.();
    }
  };
  window.addEventListener("pointermove", hoverHand);
  let occludedHud: HTMLElement | null = null;
  const clearHandOcclusion = () => {
    occludedHud?.style.removeProperty("clip-path");
    occludedHud = null;
  };
  const outsideHand = (event: PointerEvent) => {
    if (!touchHandExpanded || event.pointerType === "mouse") return;
    const bounds = app.canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * app.screen.width / bounds.width;
    const y = (event.clientY - bounds.top) * app.screen.height / bounds.height;
    if (handHitCards.some((card) => x >= card.x && x <= card.x + card.width && y >= card.y - 56 && y <= card.y + card.height)) return;
    touchHandExpanded = false;
    redraw?.();
  };
  window.addEventListener("pointerdown", outsideHand, true);
  let redraw: (() => void) | undefined;
  const cardTiles = new Map<string, Container>();
  const tileVisuals = new Map<string, { signature: string; hoverFrame: Graphics }>();
  let paintFrame = 0;
  let lastPhase = initialState.phaseAnnouncement ?? null;
  let phaseBanner: Container | null = null;
  let phaseStart = 0;
  let phaseFrame = 0;
  let phaseTimer: ReturnType<typeof setTimeout> | undefined;
  let suppressNextPhase = false;
  const clearPhase = () => {
    cancelAnimationFrame(phaseFrame);
    phaseFrame = 0;
    clearTimeout(phaseTimer);
    phaseTimer = undefined;
    phaseBanner?.removeFromParent();
    phaseBanner?.destroy({ children: true });
    phaseBanner = null;
    app.canvas.dataset.phaseAnnouncement = "";
  };
  const animatePhase = (now: number) => {
    phaseFrame = 0;
    if (!phaseBanner || disposed) return;
    const elapsed = now - phaseStart;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fadeIn = reduced ? 0 : 180;
    const hold = reduced ? 650 : 760;
    const fadeOut = reduced ? 0 : 220;
    if (elapsed >= fadeIn + hold + fadeOut) {
      clearPhase();
      requestPaint();
      return;
    }
    if (elapsed >= fadeIn && elapsed < fadeIn + hold) {
      phaseBanner.alpha = 1;
      requestPaint();
      phaseTimer = setTimeout(() => {
        phaseTimer = undefined;
        phaseFrame = requestAnimationFrame(animatePhase);
      }, fadeIn + hold - elapsed);
      return;
    }
    phaseBanner.alpha = elapsed < fadeIn ? elapsed / fadeIn
      : 1 - (elapsed - fadeIn - hold) / fadeOut;
    requestPaint();
    phaseFrame = requestAnimationFrame(animatePhase);
  };
  const visibilityChanged = () => {
    if (document.hidden) {
      clearPhase();
      suppressNextPhase = true;
    }
  };
  document.addEventListener("visibilitychange", visibilityChanged);
  const requestPaint = () => {
    if (paintFrame || disposed) return;
    paintFrame = requestAnimationFrame(() => {
      paintFrame = 0;
      if (!disposed) {
        recordSimulatorMetric("boardPaint");
        app.render();
      }
    });
  };
  const resize = () => {
    app.canvas.style.width = `${host.clientWidth}px`;
    redraw?.();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  window.addEventListener("resize", resize);
  const scroll = () => redraw?.();
  window.addEventListener("scroll", scroll, true);
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    clearHandOcclusion();
    renderVersion++;
    currentHover?.(null);
    hoveredCard = null;
    observer.disconnect();
    window.removeEventListener("resize", resize);
    window.removeEventListener("pointerdown", outsideHand, true);
    window.removeEventListener("pointermove", hoverHand);
    window.removeEventListener("scroll", scroll, true);
    document.removeEventListener("visibilitychange", visibilityChanged);
    clearPhase();
    cardTiles.clear();
    tileVisuals.clear();
    cancelAnimationFrame(paintFrame);
    // The HUD uses a second renderer; its live text still owns pooled textures.
    app.destroy(
      { removeView: true, releaseGlobalResources: false },
      { children: true },
    );
  };
  signal.addEventListener("abort", cleanup, { once: true });
  app.canvas.style.height = "auto";
  resize();
  app.canvas.setAttribute("aria-hidden", "true");
  host.appendChild(app.canvas);

  type HandBounds = {
    x: number;
    y: number;
    lift: number;
    hitWidth: number;
    width: number;
    height: number;
  };
  // Reused tiles must publish through the current layout, not an old closure.
  let publishHandAnchor: ((id: string, hand: HandBounds) => void) | undefined;
  const update = (state: BoardCanvasState) => {
    if (disposed) return;
    publishHandAnchor = undefined;
    latestState = state;
    const version = ++renderVersion;
    const isCurrent = () => !disposed && version === renderVersion;
    if (currentHover !== state.hover) {
      currentHover?.(null);
      state.hover?.(hoveredCard);
    }
    currentHover = state.hover;
    app.canvas.title = "";
    const retainedTiles = new Set(cardTiles.values());
    for (const child of app.stage.removeChildren()) {
      if (!retainedTiles.has(child) && child !== boardSurface && child !== phaseBanner) child.destroy({ children: true });
    }
    for (const tile of retainedTiles) {
      tile.removeAllListeners();
      tile.rotation = 0;
      tile.zIndex = 0;
    }
    const {
      zones,
      presentations,
      selected,
      inspect,
      seat,
      candidates = [],
      chosen = [],
      descriptions = {},
      hover,
      activeCardId = null,
      assignments = [],
      endpointPlacements = {},
      cacheEntries = [],
      playerPanels = [],
      expandedRamStacks = [],
      toggleRamStack,
      forceQuit = false,
    } = state;
    if (state.compactHand) {
      touchHandExpanded = false;
      mouseHandExpanded = false;
    }
    const handExpanded = !state.compactHand && (touchHandExpanded || mouseHandExpanded);
    const layout = measureLayout(host, { ...state, touchHandExpanded: handExpanded });
    const nextPhase = state.phaseAnnouncement;
    if (nextPhase && lastPhase && nextPhase.revision < lastPhase.revision) {
      lastPhase = nextPhase;
      suppressNextPhase = false;
      clearPhase();
    } else if (nextPhase?.key !== lastPhase?.key) {
      const show = shouldAnnouncePhase(lastPhase, nextPhase ?? null, !document.hidden, suppressNextPhase);
      lastPhase = nextPhase ?? null;
      suppressNextPhase = false;
      clearPhase();
      if (show) {
        const caption = new Text({
          text: nextPhase!.label.toUpperCase(),
          style: { fontFamily: "Arial", fontSize: 30, fontWeight: "bold", fill: "#dcff95", letterSpacing: 3 },
        });
        caption.anchor.set(0.5);
        const width = Math.min(layout.width - 32, Math.max(310, caption.width + 80));
        const background = new Graphics()
          .roundRect(-width / 2, -31, width, 62, 12)
          .fill({ color: 0x10242b, alpha: 0.94 })
          .roundRect(-width / 2, -31, width, 62, 12)
          .stroke({ color: 0xc6ff74, width: 2, alpha: 0.9 });
        phaseBanner = new Container();
        phaseBanner.eventMode = "none";
        phaseBanner.zIndex = 1000;
        phaseBanner.addChild(background, caption);
        phaseBanner.alpha = 0;
        phaseStart = performance.now();
        app.canvas.dataset.phaseAnnouncement = nextPhase!.label;
        phaseFrame = requestAnimationFrame(animatePhase);
      }
    } else if (nextPhase && (!lastPhase || nextPhase.revision > lastPhase.revision)) {
      lastPhase = nextPhase;
    }
    if (phaseBanner) {
      const opponentArena = layout.areas.find((area) => area.zone.id === `${1 - state.seat}:arena`);
      const ownArena = layout.areas.find((area) => area.zone.id === `${state.seat}:arena`);
      const laneTop = opponentArena ? opponentArena.y + opponentArena.height : layout.height * 0.4;
      const laneBottom = ownArena?.y ?? laneTop + 100;
      phaseBanner.position.set(layout.width / 2, (laneTop + laneBottom) / 2);
      app.stage.addChild(phaseBanner);
    }
    handHitCards = layout.areas.find((area) => area.zone.id === `${seat}:hand`)?.cards ?? [];
    app.canvas.dataset.handExpanded = String(handExpanded);
    app.canvas.dataset.utilityOverlays = JSON.stringify(
      layout.areas
        .filter((area) => area.overlay && area.zone.id !== "cache")
        .map(({ zone, x, y, width, height }) => ({
          id: zone.id,
          x,
          y,
          width,
          height,
        })),
    );
    const displayScale = host.clientWidth / layout.width;
    // The HUD has its own canvas above the board. Cut the expanded hand's
    // footprint out of that layer AND its native hit targets, leaving the
    // remaining controls/toolbar visible and interactive.
    clearHandOcclusion();
    const expandedHand = handExpanded
      ? layout.areas.find((area) => area.zone.id === `${seat}:hand`)
      : undefined;
    const hud = host.closest("[data-game-viewport]")?.querySelector<HTMLElement>("[data-match-hud]");
    if (hud && expandedHand?.cards.length) {
      const boardRect = app.canvas.getBoundingClientRect();
      const hudRect = hud.getBoundingClientRect();
      const cards = expandedHand.cards;
      const left = boardRect.left - hudRect.left + Math.min(...cards.map((card) => card.x)) * displayScale;
      const right = boardRect.left - hudRect.left + Math.max(...cards.map((card) => card.x + card.width)) * displayScale;
      const top = boardRect.top - hudRect.top + Math.min(...cards.map((card) => card.y - 56)) * displayScale;
      const bottom = boardRect.top - hudRect.top + Math.max(...cards.map((card) => card.y + card.height)) * displayScale;
      hud.style.clipPath = `polygon(evenodd, -10000px -10000px, 10000px -10000px, 10000px 10000px, -10000px 10000px, -10000px -10000px, ${left}px ${top}px, ${right}px ${top}px, ${right}px ${bottom}px, ${left}px ${bottom}px, ${left}px ${top}px)`;
      occludedHud = hud;
    }
    // Screen-space inset keeps identity labels inside the decorative chassis.
    const identityInset = 16 / displayScale;
    const identityY = (panel: { seat: number; y: number }) =>
      state.fitViewport && panel.seat === seat
        ? layout.height - 75 - identityInset
        : panel.y + identityInset;
    app.canvas.dataset.cacheHidden = String(!!state.cacheHidden);
    state.onPlayerPanelLayout?.(
      layout.panels.map((panel) => ({
        ...panel,
        piles: (() => {
          const mobile = !!state.fitViewport && window.innerWidth <= 1280 && window.innerHeight <= 600 && window.innerWidth > window.innerHeight;
          const spacing = pileSpacing(0, displayScale, mobile);
          return { x: spacing.start, y: mobile ? (panel.seat === seat ? 62 : 22) : (panel.seat === seat ? 60 : 8), width: spacing.width, gap: spacing.step - spacing.width, height: mobile ? 72 : 130 };
        })(),
        x: panel.x * displayScale,
        y: panel.y * displayScale,
        scale: displayScale,
        nameX: identityInset - panel.x,
        nameY: identityY(panel) - panel.y,
      })),
    );
    app.renderer.resize(layout.width, layout.height, canvasResolution());
    // Logical layout units stay independent of the higher-density backing bitmap.
    app.canvas.style.width = `${host.clientWidth}px`;
    app.canvas.style.height = `${layout.height * displayScale}px`;
    app.canvas.dataset.logicalWidth = String(layout.width);
    app.canvas.dataset.logicalHeight = String(layout.height);
    app.canvas.dataset.actionSource = activeCardId ?? "";
    const renderedCombatRoles: Record<string, string> = {};
    const reservedRamHighlights: Record<string, { eligible: boolean; selected: boolean; color: string; x: number; y: number }> = {};
    app.canvas.dataset.inspectedCard = selected ?? "";
    app.canvas.dataset.assignments = JSON.stringify(assignments);
    app.canvas.dataset.chosen = JSON.stringify(chosen);
    app.canvas.dataset.candidates = JSON.stringify(candidates);
    app.canvas.dataset.actionCues = JSON.stringify(state.actionCues ?? {});
    app.canvas.dataset.forceQuitControls = forceQuit
      ? JSON.stringify(candidates)
      : "[]";
    app.canvas.dataset.expandedRamStacks = JSON.stringify(expandedRamStacks);
    app.canvas.dataset.ramStacks = JSON.stringify(
      [
        ...new Map(
          layout.areas
            .flatMap((area) => area.cards)
            .flatMap((placement) =>
              placement.ramStack
                ? [[placement.ramStack.key, placement.ramStack] as const]
                : [],
            ),
        ).values(),
      ].map((stack) => ({
        key: stack.key,
        count: stack.count,
        expanded: stack.expanded,
        selected: stack.memberIds.filter((id) => chosen.includes(id)).length,
      })),
    );
    app.canvas.dataset.selectedProgramSlot =
      chosen.find(
        (id) => id.startsWith("gear-port:") && id.includes('"program:'),
      ) ?? "";
    const label = (text: string, x: number, y: number, size = 14) => {
      const node = new Text({
        text,
        style: {
          fontFamily: "Arial",
          fontSize: size,
          fill: "#eef5ff",
          wordWrap: true,
          wordWrapWidth: CARD_WIDTH - 10,
        },
      });
      node.position.set(x, y);
      return node;
    };
    const positions = new Map<string, { x: number; y: number }>();
    type EndpointBounds = {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    const endpointBounds = new Map<string, EndpointBounds>();
    const canvasBounds = app.canvas.getBoundingClientRect();
    const viewportPoint = (id: string) => {
      const point = endpointPlacements[id];
      return point
        ? {
            x: (point.x - canvasBounds.left) / displayScale,
            y: (point.y - canvasBounds.top) / displayScale,
          }
        : undefined;
    };
    const registerBounds = (ids: readonly string[], bounds: EndpointBounds) => {
      for (const id of ids) {
        endpointBounds.set(id, bounds);
        positions.set(id, { x: bounds.x, y: bounds.y });
      }
    };
    const addArtwork = (
      container: Container,
      artworkUrl: string | undefined,
      width: number,
      height: number,
      fallback: Text,
      offset = { x: 0, y: 0 },
    ) => {
      if (!artworkUrl) return;
      void Assets.load<Texture>(artworkUrl)
        .then((texture) => {
          if (!isCurrent()) return;
          const sprite = new Sprite(texture);
          sprite.width = width;
          sprite.height = height;
          sprite.position.set(offset.x, offset.y);
          container.addChildAt(sprite, 1);
          fallback.visible = false;
          requestPaint();
        })
        .catch(() => {
          /* Retain the readable fallback when artwork cannot be loaded. */
        });
    };
    const hoverFrames = new Map<string, Graphics[]>();
    const handStates: Record<string, HandBounds> = {};
    app.canvas.dataset.handCards = "{}";
    const usedCardTiles = new Set<string>();
    const cardOccurrences = new Map<string, number>();
    const displayedGear = new Set(
      layout.areas.flatMap((area) =>
        area.cards
          .filter(
            (card) =>
              card.compact &&
              (card.iconLabel === "GEAR" || card.iconLabel === "PROGRAM"),
          )
          .map((card) => card.card.instanceId),
      ),
    );
    app.stage.sortableChildren = true;
    const surfaceKey = JSON.stringify([
      layout.width, layout.height, displayScale, seat, !!boardMaterial,
      layout.panels,
      layout.areas.filter((area) => area.zone.id.endsWith(":arena") || area.zone.id === "environment")
        .map((area) => [area.zone.id, area.x, area.y, area.width, area.height,
          area.cards.map((card) => [card.x, card.y, card.width, card.height, card.compact])]),
    ]);
    if (!boardSurface || surfaceKey !== boardSurfaceKey) {
      boardSurface?.destroy({ children: true });
      boardSurface = drawBoardSurface(layout, displayScale, seat, boardMaterial);
      boardSurfaceKey = surfaceKey;
    }
    app.stage.addChild(boardSurface);
    app.canvas.dataset.boardSurface = "obsidian-circuit";
    app.canvas.dataset.boardMaterial = boardMaterial ? "ready" : "fallback";

    // Mainframe artwork and native controls share intrinsic layout coordinates.
    // Cache controls still supply measured viewport endpoints independently.
    const renderedPanelControls: {
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      disabled: boolean;
      active: boolean;
    }[] = [];
    for (const panel of playerPanels) {
      const arena = layout.areas.find(
        (area) => area.zone.id === `${panel.seat}:arena`,
      );
      const mainframe = zones.find(
        (zone) => zone.id === `${panel.seat}:mainframe`,
      )?.cards[0];
      if (!arena || !mainframe) continue;
      const geometry = layout.panels.find((item) => item.seat === panel.seat)!;
      const panelX = geometry.x;
      const panelY = geometry.y + (panel.seat === seat ? 40 : 0);
      const nameY = identityY(geometry);
      const heading = label(
        panel.name.length > 28 ? `${panel.name.slice(0, 27)}…` : panel.name,
        identityInset,
        nameY,
        20,
      );
      heading.style.fontWeight = "bold";
      heading.style.wordWrap = false;
      const activity = label(
        panel.active ? "ACTIVE" : "WAITING",
        identityInset,
        nameY + 27,
        13,
      );
      activity.style.fill = panel.active ? "#77efd5" : "#92aeb6";
      heading.zIndex = activity.zIndex = 25;
      app.stage.addChild(heading, activity);
      if (panel.title || panel.badge) {
        const flairY = nameY + (panel.seat === seat ? -18 : 46);
        if (panel.badge) {
          const badgeLabel = panel.badge;
          const cx = identityInset + 10;
          const cy = flairY + 5;
          const badge = new Graphics()
            .poly([cx, cy - 11, cx + 10, cy - 6, cx + 10, cy + 6, cx, cy + 11, cx - 10, cy + 6, cx - 10, cy - 6])
            .fill({ color: "#23301b" })
            .stroke({ color: "#b8e86b", width: 1.5 });
          badge.zIndex = 25;
          app.stage.addChild(badge);
          const artwork = badgeArtForLabel(badgeLabel);
          if (artwork) void Assets.load<Texture>(artwork)
            .then((texture) => {
              if (!isCurrent()) return;
              const sprite = new Sprite(texture);
              sprite.width = 27;
              sprite.height = 27;
              sprite.position.set(cx - 13.5, cy - 13.5);
              sprite.zIndex = 25;
              app.stage.addChild(sprite);
              badge.visible = false;
              requestPaint();
            })
            .catch(() => { /* Retain the vector badge if artwork cannot load. */ });
          const tier = label(badgeLabel.split(" ").at(-1) ?? "", cx - 4, cy + 4, 9);
          tier.style.fill = "#b8e86b";
          tier.zIndex = 26;
          app.stage.addChild(tier);
        }
        if (panel.title) {
          const title = label(
            panel.title.length > 24 ? `${panel.title.slice(0, 23)}…` : panel.title,
            identityInset + (panel.badge ? 27 : 0),
            flairY,
            12,
          );
          title.style.fill = "#b8e86b";
          title.zIndex = 25;
          app.stage.addChild(title);
        }
      }

      const control = (
        kind: string,
        text: string,
        x: number,
        y: number,
        width: number,
        height: number,
        disabled = false,
        active = false,
        hexagon = false,
      ) => {
        const id = `panel:${panel.seat}:${kind}`;
        const highlighted = state.highlightedPanelControl === id && !disabled;
        const shape = new Graphics();
        if (hexagon)
          shape.poly(
            [
              x + width / 2,
              y,
              x + width,
              y + height / 4,
              x + width,
              y + height * 0.75,
              x + width / 2,
              y + height,
              x,
              y + height * 0.75,
              x,
              y + height / 4,
            ],
            true,
          );
        else shape.roundRect(x, y, width, height, 4);
        shape
          .fill(active ? "#528259" : highlighted ? "#294a5b" : "#142b36")
          .stroke({
            color: highlighted ? "#eef5ff" : active ? "#b7ed78" : "#527080",
            width: highlighted ? 2 : 1,
          });
        const caption = label(
          text,
          x + width / 2,
          y + height / 2,
          kind === "resources" ? Math.max(15, 12 / displayScale) : hexagon ? 16 : 11,
        );
        caption.anchor.set(0.5);
        caption.style.wordWrap = false;
        caption.style.fill = active ? "#e5ffb2" : "#bdefff";
        shape.alpha = caption.alpha = disabled ? 0.55 : 1;
        if (kind === "resources" && !highlighted) shape.alpha = 0;
        if (kind === "recycle" || kind === "purge") shape.alpha = 0;
        shape.zIndex = 25;
        caption.zIndex = 26;
        app.stage.addChild(shape, caption);
        renderedPanelControls.push({
          id,
          x,
          y,
          width,
          height,
          disabled,
          active,
        });
      };
      for (const [position, tier] of panel.tiers.entries()) {
        control(
          `synergy:${tier.index}`,
          String(tier.index + 1),
          panelX + 226,
          panelY + 12 + position * 58,
          44,
          48,
          false,
          tier.active,
          true,
        );
      }
      for (const [index, kind] of (["recycle", "purge"] as const).entries()) {
        const count =
          kind === "recycle" ? panel.recycleCount : panel.purgeCount;
        const mobile = state.fitViewport && window.innerWidth <= 1280 && window.innerHeight <= 600 && window.innerWidth > window.innerHeight;
        const spacing = pileSpacing(panelX, displayScale, !!mobile);
        const x = spacing.start + index * spacing.step;
        const y = mobile ? panelY + 22 : geometry.y + (panel.seat === seat ? 60 : 8);
        control(kind, "", x, y, spacing.width, mobile ? 72 : 130, count === 0);
        const highlighted = state.highlightedPanelControl === `panel:${panel.seat}:${kind}`;
        const icon = new Graphics();
        const cx = x + spacing.width / 2, cy = y + (mobile ? 36 : 80);
        const radius = Math.max(24, 10 / displayScale);
        const stroke = { color: highlighted ? "#dffaff" : "#79abb7", width: Math.max(2, 1.5 / displayScale), alpha: count ? 1 : 0.65 };
        // Cut corners and a shared cyan accent echo the Obsidian dock bevels.
        // Keep the silhouettes open and recognizable at phone scale.
        const path = (points: number[]) => points.map((value, index) =>
          (index % 2 === 0 ? cx : cy) + value * radius);
        if (kind === "recycle") {
          icon.poly(path([-0.65, -0.55, 0.65, -0.55, 0.65, 0.62, 0.43, 0.85, -0.43, 0.85, -0.65, 0.62])).stroke(stroke);
          icon.moveTo(cx - radius * 0.85, cy - radius * 0.8).lineTo(cx + radius * 0.85, cy - radius * 0.8)
            .moveTo(cx - radius * 0.35, cy - radius * 0.8).lineTo(cx - radius * 0.2, cy - radius).lineTo(cx + radius * 0.2, cy - radius).lineTo(cx + radius * 0.35, cy - radius * 0.8)
            .moveTo(cx - radius * 0.23, cy - radius * 0.3).lineTo(cx - radius * 0.23, cy + radius * 0.6)
            .moveTo(cx + radius * 0.23, cy - radius * 0.3).lineTo(cx + radius * 0.23, cy + radius * 0.6).stroke(stroke);
        } else {
          icon.poly(path([-0.55, -0.85, 0.55, -0.85, 0.9, -0.5, 0.9, 0.5, 0.55, 0.85, -0.55, 0.85, -0.9, 0.5, -0.9, -0.5])).stroke(stroke);
          icon.moveTo(cx - radius * 0.4, cy - radius * 0.4).lineTo(cx + radius * 0.4, cy + radius * 0.4)
            .moveTo(cx + radius * 0.4, cy - radius * 0.4).lineTo(cx - radius * 0.4, cy + radius * 0.4).stroke(stroke);
        }
        icon.moveTo(cx - radius * 0.25, cy + radius * 0.85)
          .lineTo(cx + radius * 0.25, cy + radius * 0.85)
          .stroke({ ...stroke, color: highlighted ? "#dffaff" : "#65d9ed" });
        icon.eventMode = "none";
        icon.zIndex = 25;
        app.stage.addChild(icon);
      }

      const mainframeBounds = {
        x: panelX + 70,
        y: panelY,
        width: 140,
        height: 116,
      };
      registerBounds([mainframe.instanceId], mainframeBounds);
      const mainframeTile = new Container();
      mainframeTile.position.set(mainframeBounds.x, mainframeBounds.y);
      mainframeTile.zIndex = 22;
      mainframeTile.eventMode = "static";
      mainframeTile.cursor = "pointer";
      mainframeTile.hitArea = new Rectangle(0, 0, 140, 116);
      mainframeTile.on("pointertap", () => inspect(mainframe.instanceId));
      const mainframeCandidate = candidates.includes(mainframe.instanceId);
      const mainframeSelected = chosen.includes(mainframe.instanceId);
      mainframeTile.addChild(
        new Graphics()
          .roundRect(0, 0, 140, 116, 5)
          .fill("#101820")
          .stroke({
            color: mainframeSelected
              ? "#c4ff6e"
              : mainframeCandidate
                ? "#55d9fa"
                : "#527080",
            width: mainframeSelected || mainframeCandidate ? 3 : 1,
          }),
      );
      const mainframeDetails = presentationFor(mainframe, presentations);
      const fallback = label(mainframeDetails.name, 6, 8, 11);
      fallback.style.wordWrapWidth = 128;
      mainframeTile.addChild(fallback);
      addArtwork(
        mainframeTile,
        mainframeDetails.artworkUrl,
        140 * (140 / 112),
        198 * (140 / 112),
        fallback,
        { x: -14 * (140 / 112), y: -22 * (140 / 112) },
      );
      // Zoom into the illustration, excluding the printed title and outer frame.
      // Keep the portrait bounds and original image proportions unchanged.
      // The full texture remains available to the separate inspection surface.
      const portraitMask = new Graphics()
        .roundRect(0, 0, 140, 116, 5)
        .fill(0xffffff);
      mainframeTile.addChild(portraitMask);
      mainframeTile.mask = portraitMask;
      app.stage.addChild(mainframeTile);
      for (const [index, value, color] of [
        [0, panel.mainframeHealth, "#a9d8ff"],
        [1, panel.bioframeHealth, "#ffb4b4"],
      ] as const) {
        const cx = mainframeBounds.x + 42 + index * 56;
        const cy = mainframeBounds.y + 126;
        const badge = new Graphics().circle(cx, cy, 23).fill("#0b1729");
        badge.zIndex = 25;
        const mobileHealth = state.fitViewport && window.innerWidth <= 1280 && window.innerHeight <= 600 && window.innerWidth > window.innerHeight;
        const number = label(String(value), cx, cy, mobileHealth ? 34 : 28);
        number.anchor.set(0.5);
        number.style.fill = color;
        number.style.fontWeight = "bold";
        number.zIndex = 26;
        app.stage.addChild(badge, number);
      }

      const protocols = zones
        .flatMap((zone) => zone.cards)
        .filter((card) =>
          card.attachments.some(
            (attachment) =>
              attachment.kind === "protocol" &&
              attachment.hostId === mainframe.instanceId,
          ),
        );
      // Targeting a Mainframe must not manufacture another empty port.
      const portCount = Math.max(3, protocols.length);
      for (let index = 0; index < portCount; index++) {
        const protocol = protocols[index];
        const portId = gearPortChoiceId(
          mainframe.instanceId,
          `program:${index}`,
        );
        const portBounds = {
          x: panelX + (index === 0 ? -20 : index % 2 === 1 ? -48 : 8),
          y: panelY + 8 + (index === 0 ? 0 : Math.ceil(index / 2) * 56),
          width: 44,
          height: 44,
        };
        registerBounds(
          protocol ? [portId, protocol.instanceId] : [portId],
          portBounds,
        );
        const eligible = protocol
          ? candidates.includes(protocol.instanceId)
          : candidates.includes(mainframe.instanceId);
        const picked = chosen.includes(portId) || (!!protocol && chosen.includes(protocol.instanceId));
        const targeted = assignments.some(
          (assignment) =>
            assignment.to === portId ||
            (!!protocol && assignment.to === protocol.instanceId),
        );
        const port = new Container();
        port.position.set(portBounds.x, portBounds.y);
        port.zIndex = 24;
        port.eventMode = protocol || eligible ? "static" : "none";
        port.cursor = protocol || eligible ? "pointer" : "default";
        port.hitArea = new Rectangle(0, 0, portBounds.width, portBounds.height);
        port.on("pointertap", () => inspect(protocol?.instanceId ?? portId));
        port.addChild(
          new Graphics()
            .roundRect(0, 0, portBounds.width, portBounds.height, 4)
            .fill(protocol ? "#254f57" : eligible ? "#234c55" : "#13212d")
            .stroke({
              color: targeted
                ? "#55d9fa"
                : picked
                  ? "#c4ff65"
                  : protocol
                    ? "#77efd5"
                    : "#3b5662",
              width: targeted || picked ? 3 : 1,
            }),
        );
        const portLabel = label(`P${index + 1}`, 4, 4, 9);
        portLabel.style.fontWeight = "bold";
        port.addChild(portLabel);
        if (protocol) {
          const details = presentationFor(protocol, presentations);
          addArtwork(
            port,
            details.artworkUrl,
            portBounds.width,
            portBounds.height,
            portLabel,
          );
        }
        app.stage.addChild(port);
      }
      registerBounds([`player:${panel.seat}`], {
        x: panelX + 89,
        y: panelY + 103,
        width: 102,
        height: 46,
      });
    }

    app.canvas.dataset.panelControls = JSON.stringify(renderedPanelControls);
    app.canvas.dataset.highlightedPanelControl =
      state.highlightedPanelControl ?? "";
    if (!state.cacheHidden && cacheEntries.length) {
      for (const entry of cacheEntries) {
        const measured = viewportPoint(entry.endpointId);
        if (!measured) continue;
        const start = viewportPoint(`${entry.endpointId}:start`);
        const end = viewportPoint(`${entry.endpointId}:end`);
        const bounds = {
          x: start?.x ?? measured.x - 64 / displayScale,
          y: start?.y ?? measured.y - 90.5 / displayScale,
          width: start && end ? end.x - start.x : 128 / displayScale,
          height: start && end ? end.y - start.y : 181 / displayScale,
        };
        registerBounds([entry.endpointId], bounds);
      }
    }

    for (const row of layout.areas) {
      if (row.zone.id === "cache") {
        // Cache cards live in the off-center browser, never in either arena.
        // Retain neutral endpoints for non-action references while the browser is open.
        const anchor = {
          x: row.x + row.width / 2,
          y: row.y - 22 / displayScale,
        };
        for (const placed of row.cards) {
          positions.set(placed.card.instanceId, anchor);
          for (const id of placed.reservedRam?.memberIds ?? [])
            positions.set(id, anchor);
        }
        continue;
      }
      if (!row.frameless) {
        const background = app.stage.addChild(
          new Graphics()
            .roundRect(row.x, row.y, row.width, row.height, 8)
            .fill(row.zone.id.endsWith(":arena") ? "#122c30" : "#111f2c")
            .stroke({ color: "#28434c", width: 1 }),
        );
        background.zIndex = row.overlay ? 20 : 0;
        if (row.overlay) background.eventMode = "static";
      }
      const mainframe = row.zone.id.endsWith(":mainframe");
      const zoneName =
        mainframe && row.cards.length > row.zone.cards.length
          ? "Mainframe & programs"
          : row.zone.id.endsWith(":arena") || row.zone.id.endsWith(":hand")
            ? row.zone.label
            : row.zone.label.replace(/^(Your |Opponent’s )/, "");
      // Hidden piles already display their total on the card back; mainframes need no count.
      if (!row.frameless) {
        const heading = label(
          mainframe ||
            (row.zone.hiddenCount !== undefined && !row.zone.cards.length)
            ? zoneName
            : `${zoneName} · ${row.zone.hiddenCount ?? row.zone.cards.length}`,
          row.x + 10,
          row.y + 8,
        );
        heading.style.wordWrapWidth = row.width - 20;
        heading.style.fontSize = 11;
        heading.zIndex = row.overlay ? 21 : 0;
        app.stage.addChild(heading);
      }
      if (
        !row.frameless &&
        row.zone.hiddenCount !== undefined &&
        !row.cards.length
      ) {
        const back = new Graphics()
          .roundRect(row.x + 12, row.y + 32, CARD_WIDTH, CARD_HEIGHT - 12, 5)
          .fill("#213b46")
          .stroke({ color: "#5c8a8e", width: 1 });
        app.stage.addChild(back);
        app.stage.addChild(
          label(`${row.zone.hiddenCount}\nCARDS`, row.x + 22, row.y + 70, 16),
        );
      } else if (!row.frameless && !row.cards.length) {
        app.stage.addChild(
          label(
            "—",
            row.x + row.width / 2,
            row.y + Math.min(80, row.height - 24),
            row.height < 60 ? 14 : 22,
          ),
        );
      }
      for (const slot of row.slots) {
        const choiceId = gearPortChoiceId(slot.hostId, slot.port);
        registerBounds([choiceId], {
          x: slot.x,
          y: slot.y,
          width: slot.size,
          height: slot.size,
        });
        const programSlot = slot.port.startsWith("program:");
        const occupied =
          programSlot &&
          row.cards.some(
            (card) =>
              card.iconLabel === "PROGRAM" &&
              card.x === slot.x &&
              card.y === slot.y,
          );
        const eligible =
          candidates.includes(choiceId) ||
          (programSlot && !occupied && candidates.includes(slot.hostId));
        const picked = chosen.includes(choiceId);
        const spot = new Graphics()
          .roundRect(slot.x, slot.y, slot.size, slot.size, 5)
          .fill(picked ? "#39552c" : eligible ? "#234c55" : "#13212d")
          .stroke({
            color: picked ? "#c4ff65" : eligible ? "#55d9fa" : "#39515d",
            width: picked || eligible ? 3 : 1,
          });
        if (eligible) {
          spot.eventMode = "static";
          spot.cursor = "pointer";
          spot.on("pointertap", () => inspect(choiceId));
        }
        app.stage.addChild(spot);
        app.stage.addChild(label(slot.label, slot.x + 3, slot.y + 13, 8));
      }
      for (const placed of row.cards) {
        const { card, x, y } = placed;
        const representedIds = placed.ramStack
          ? placed.ramStack.expanded
            ? [card.instanceId]
            : placed.ramStack.memberIds
          : [card.instanceId];
        const candidate = representedIds.some((id) => candidates.includes(id));
        const picked = representedIds.some((id) => chosen.includes(id));
        const reservedEligible = placed.reservedRam?.memberIds.some((id) => candidates.includes(id)) ?? false;
        const reservedPicked = placed.reservedRam?.memberIds.some((id) => chosen.includes(id)) ?? false;
        const reservedColor = reservedPicked ? "#c4ff65" : reservedEligible ? "#55d9fa" : placed.compact ? "#77efd5" : "#ffffff";
        const reservedFill = reservedPicked ? "#39552c" : reservedEligible ? "#234c55" : "#174755";
        if (placed.reservedRam) reservedRamHighlights[card.instanceId] = {
          eligible: reservedEligible, selected: reservedPicked, color: reservedColor, x, y,
        };
        const selectedStack = representedIds.some((id) => id === selected);
        const faceWidth = placed.tapped ? placed.height : placed.width;
        const faceHeight = placed.tapped ? placed.width : placed.height;
        registerBounds(
          [...representedIds, ...(placed.reservedRam?.memberIds ?? [])],
          {
            x,
            y,
            width: placed.width,
            height: placed.height,
          },
        );
        const details = presentationFor(card, presentations);
        const occurrence = cardOccurrences.get(card.instanceId) ?? 0;
        cardOccurrences.set(card.instanceId, occurrence + 1);
        const tileKey = JSON.stringify([card.instanceId, occurrence]);
        const tile = cardTiles.get(tileKey) ?? new Container();
        cardTiles.set(tileKey, tile);
        usedCardTiles.add(tileKey);
        const activeSource = card.instanceId === activeCardId;
        const visualSignature = JSON.stringify([
          placed, details, candidate, picked, selectedStack, activeSource, reservedEligible, reservedPicked,
          forceQuit, state.actionCues?.[card.instanceId], state.combatRoles?.[card.instanceId],
        ]);
        const previousVisual = tileVisuals.get(tileKey);
        const reuseVisual = previousVisual?.signature === visualSignature;
        recordSimulatorMetric(reuseVisual ? "cardVisualReuse" : "cardVisualBuild");
        if (!reuseVisual) {
          for (const child of tile.removeChildren()) child.destroy({ children: true });
        }
        const isTileCurrent = () =>
          !disposed && cardTiles.get(tileKey) === tile &&
          tileVisuals.get(tileKey)?.signature === visualSignature;
        tile.zIndex = row.overlay
          ? 22
          : placed.hand && hoveredCard?.id === card.instanceId
            ? 10
            : activeSource
              ? 1
              : 0;
        tile.position.set(placed.tapped ? x + placed.width : x, y);
        if (placed.tapped) tile.rotation = Math.PI / 2;
        tile.eventMode = "static";
        tile.cursor = "pointer";
        tile.hitArea = new Rectangle(0, 0, faceWidth, faceHeight);
        const liftHand = (lifted: boolean) => {
          if (!placed.hand) return;
          const lift = lifted ? (state.fitViewport ? 56 : 28) : 0;
          tile.y = y - lift;
          tile.zIndex = handExpanded ? (lifted ? 41 : 40) : lifted ? 10 : 0;
          // Keep each exposed strip's original hit area stable while lifting art.
          tile.hitArea = new Rectangle(
            0,
            lift,
            placed.handHitWidth ?? faceWidth,
            faceHeight,
          );
          handStates[card.instanceId] = {
            x: tile.x,
            y: tile.y,
            lift,
            hitWidth: placed.handHitWidth ?? faceWidth,
            width: faceWidth,
            height: faceHeight,
          };
          app.canvas.dataset.handCards = JSON.stringify(handStates);
          publishHandAnchor?.(card.instanceId, handStates[card.instanceId]);
        };
        liftHand(
          selectedStack ||
            state.previewedCardId === card.instanceId ||
            hoveredCard?.id === card.instanceId,
        );
        tile.on("pointertap", (event) => {
          if (placed.hand && event.pointerType !== "mouse" && !touchHandExpanded && window.innerWidth <= 1280 && window.innerHeight <= 600) {
            touchHandExpanded = true;
            redraw?.();
            return;
          }
          if (
            placed.ramStack &&
            placed.ramStack.count > 1 &&
            !placed.ramStack.expanded
          )
            toggleRamStack?.(placed.ramStack.key);
          else inspect(card.instanceId);
        });
        tile.on("pointerover", (event) => {
          if (placed.tetherBadge) {
            for (const id of [
              card.instanceId,
              ...card.attachments
                .filter((link) => link.kind === "gear")
                .map((link) => link.hostId),
            ])
              for (const frame of hoverFrames.get(id) ?? [])
                frame.visible = true;
            app.render();
          }
          if (placed.hand) {
            liftHand(true);
            app.render();
          }
          if (!hover)
            app.canvas.title = descriptions[card.instanceId] ?? details.name;
          hoveredCard = {
            id: card.instanceId,
            x: event.clientX,
            y: event.clientY,
          };
          hover?.(hoveredCard);
        });
        tile.on("pointerout", () => {
          if (placed.tetherBadge) {
            for (const frames of hoverFrames.values())
              for (const frame of frames) frame.visible = false;
            app.render();
          }
          if (placed.hand) {
            liftHand(
              selectedStack || state.previewedCardId === card.instanceId,
            );
            app.render();
          }
          app.canvas.title = "";
          hoveredCard = null;
          hover?.(null);
        });
        if (reuseVisual && previousVisual) {
          hoverFrames.set(card.instanceId, [
            ...(hoverFrames.get(card.instanceId) ?? []), previousVisual.hoverFrame,
          ]);
          const combatRole = state.combatRoles?.[card.instanceId];
          if (combatRole) renderedCombatRoles[card.instanceId] = combatRole;
          app.stage.addChild(tile);
          continue;
        }
        if (
          placed.ramStack &&
          !placed.ramStack.expanded &&
          placed.ramStack.count > 1 &&
          !placed.compact
        )
          for (const offset of [6, 3])
            tile.addChild(
              new Graphics()
                .roundRect(offset, -offset, faceWidth, faceHeight, 5)
                .fill("#17283a")
                .stroke({ color: "#62758e", width: 1 }),
            );
        tile.addChild(
          new Graphics()
            .roundRect(0, 0, faceWidth, faceHeight, 5)
            .fill(placed.compact ? "#233953" : "#101820")
            .stroke({
              color: picked
                ? "#c4ff6e"
                : candidate
                  ? "#55d9fa"
                  : selectedStack
                    ? "#77efd5"
                    : "#62758e",
              width:
                selectedStack || candidate || picked
                  ? 3
                  : placed.compact
                    ? 1
                    : 0,
            }),
        );
        const artworkIndex = tile.children.length;
        const actionCue = state.actionCues?.[card.instanceId];
        const cue = picked
          ? { color: "#c4ff6e", width: 3 }
          : candidate
            ? { color: "#55d9fa", width: 3 }
            : actionCue === "playable"
              ? { color: "#77efd5", width: 3 }
              : actionCue === "choices"
                ? { color: "#86a0a6", width: 2 }
                : null;
        if (cue && !placed.compact) {
          tile.addChild(
            new Graphics()
              .roundRect(-3, -3, faceWidth + 6, faceHeight + 6, 7)
              .stroke({
                color: cue.color,
                width: cue.width,
              }),
          );
        }
        // Preserve the action source independently of the last inspected card and payment picks.
        if (activeSource) {
          tile.addChild(
            new Graphics()
              .roundRect(-3, -3, faceWidth + 6, faceHeight + 6, 7)
              .stroke({ color: "#ffd479", width: 3 }),
          );
        }
        const hoverFrame = new Graphics()
          .roundRect(-2, -2, faceWidth + 4, faceHeight + 4, 6)
          .stroke({ color: "#cbb1ff", width: 3 });
        hoverFrame.visible = false;
        tile.addChild(hoverFrame);
        tileVisuals.set(tileKey, { signature: visualSignature, hoverFrame });
        hoverFrames.set(card.instanceId, [
          ...(hoverFrames.get(card.instanceId) ?? []),
          hoverFrame,
        ]);
        if (placed.compact) {
          if (placed.iconLabel?.startsWith("R")) {
            const stack = placed.ramStack;
            const selectedCount =
              stack?.memberIds.filter((id) => chosen.includes(id)).length ?? 0;
            const fallbackTitle = label("RAM", 5, 7, 9);
            fallbackTitle.style.fontWeight = "bold";
            tile.addChild(fallbackTitle);
            if (details.artworkUrl)
              void Assets.load<Texture>(details.artworkUrl)
                .then((texture) => {
                  if (!isTileCurrent()) return;
                  const sprite = new Sprite(texture);
                  sprite.width = faceWidth;
                  sprite.height = faceHeight;
                  sprite.position.set(0, 0);
                  tile.addChildAt(sprite, artworkIndex);
                  fallbackTitle.visible = false;
                  requestPaint();
                })
                .catch(() => {
                  /* The RAM label remains as an accessible fallback. */
                });
            if (stack) {
              const hud = new Container();
              hud.eventMode = "none";
              if (placed.tapped) {
                hud.rotation = -Math.PI / 2;
                hud.position.set(0, faceHeight);
              }
              const miniBadge = (
                value: string,
                bx: number,
                by: number,
                color: string,
              ) => {
                const badgeWidth = Math.max(22, value.length * 8 + 8);
                hud.addChild(
                  new Graphics()
                    .roundRect(bx - badgeWidth, by, badgeWidth, 18, 4)
                    .fill({ color, alpha: 0.96 })
                    .stroke({ color: "#ffffff", alpha: 0.45, width: 1 }),
                );
                const text = label(value, bx - badgeWidth + 4, by + 2, 11);
                text.style.fontWeight = "bold";
                hud.addChild(text);
              };
              if (!stack.expanded && stack.count > 1)
                miniBadge(`×${stack.count}`, placed.width - 2, 2, "#31506d");
              if (!stack.expanded && selectedCount)
                miniBadge(`✓${selectedCount}`, placed.width - 2, 22, "#486b25");
              tile.addChild(hud);
              if (stack.expanded && stack.index === 0 && stack.count > 1) {
                const collapse = new Container();
                collapse.position.set(faceWidth - 16, 1);
                collapse.eventMode = "static";
                collapse.cursor = "pointer";
                collapse.hitArea = new Rectangle(0, 0, 15, 15);
                collapse.on("pointertap", (event) => {
                  event.stopPropagation();
                  toggleRamStack?.(stack.key);
                });
                collapse.addChild(
                  new Graphics()
                    .roundRect(0, 0, 15, 15, 3)
                    .fill("#10242c")
                    .stroke({ color: "#77efd5", width: 1 }),
                );
                collapse.addChild(label("−", 3, -2, 13));
                tile.addChild(collapse);
              }
            }
          } else {
            const gearTitle = label(
              placed.iconLabel === "PROGRAM" ? "PRG" : "GEAR",
              3,
              13,
              9,
            );
            tile.addChild(gearTitle);
            if (details.artworkUrl)
              void Assets.load<Texture>(details.artworkUrl)
                .then((texture) => {
                  if (!isTileCurrent()) return;
                  const sprite = new Sprite(texture);
                  sprite.width = faceWidth;
                  sprite.height = faceHeight;
                  sprite.position.set(0, 0);
                  tile.addChildAt(sprite, tile.children.indexOf(gearTitle));
                  gearTitle.visible = false;
                  requestPaint();
                })
                .catch(() => {});
            if (placed.tetherBadge) {
              tile.addChild(
                new Graphics()
                  .roundRect(0, faceHeight - 13, 23, 13, 3)
                  .fill("#49396c"),
              );
              tile.addChild(label(placed.tetherBadge, 3, faceHeight - 12, 10));
            }
          }
          if (placed.reservedRam) {
            const reserved = placed.reservedRam;
            const ramBadge = new Container();
            ramBadge.eventMode = "static";
            ramBadge.cursor = "pointer";
            ramBadge.hitArea = new Rectangle(0, 0, faceWidth, 16);
            ramBadge.on("pointertap", (event) => {
              event.stopPropagation();
              for (const key of reserved.stackKeys) toggleRamStack?.(key);
            });
            ramBadge.addChild(
              new Graphics()
                .roundRect(0, 0, faceWidth, 16, 3)
                .fill({ color: reservedFill, alpha: 0.97 })
                .stroke({ color: reservedColor, width: reservedEligible || reservedPicked ? 3 : 1 }),
            );
            const ramLabel = label(`${reserved.count} RAM`, 3, 1, 9);
            ramLabel.style.fontWeight = "bold";
            ramBadge.addChild(ramLabel);
            tile.addChild(ramBadge);
          }
          app.stage.addChild(tile);
          continue;
        }
        const title = label(details.name, 5, 7, 12);
        title.style.wordWrapWidth = faceWidth - 10;
        if (details.customTokenArtwork) {
          const tokenScale = placed.formationScale ?? 1;
          title.style.fontSize = 12 * tokenScale;
          title.position.set(5 * tokenScale, 7 * tokenScale);
          title.style.wordWrapWidth = faceWidth - 10 * tokenScale;
          tile.addChild(new Graphics().roundRect(1, 1, faceWidth - 2, faceHeight - 2, 5)
            .stroke({ color: "#79abb7", width: 1.5 }));
          tile.addChild(new Graphics().rect(2, 2, faceWidth - 4, 24 * tokenScale)
            .fill({ color: "#071016", alpha: 0.9 }));
          title.style.fontWeight = "bold";
          const tokenLabel = label("TOKEN", 5 * tokenScale, faceHeight - 35 * tokenScale, 9 * tokenScale);
          tile.addChild(new Graphics().rect(2, faceHeight - 39 * tokenScale, faceWidth - 4, 18 * tokenScale)
            .fill({ color: "#071016", alpha: 0.85 }), tokenLabel);
        }
        tile.addChild(title);
        if (details.artworkUrl) {
          void Assets.load<Texture>(details.artworkUrl)
            .then((texture) => {
              if (!isTileCurrent()) return;
              const sprite = new Sprite(texture);
              sprite.width = faceWidth;
              sprite.height = faceHeight;
              sprite.position.set(0, 0);
              tile.addChildAt(sprite, artworkIndex);
              title.visible = !!details.customTokenArtwork;
              requestPaint();
            })
            .catch(() => {
              /* The readable card title remains available. */
            });
        }
        // Status overlays stay upright when the artwork is tapped. Totals come from the engine.
        const hud = new Container();
        hud.eventMode = "none";
        if (placed.tapped) {
          hud.rotation = -Math.PI / 2;
          hud.position.set(0, faceHeight);
        }
        const badgeScale = placed.formationScale ?? 1;
        const badge = (
          text: string,
          bx: number,
          by: number,
          bw: number,
          color: string,
          fontSize = 12,
          border?: { color: string; alpha: number; width: number },
        ) => {
          hud.addChild(
            new Graphics()
              .roundRect(bx, by, bw, 20 * badgeScale, 4 * badgeScale)
              .fill({ color, alpha: 0.95 })
              .stroke(border ?? { color: "#ffffff", alpha: 0.35, width: 1 }),
          );
          const value = label(
            text,
            bx + 4 * badgeScale,
            by + 3 * badgeScale,
            fontSize * badgeScale,
          );
          value.style.fontWeight = "bold";
          value.style.wordWrap = false;
          if (value.width > bw - 8) value.scale.set((bw - 8) / value.width);
          hud.addChild(value);
        };
        if (placed.ramStack && !placed.ramStack.expanded) {
          const padding = 2 / displayScale;
          const value = label(`×${placed.ramStack.count}`, 0, 0, Math.max(14, 11 / displayScale));
          value.style.wordWrap = false;
          value.style.fontWeight = "bold";
          const width = value.width + padding * 2;
          const height = value.height + padding;
          const x = placed.width - width - 1;
          hud.addChild(new Graphics().roundRect(x, 1, width, height, 3).fill("#31506d"));
          value.position.set(x + padding, 1 + padding / 2);
          hud.addChild(value);
        }
        const selectedRamCount =
          placed.ramStack?.memberIds.filter((id) => chosen.includes(id))
            .length ?? 0;
        if (placed.ramStack && !placed.ramStack.expanded && selectedRamCount)
          badge(
            `${selectedRamCount} selected`,
            2,
            24,
            Math.min(placed.width - 4, 76),
            "#486b25",
            10,
          );
        if (placed.reservedRam)
          badge(
            `${placed.reservedRam.count} RAM`,
            2,
            2,
            Math.min(58, placed.width - 4),
            reservedFill,
            11,
            { color: reservedColor, alpha: reservedEligible || reservedPicked ? 1 : 0.35, width: reservedEligible || reservedPicked ? 3 : 1 },
          );
        if (details.attack !== undefined) {
          const half = (placed.width - 6) / 2;
          badge(
            `${details.attack} ${details.attackType ?? "ATK"}`,
            2,
            placed.height - 22 * badgeScale,
            half,
            details.attackType === "MF"
              ? "#245f9e"
              : details.attackType === "BF"
                ? "#9e303e"
                : "#263d48",
          );
          badge(
            `${details.defence ?? "?"} DEF`,
            half + 4,
            placed.height - 22 * badgeScale,
            half,
            "#263d48",
          );
        }
        const combatRole = state.combatRoles?.[card.instanceId];
        if (combatRole) renderedCombatRoles[card.instanceId] = combatRole;
        if (combatRole)
          badge(
            combatRole,
            2,
            (placed.reservedRam ? 24 : 2) * badgeScale,
            placed.width - 4,
            "#486b25",
            10,
          );
        const statuses = boardCardStateSummary(card, details);
        statuses.forEach((status, index) =>
          badge(
            status.text,
            2,
            placed.height -
              (details.attack !== undefined ? 24 : 2) * badgeScale -
              (statuses.length - index) * 22 * badgeScale,
            placed.width - 4,
            status.color,
            10,
          ),
        );
        tile.addChild(hud);
        if (forceQuit && candidate) {
          const forceQuitControl = new Container();
          forceQuitControl.position.set(faceWidth - 27, 3);
          forceQuitControl.eventMode = "static";
          forceQuitControl.cursor = "pointer";
          forceQuitControl.hitArea = new Rectangle(-3, -3, 30, 30);
          forceQuitControl.on("pointertap", (event) => {
            event.stopPropagation();
            if (
              placed.ramStack &&
              placed.ramStack.count > 1 &&
              !placed.ramStack.expanded
            )
              toggleRamStack?.(placed.ramStack.key);
            else inspect(card.instanceId);
          });
          forceQuitControl.addChild(
            new Graphics()
              .circle(12, 12, 12)
              .fill(picked ? "#55791f" : "#8d2630")
              .stroke({ color: picked ? "#d8ff8a" : "#ffb2b8", width: 2 }),
          );
          const cross = label("×", 6, -1, 22);
          cross.style.fontWeight = "bold";
          forceQuitControl.addChild(cross);
          tile.addChild(forceQuitControl);
        }
        if (placed.reservedRam) {
          const reserved = placed.reservedRam;
          const hit = new Container();
          hit.eventMode = "static";
          hit.cursor = "pointer";
          hit.hitArea = new Rectangle(0, 0, Math.min(58, faceWidth - 4), 20);
          hit.position.set(2, 2);
          if (placed.tapped) {
            hit.rotation = -Math.PI / 2;
            hit.position.set(2, faceHeight - 2);
          }
          hit.on("pointertap", (event) => {
            event.stopPropagation();
            for (const key of reserved.stackKeys) toggleRamStack?.(key);
          });
          tile.addChild(hit);
        }
        app.stage.addChild(tile);
      }
    }
    for (const [id, tile] of cardTiles) {
      if (usedCardTiles.has(id)) continue;
      tile.destroy({ children: true });
      cardTiles.delete(id);
      tileVisuals.delete(id);
    }
    if (hoveredCard && !cardOccurrences.has(hoveredCard.id)) {
      hover?.(null);
      hoveredCard = null;
    }
    const links = new Graphics();
    for (const row of layout.areas)
      for (const { card } of row.cards) {
        const from = positions.get(card.instanceId)!;
        for (const link of card.attachments) {
          if (
            displayedGear.has(card.instanceId) ||
            link.kind === "ram" ||
            (link.kind === "gear" && card.attachments.length === 1)
          )
            continue;
          const to = positions.get(link.hostId);
          if (to)
            links
              .moveTo(from.x + CARD_WIDTH / 2, from.y + CARD_HEIGHT)
              .lineTo(from.x + CARD_WIDTH / 2, from.y + CARD_HEIGHT + 5)
              .lineTo(to.x + CARD_WIDTH / 2, to.y + CARD_HEIGHT + 5)
              .lineTo(to.x + CARD_WIDTH / 2, to.y + CARD_HEIGHT)
              .stroke({
                color: "#c2ec7a",
                width: 2,
                alpha: 0.8,
              });
        }
      }
    app.stage.addChild(links);
    const assignmentLines = new Graphics();
    assignmentLines.eventMode = "none";
    assignmentLines.zIndex = 50;
    const endpoint = (id: string) => {
      const cacheEndpoint =
        id.startsWith("cache-action:") || id.startsWith("cache-card:");
      // Never substitute the action's battlefield source while the centered
      // Cache is mounting. Wait for the actual Cache tile so a reopened link
      // appears once at its final coordinates instead of visibly snapping.
      if (cacheEndpoint)
        return state.cacheHidden ? undefined : endpointBounds.get(id);
      const direct = endpointBounds.get(id);
      if (direct) return direct;
      const bounds = endpointBounds.get(id);
      if (bounds) return bounds;
      const exact = positions.get(id);
      return exact
        ? { x: exact.x, y: exact.y, width: 1, height: 1 }
        : undefined;
    };
    const center = (bounds: EndpointBounds) => ({
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    });
    const edge = (bounds: EndpointBounds, toward: { x: number; y: number }) => {
      const origin = center(bounds);
      const dx = toward.x - origin.x;
      const dy = toward.y - origin.y;
      if (!dx && !dy) return origin;
      const scale = Math.min(
        dx ? bounds.width / 2 / Math.abs(dx) : Number.POSITIVE_INFINITY,
        dy ? bounds.height / 2 / Math.abs(dy) : Number.POSITIVE_INFINITY,
      );
      return { x: origin.x + dx * scale, y: origin.y + dy * scale };
    };
    const renderedAssignments: {
      from: string;
      to: string;
      fromPoint: { x: number; y: number };
      toPoint: { x: number; y: number };
      fromBounds: EndpointBounds;
      toBounds: EndpointBounds;
    }[] = [];
    const viewportIntents: ViewportIntent[] = [];
    const canvasRect = app.canvas.getBoundingClientRect();
    const viewportScale = canvasRect.width / app.screen.width;
    for (const assignment of assignments) {
      const fromBounds = endpoint(assignment.from);
      const toBounds = endpoint(assignment.to);
      if (!fromBounds || !toBounds) continue;
      const fromCenter = center(fromBounds);
      const toCenter = center(toBounds);
      // A resting hand card's right edge is covered by its neighbor. Start in
      // its exposed top strip instead, and follow the same strip when lifted.
      const handSource = handStates[assignment.from];
      const from = handSource
        ? { x: handSource.x + handSource.hitWidth / 2, y: handSource.y + 6 }
        : edge(fromBounds, toCenter);
      const to = edge(toBounds, handSource ? from : fromCenter);
      renderedAssignments.push({
        from: assignment.from,
        to: assignment.to,
        fromPoint: from,
        toPoint: to,
        fromBounds,
        toBounds,
      });
      const target = assignment.kind === "target";
      viewportIntents.push({
        from: {
          x: canvasRect.left + from.x * viewportScale,
          y: canvasRect.top + from.y * viewportScale,
        },
        to: {
          x: canvasRect.left + to.x * viewportScale,
          y: canvasRect.top + to.y * viewportScale,
        },
        target,
        draft: assignment.draft,
        scale: viewportScale,
      });
      drawIntent(assignmentLines, from, to, target, assignment.draft);
    }
    app.canvas.dataset.combatRoles = JSON.stringify(renderedCombatRoles);
    app.canvas.dataset.reservedRamHighlights = JSON.stringify(reservedRamHighlights);
    app.canvas.dataset.renderedAssignments =
      JSON.stringify(renderedAssignments);
    app.stage.addChild(assignmentLines);
    state.onIntentLayout?.(viewportIntents);
    if (state.onAnchorLayout) {
      const publishAnchors = () => {
        const canvasRect = app.canvas.getBoundingClientRect();
        const viewportScale = canvasRect.width / app.screen.width;
        const bounds = new Map(endpointBounds);
        for (const row of layout.areas) bounds.set(`zone:${row.zone.id}`, row);
        for (const [id, hand] of Object.entries(handStates))
          bounds.set(id, {
            x: hand.x,
            y: hand.y,
            width: hand.width,
            height: hand.height,
          });
        state.onAnchorLayout?.(
          Object.fromEntries(
            [...bounds].map(([id, box]) => [
              id,
              {
                x: canvasRect.left + box.x * viewportScale,
                y: canvasRect.top + box.y * viewportScale,
                width: box.width * viewportScale,
                height: box.height * viewportScale,
              },
            ]),
          ),
        );
      };
      publishHandAnchor = (id, hand) => {
        handStates[id] = hand;
        app.canvas.dataset.handCards = JSON.stringify(handStates);
        publishAnchors();
      };
      publishAnchors();
    }
    recordSimulatorMetric("boardPaint");
    app.render();
  };
  redraw = () => update(latestState);
  update(initialState);
  // Optional visual asset: never delay a playable board on a slow connection.
  void Assets.load<Texture>("/simulator/obsidian-material-v1.webp")
    .then((texture) => {
      if (disposed || signal.aborted) return;
      boardMaterial = texture;
      redraw();
    })
    .catch(() => { /* The vector surface remains usable if the material fails. */ });
  return { canvas: app.canvas, update, dispose: cleanup };
}
