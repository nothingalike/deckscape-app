"use client";

import { useEffect, useRef } from "react";
import {
  presentationFor,
  type CardPresentation,
  type VisibleBoardCard,
} from "@/lib/simulator/board-view";
import styles from "./card-choice-tray.module.css";

export function RamStackBrowser({
  cards,
  presentations,
  selected,
  candidates,
  onChoose,
  onClose,
}: {
  cards: VisibleBoardCard[];
  presentations: Record<string, CardPresentation>;
  selected: readonly string[];
  candidates?: readonly string[];
  onChoose: (id: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = dialog.current!;
    node.showModal();
    return () => {
      node.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={styles.tray}
      style={{
        width: `min(${Math.max(320, Math.min(1100, cards.length * 222 + 32))}px, calc(100vw - 24px))`,
        boxSizing: "border-box",
      }}
      aria-label="RAM stack"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2>RAM · {cards.length}</h2>
        <button type="button" style={{ minHeight: 44 }} onClick={onClose}>
          Back to board
        </button>
      </header>
      <div className={styles.cards}>
        {cards.map((card, index) => {
          const detail = presentationFor(card, presentations);
          return (
            <div className={styles.card} key={card.instanceId}>
              <button
                type="button"
                data-ram-card={card.instanceId}
                style={{ minHeight: 44 }}
                aria-label={`${candidates ? "Select" : "Inspect"} ${detail.name}, RAM ${index + 1}`}
                aria-pressed={selected.includes(card.instanceId)}
                disabled={!!candidates && !candidates.includes(card.instanceId)}
                onClick={() => onChoose(card.instanceId)}
              >
                {detail.artworkUrl && <img src={detail.artworkUrl} alt="" />}
                <strong>{detail.name}</strong>
                <span>{card.running ? "Running" : "Refreshed"}</span>
                {selected.includes(card.instanceId) && <span>Selected</span>}
              </button>
              {detail.rulesText && (
                <details>
                  <summary style={{ minHeight: 44 }}>Card details</summary>
                  <p>{detail.rulesText}</p>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </dialog>
  );
}
