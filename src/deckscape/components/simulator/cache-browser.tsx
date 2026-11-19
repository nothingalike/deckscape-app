"use client";

import { useEffect, useRef, useState } from "react";
import {
  presentationFor,
  type CardPresentation,
  type PlayerGameView,
  type VisibleBoardCard,
} from "@/lib/simulator/board-view";
import styles from "./card-choice-tray.module.css";

type PendingAction = NonNullable<PlayerGameView["priority"]>["stack"][number];

export function CacheBrowser({
  cards,
  visibleCards,
  actions,
  presentations,
  onHide,
  onChoose,
  onEndpointLayout,
  candidates,
  intentLines = [],
}: {
  cards: VisibleBoardCard[];
  visibleCards: VisibleBoardCard[];
  actions: PendingAction[];
  presentations: Record<string, CardPresentation>;
  onHide: () => void;
  onChoose: (id: string) => void;
  onEndpointLayout?: (
    placements: Readonly<Record<string, { x: number; y: number }>>,
  ) => void;
  candidates?: readonly string[];
  intentLines?: readonly import("./board-canvas").ViewportIntent[];
}) {
  const tray = useRef<HTMLElement>(null);
  const chrome = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(false);
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (!chrome.current || !tray.current) return;
    const host = chrome.current,
      content = tray.current;
    let stopped = false;
    let dispose: (() => void) | undefined;
    void import("./match-hud-canvas.js")
      .then(async ({ mountHudCanvas }) => {
        dispose = await mountHudCanvas(host, content, () => stopped);
        if (stopped) dispose();
      })
      .catch(() => {
        if (!stopped) setFallback(true);
      });
    return () => {
      stopped = true;
      dispose?.();
    };
  }, []);
  useEffect(() => {
    const hide = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        const dialog = (event.target as Element | null)?.closest?.(
          '[role="dialog"]',
        );
        if (dialog && dialog !== tray.current) return;
        event.stopPropagation();
        onHide();
      }
    };
    window.addEventListener("keydown", hide, true);
    return () => {
      window.removeEventListener("keydown", hide, true);
    };
  }, [onHide]);
  // The projected stack is in placement order; show the resolving action first,
  // then newest pending actions. Preserve action identity even for shared sources.
  const entries = [
    ...[...actions].reverse().map((action) => ({
      key: action.id,
      endpointId: `cache-action:${action.id}`,
      card: visibleCards.find((card) => card.instanceId === action.sourceId),
    })),
    ...cards
      .filter(
        (card) =>
          !actions.some((action) => action.sourceId === card.instanceId),
      )
      .map((card) => ({
        key: `card:${card.instanceId}`,
        endpointId: `cache-card:${card.instanceId}`,
        card,
      })),
  ];
  const endpointKey = entries.map((entry) => entry.key).join("|");
  const pages = Math.max(1, Math.ceil(entries.length / 2));
  const currentPage = Math.min(page, pages - 1);
  useEffect(() => setPage(0), [endpointKey]);
  useEffect(() => {
    const root = tray.current;
    if (!root || !onEndpointLayout) return;
    const report = () => {
      const placements: Record<string, { x: number; y: number }> = {};
      const rootBounds = root.getBoundingClientRect();
      placements["cache-frame:start"] = {
        x: rootBounds.left,
        y: rootBounds.top,
      };
      placements["cache-frame:end"] = {
        x: rootBounds.right,
        y: rootBounds.bottom,
      };
      for (const node of root.querySelectorAll<HTMLElement>(
        "[data-board-endpoint]",
      )) {
        const id = node.dataset.boardEndpoint;
        if (!id || !node.getClientRects().length) continue;
        const bounds = node.getBoundingClientRect();
        placements[`${id}:start`] = { x: bounds.left, y: bounds.top };
        placements[`${id}:end`] = { x: bounds.right, y: bounds.bottom };
        placements[id] = {
          x: bounds.left + bounds.width / 2,
          y: bounds.top + bounds.height / 2,
        };
      }
      onEndpointLayout(placements);
    };
    const observer = new ResizeObserver(report);
    observer.observe(root);
    window.addEventListener("resize", report);
    const frame = requestAnimationFrame(report);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", report);
      onEndpointLayout({});
    };
  }, [endpointKey, currentPage, onEndpointLayout]);
  return (
    <section
      ref={tray}
      role="dialog"
      aria-modal="false"
      className={`${styles.tray} ${styles.cacheTray}`}
      style={{
        width: `min(${entries.length > 1 ? 284 : 160}px, calc(100vw - 32px))`,
      }}
      aria-label="Cache"
      data-cache-surface
      data-fallback={fallback || undefined}
      data-pixi-intents={JSON.stringify(intentLines)}
    >
      <div ref={chrome} className={styles.cacheChrome} aria-hidden="true" />
      <header>
        <h2 data-pixi-text>Cache · {entries.length}</h2>
        <button
          data-pixi-button
          type="button"
          aria-label="Hide Cache"
          title="Hide Cache"
          className={styles.cacheCollapse}
          onClick={onHide}
        >
          ⌃
        </button>
      </header>
      <div className={styles.cards}>
        {entries.map(({ key, endpointId, card }, index) => {
          const detail = card ? presentationFor(card, presentations) : null;
          return (
            <article
              key={key}
              className={styles.card}
              data-cache-entry={key}
              hidden={Math.floor(index / 2) !== currentPage}
            >
              <button
                type="button"
                data-cache-card={card?.instanceId}
                data-pixi-card
                data-pixi-label={detail?.name ?? "Source unavailable"}
                data-pixi-artwork={detail?.artworkUrl}
                data-board-endpoint={endpointId}
                disabled={
                  !card ||
                  (!!candidates && !candidates.includes(card.instanceId))
                }
                onClick={() => card && onChoose(card.instanceId)}
                aria-label={
                  detail
                    ? `${candidates ? "Select" : "Inspect"} ${detail.name}`
                    : "Source unavailable"
                }
              >
                {detail?.artworkUrl ? (
                  <img src={detail.artworkUrl} alt="" />
                ) : (
                  <span className={styles.cacheFallback}>
                    <strong>{detail?.name ?? "Source unavailable"}</strong>
                    <small>No artwork available</small>
                  </span>
                )}
              </button>
            </article>
          );
        })}
      </div>
      {pages > 1 && (
        <nav className={styles.cachePages} aria-label="Cache pages">
          <button
            data-pixi-button
            type="button"
            aria-label="Previous Cache page"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            ‹
          </button>
          <span data-pixi-text role="status">
            {currentPage + 1} / {pages}
          </span>
          <button
            data-pixi-button
            type="button"
            aria-label="Next Cache page"
            disabled={currentPage === pages - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            ›
          </button>
        </nav>
      )}
    </section>
  );
}
