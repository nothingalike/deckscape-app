"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLegacyForms } from "./visual-action-controls";
import type { CardInspection as Inspection } from "@/lib/simulator/card-inspection";
import { CardDetails } from "./card-inspection";
import styles from "./card-choice-tray.module.css";

export function CardChoiceTray({
  title,
  children,
  enabled = true,
}: {
  title: string;
  children: ReactNode;
  enabled?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(true);
  const legacy = useLegacyForms();
  useEffect(() => {
    if (legacy || !enabled) return;
    const node = dialog.current;
    if (open && node && !node.open) node.showModal();
    return () => node?.close();
  }, [open, legacy, enabled]);
  if (legacy || !enabled) return <>{children}</>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open {title}
      </button>
      <dialog
        ref={dialog}
        aria-label={title}
        className={styles.tray}
        onCancel={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" onClick={() => setOpen(false)}>
            Back to board
          </button>
        </header>
        {children}
      </dialog>
    </>
  );
}

export function TrayCards({
  cards,
  selected,
  onChoose,
  disabled = false,
}: {
  cards: (Inspection & { id: string; eligible: boolean })[];
  selected: string[];
  onChoose: (id: string) => void;
  disabled?: boolean;
}) {
  const legacy = useLegacyForms();
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const activeCard = cards.find((card) => card.id === activeCardId) ?? cards[0];
  if (legacy) return null;
  return (
    <div className={styles.choiceLayout}>
      <div className={styles.cards}>
        {cards.map((card) => (
          <div key={card.id} className={styles.card} onMouseEnter={() => setActiveCardId(card.id)}>
            <button
              type="button"
              disabled={disabled || !card.eligible}
              aria-pressed={selected.includes(card.id)}
              aria-label={"Select " + card.characteristics.name}
              onFocus={() => setActiveCardId(card.id)}
              onClick={() => onChoose(card.id)}
            >
              {card.artworkUrl && (
                <img
                  src={card.artworkUrl}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(event) => {
                    event.currentTarget.hidden = true;
                  }}
                />
              )}
              <strong>{card.characteristics.name}</strong>
              {selected.includes(card.id) && (
                <span>
                  Selected
                  {selected.length > 1
                    ? " · " + (selected.indexOf(card.id) + 1)
                    : ""}
                </span>
              )}
              {!card.eligible && <span>Not eligible</span>}
            </button>
          </div>
        ))}
      </div>
      {activeCard && (
        <aside className={styles.cardInfo} aria-label={`${activeCard.characteristics.name} card details`}>
          <CardDetails {...activeCard} />
        </aside>
      )}
    </div>
  );
}
