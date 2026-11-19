"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronUp, X } from "lucide-react";
import { useDialog } from "@/lib/use-dialog";
import type { Entry, Section } from "@/lib/types";

export function DeckDrawer({
  enabled,
  entries,
  children,
}: {
  enabled: boolean;
  entries: Entry[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const expanded = enabled && open;
  const ref = useDialog(expanded, () => setOpen(false));
  const viewportRef = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!enabled) setOpen(false);
  }, [enabled]);
  useEffect(() => {
    if (!enabled || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const update = () => {
      const node = viewportRef.current;
      node?.style.setProperty("--deck-viewport-height", `${viewport.height}px`);
      node?.style.setProperty(
        "--deck-keyboard-offset",
        `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`,
      );
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [enabled]);
  const count = (...sections: Section[]) =>
    entries
      .filter((entry) => sections.includes(entry.section))
      .reduce((sum, entry) => sum + entry.quantity, 0);
  return (
    <div
      className={enabled ? "deck-drawer-host" : "deck-panel"}
      ref={viewportRef}
    >
      {enabled && (
        <button
          className="deck-drawer-opener"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setOpen(true)}
        >
          <strong>
            View deck <ChevronUp size={16} />
          </strong>
          <span className="deck-drawer-counts">
            <span>
              Mainframe <b>{count("mainframe")}/1</b>
            </span>
            <span>
              Cyberdeck <b>{count("cyberdeck")}</b>
            </span>
            <span>
              RAM <b>{count("ram")}/25</b>
            </span>
            <span>
              Sideboard <b>{count("sideboard", "sideboard_mainframe")}</b>
            </span>
          </span>
        </button>
      )}
      <div
        className={
          enabled
            ? `deck-drawer-layer ${expanded ? "is-open" : ""}`
            : "deck-workspace-inline"
        }
        data-dialog-layer={enabled ? "" : undefined}
      >
        {enabled && (
          <div
            className="deck-drawer-backdrop"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
        )}
        <div
          ref={ref}
          id={id}
          role={enabled ? "dialog" : "region"}
          aria-modal={expanded ? true : undefined}
          aria-label="Deck list"
          tabIndex={-1}
          className={enabled ? "deck-drawer-panel" : "deck-workspace-panel"}
        >
          {enabled && (
            <header className="deck-drawer-heading">
              <h2>Your deck</h2>
              <button
                className="secondary"
                aria-label="Close deck"
                onClick={() => setOpen(false)}
              >
                <X size={16} /> Close
              </button>
            </header>
          )}
          <div className="deck-workspace-scroll">{children}</div>
        </div>
      </div>
    </div>
  );
}
