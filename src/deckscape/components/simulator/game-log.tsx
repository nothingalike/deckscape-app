"use client";

import { memo, useEffect, useRef } from "react";
import type { LogEntry } from "@/lib/simulator/game-log";
import styles from "./game-log.module.css";
import { turnStageLabels } from "@/lib/simulator/turn-status";

function LogText({
  entry,
  playerNames,
}: {
  entry: LogEntry;
  playerNames?: readonly [string, string];
}) {
  const cards = [...(entry.cards ?? [])]
    .filter((card) => card.name.length > 0)
    .sort((a, b) => b.name.length - a.name.length);
  const pieces: React.ReactNode[] = [];
  let text = entry.message;
  while (text) {
    const candidates = [
      ...cards.map((card) => ({
        text: card.name,
        className: styles.card + " " + styles[card.type],
        title: card.type,
      })),
      {
        text: "Player 1",
        className: styles.player1,
        title: playerNames?.[0] ?? "Player 1",
      },
      {
        text: "Player 2",
        className: styles.player2,
        title: playerNames?.[1] ?? "Player 2",
      },
    ]
      .map((token) => ({ ...token, index: text.indexOf(token.text) }))
      .filter((token) => token.index >= 0)
      .sort((a, b) => a.index - b.index || b.text.length - a.text.length);
    const next = candidates[0];
    if (!next) {
      pieces.push(text);
      break;
    }
    pieces.push(text.slice(0, next.index));
    pieces.push(
      <span key={pieces.length} className={next.className} title={next.title}>
        {next.text === "Player 1"
          ? (playerNames?.[0] ?? next.text)
          : next.text === "Player 2"
            ? (playerNames?.[1] ?? next.text)
            : next.text}
      </span>,
    );
    text = text.slice(next.index + next.text.length);
  }
  return <>{pieces}</>;
}

export const GameLog = memo(
  function GameLog({
    entries,
    seat,
    spectator = false,
    playerNames,
    active = true,
    compact = false,
  }: {
    entries: LogEntry[];
    active?: boolean;
    compact?: boolean;
    seat: 0 | 1;
    spectator?: boolean;
    playerNames?: readonly [string, string];
  }) {
    const box = useRef<HTMLDivElement>(null);
    const follow = useRef(true);
    useEffect(() => {
      if (active && follow.current && box.current)
        box.current.scrollTop = box.current.scrollHeight;
    }, [entries.length, active]);
    return (
      <section
        className={compact ? styles.compact : undefined}
        aria-labelledby="game-log-heading"
      >
        <h2 id="game-log-heading">{compact ? "Combat log" : "Game log"}</h2>
        {!compact && (
          <p>
            {spectator
              ? "Private card information is hidden from spectators."
              : `You are ${playerNames?.[seat] ?? `Player ${seat + 1}`}. Drawn card names are visible only to their owner.`}
          </p>
        )}
        {!compact && (
          <div className={styles.legend} aria-label="Card type colors">
            {(
              ["character", "gear", "program", "mainframe", "ram"] as const
            ).map((type) => (
              <span key={type} className={styles[type]}>
                {type === "ram" ? "RAM" : type[0].toUpperCase() + type.slice(1)}
              </span>
            ))}
          </div>
        )}
        <div
          ref={box}
          role="log"
          aria-label="Game log entries"
          aria-live="polite"
          aria-relevant="additions"
          tabIndex={0}
          onScroll={() => {
            if (!active) return;
            const el = box.current;
            if (el)
              follow.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 32;
          }}
          style={{
            maxHeight: "18rem",
            overflowY: "auto",
            border: "1px solid #51616a",
            padding: "0.75rem",
          }}
        >
          {entries.length ? (
            <ol className={styles.entries}>
              {entries.map((entry, index) => {
                const previous = entries[index - 1];
                const newTurn = !previous || previous.turn !== entry.turn;
                const phase = /^Turn \d+ — (Player [12]) — (.+)\.$/.exec(
                  entry.message,
                );
                const phaseParts = (phase?.[2] ?? entry.step).split(" / ");
                const phaseName =
                  turnStageLabels[entry.step as keyof typeof turnStageLabels] ??
                  entry.step;
                return (
                  <li
                    key={entry.id}
                    className={
                      /\brolls? -?\d+.*\b(?:d20|PSYCHOSIS)\b/.test(
                        entry.message,
                      )
                        ? styles.roll
                        : undefined
                    }
                  >
                    {newTurn && (
                      <h3 className={styles.turn}>
                        Turn {entry.turn}
                        {phase && (
                          <>
                            {" "}
                            ·{" "}
                            <span
                              className={
                                phase[1] === "Player 1"
                                  ? styles.player1
                                  : styles.player2
                              }
                            >
                              {phase[1] === "Player 1"
                                ? (playerNames?.[0] ?? phase[1])
                                : (playerNames?.[1] ?? phase[1])}
                            </span>
                          </>
                        )}
                      </h3>
                    )}
                    {(phase || newTurn || previous.step !== entry.step) && (
                      <h4 className={styles.phase}>
                        {phaseName}
                        {phaseParts[1]
                          ? " · " + phaseParts[1].replaceAll("-", " ")
                          : ""}
                      </h4>
                    )}
                    {!phase && (
                      <LogText entry={entry} playerNames={playerNames} />
                    )}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p>
              No recorded actions yet. Earlier actions from games started before
              logging was added are unavailable.
            </p>
          )}
        </div>
      </section>
    );
  },
  (previous, next) =>
    previous.entries === next.entries &&
    previous.active === next.active &&
    previous.compact === next.compact &&
    previous.seat === next.seat &&
    previous.spectator === next.spectator &&
    previous.playerNames?.[0] === next.playerNames?.[0] &&
    previous.playerNames?.[1] === next.playerNames?.[1],
);
