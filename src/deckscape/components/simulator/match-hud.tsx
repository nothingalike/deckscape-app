"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PlayerGameView } from "@/lib/simulator/board-view";
import { turnStatus, turnStageLabels } from "@/lib/simulator/turn-status";
import { GameLog } from "./game-log";
import styles from "./match-hud.module.css";

/** Pixi draws HUD faces; these native elements own input and accessibility only. */
export function MatchHud({
  view,
  playerNames,
  spectator = false,
  automaticControls,
  options,
  children,
  compact = false,
}: {
  view: PlayerGameView;
  playerNames?: readonly [string, string];
  spectator?: boolean;
  automaticControls?: ReactNode;
  options?: ReactNode;
  children?: ReactNode;
  compact?: boolean;
}) {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1281px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const host = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logMounted, setLogMounted] = useState(false);
  const displayedLog = useRef(view.gameLog ?? []);
  if (logOpen || desktop) displayedLog.current = view.gameLog ?? [];
  const [phaseHint, setPhaseHint] = useState<string | null>(null);
  const [canvasFailed, setCanvasFailed] = useState(false);
  const logTrigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const status = turnStatus(view);
  useEffect(() => {
    if (logOpen) closeButton.current?.focus();
  }, [logOpen]);
  const closeLog = () => {
    setLogOpen(false);
    logTrigger.current?.focus();
  };
  useEffect(() => {
    const root = host.current,
      body = content.current;
    if (!root || !body) return;
    let stopped = false;
    let dispose: (() => void) | undefined;
    void import("./match-hud-canvas.js")
      .then(async ({ mountHudCanvas }) => {
        dispose = await mountHudCanvas(root, body, () => stopped, false);
        if (stopped) dispose?.();
      })
      .catch(() => {
        if (!stopped) setCanvasFailed(true);
      });
    return () => {
      stopped = true;
      dispose?.();
    };
  }, []);
  const symbols = ["◎", "↻", "↓", "×", "+", "◇", "⚔", "↺"];
  const stages = Object.entries(turnStageLabels);
  const currentIndex = stages.findIndex(([step]) => step === view.turn.step);
  const visibleStages = [-1, 0, 1].map((offset) => {
    const index = (currentIndex + offset + stages.length) % stages.length;
    return {
      step: stages[index][0],
      label: stages[index][1],
      symbol: symbols[index],
      position: offset === 0 ? "Current" : offset < 0 ? "Previous" : "Next",
    };
  });
  return (
    <>
      <aside
        data-match-hud
        data-persistent-log={desktop || undefined}
        className={styles.hud}
        aria-label={
          spectator ? "Spectator match controls" : "Match controls and log"
        }
      >
        {desktop && (
          <section
            className={styles.logPanel}
            data-combat-log
            aria-label="Combat log"
          >
            <div className={styles.logStatus}>
              <strong>{status.stage}</strong>
              <span>
                {spectator
                  ? (playerNames?.[view.turn.activePlayer] ?? "Player") +
                    "'s turn"
                  : status.instruction}
              </span>
            </div>
            <GameLog
              compact
              entries={view.gameLog ?? []}
              seat={view.seat}
              spectator={spectator}
              playerNames={playerNames}
            />
          </section>
        )}
        <div className={styles.actionPanel} data-action-panel>
          <div ref={host} className={styles.canvasHost} aria-hidden="true" />
          <div
            ref={content}
            data-action-surface={desktop || undefined}
            className={styles.content}
            data-fallback={canvasFailed || undefined}
          >
            <section aria-label="Current turn" data-turn-panel>
              <div className={styles.turnHeading}>
                <strong>
                  {spectator
                    ? `${playerNames?.[view.turn.activePlayer] ?? "Player"}'s turn`
                    : status.owner}{" "}
                  · Turn {view.turn.number}
                </strong>
              </div>
              <span className={styles.instruction}>
                {spectator ? status.stage : status.instruction}
              </span>
              <ol className={styles.stages} aria-label="Turn stages">
                {visibleStages.map(({ step, label, symbol, position }) => (
                  <li key={step}>
                    <button
                      type="button"
                      data-pixi-button
                      data-pixi-label={desktop ? label : symbol}
                      data-step-name={desktop || undefined}
                      aria-label={label}
                      title={`${position}: ${label}`}
                      aria-description={`${position} turn step`}
                      aria-current={
                        !view.outcome && step === view.turn.step
                          ? "step"
                          : undefined
                      }
                      onFocus={() => setPhaseHint(label)}
                      onClick={() => setPhaseHint(label)}
                    >
                      {label}
                    </button>
                  </li>
                ))}
              </ol>
            </section>
            {phaseHint && (
              <div className={styles.hint} role="status">
                {phaseHint}
                <button
                  type="button"
                  aria-label="Close phase explanation"
                  onClick={() => setPhaseHint(null)}
                >
                  ×
                </button>
              </div>
            )}
            <div className={styles.actionRow}>
              <div
                className={compact ? styles.primary : styles.tray}
                data-pixi-primary={compact ? "true" : undefined}
              >
                {!desktop && compact && view.turn.step === "deploy" && !view.outcome && (
                  <strong data-pixi-text>Deploy</strong>
                )}
                {children}
              </div>
              {automaticControls && (
                <div className={styles.autoPass}>{automaticControls}</div>
              )}
            </div>
            <div className={styles.toolbar} data-hud-toolbar>
              {!desktop && (
                <button
                  ref={logTrigger}
                  type="button"
                  data-pixi-button
                  data-pixi-label="≡"
                  aria-label="Game Log"
                  title="Game Log"
                  aria-haspopup="dialog"
                  aria-expanded={logOpen}
                  onClick={() => {
                    setLogMounted(true);
                    setLogOpen((open) => !open);
                  }}
                >
                  ≡ Game Log
                </button>
              )}
              {options && (
                <details className={styles.options}>
                  <summary
                    data-pixi-button
                    data-pixi-label="⚙"
                    aria-label="Options"
                    title="Options"
                  >
                    ⚙ Options
                  </summary>
                  <div className={styles.optionsBody}>{options}</div>
                </details>
              )}
            </div>
          </div>
        </div>
      </aside>
      <section
        className={styles.logDialog}
        hidden={!logOpen || desktop}
        role="dialog"
        aria-label="Game Log"
        aria-modal="false"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            closeLog();
          }
        }}
      >
        <button
          ref={closeButton}
          type="button"
          className={styles.close}
          aria-label="Close game log"
          onClick={closeLog}
        >
          ×
        </button>
        {!desktop && logMounted && (
          <GameLog
            entries={displayedLog.current}
            seat={view.seat}
            spectator={spectator}
            playerNames={playerNames}
            active={logOpen}
          />
        )}
      </section>
    </>
  );
}
