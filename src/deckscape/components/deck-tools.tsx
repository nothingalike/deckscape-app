"use client";
import { useState } from "react";
import type { Card, Entry } from "@/lib/types";
import {
  deckStats,
  openingHand,
  mulligan,
  drawNext,
  type HandState,
} from "@/lib/deck-stats";
import { validateDeck } from "@/lib/validation";
import { CardArt } from "./card-art";
export function DeckTools({
  entries,
  cards,
  expandedCurve = false,
}: {
  entries: Entry[];
  cards: Card[];
  expandedCurve?: boolean;
}) {
  const stats = deckStats(entries, cards);
  const maxCount = Math.max(1, ...stats.costs.map(([, count]) => count));
  const [state, setState] = useState<HandState | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [tested, setTested] = useState("");
  const issues = validateDeck(entries, cards);
  const untestable = issues.some((i) =>
    ["unknown", "entry", "duplicate", "section"].includes(i.code),
  );
  function start() {
    try {
      if (untestable)
        throw new Error(
          "Resolve unknown cards, invalid quantities, or invalid sections before testing.",
        );
      setState(openingHand(entries));
      setSelected([]);
      setTested(JSON.stringify(entries));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="deck-tools">
      <details open={expandedCurve || undefined}>
        <summary>RAM cost curve</summary>
        <p className="curve-note">
          Cyberdeck copies by total RAM cost. Variable and unprinted costs are
          grouped separately.
        </p>
        {stats.costs.length ? (
          <figure className="ram-curve">
            <div
              className="curve"
              role="group"
              aria-label="Card counts by RAM cost"
            >
              {stats.costs.map(([cost, count]) => (
                <div className="curve-column" key={cost}>
                  <div className="curve-track">
                    <div
                      className="curve-bar"
                      role="meter"
                      aria-label={`${cost} RAM: ${count} cards`}
                      aria-valuemin={0}
                      aria-valuemax={maxCount}
                      aria-valuenow={count}
                      style={{ height: `${(count / maxCount) * 100}%` }}
                    >
                      <span className="curve-count" aria-hidden="true">
                        {count}
                      </span>
                    </div>
                  </div>
                  <span className="curve-cost">{cost}</span>
                </div>
              ))}
            </div>
            <figcaption>
              RAM cost · Counts above bars show card copies
            </figcaption>
          </figure>
        ) : (
          <p>No cyberdeck cards yet.</p>
        )}
      </details>
      <button className="secondary" onClick={start}>
        Test opening hand
      </button>
      {error && <p role="alert">{error}</p>}
      {state && (
        <div>
          <h3>Opening-hand tester</h3>
          <p>
            Five-card opening hand; one mulligan of any number of cards. Select
            cards in your preferred bottom-of-deck order (first selected is
            topmost). Drawing next ends the mulligan opportunity.
          </p>
          <a
            href="https://www.neuroscapetcg.com/s/Neuroscape-Comprehensive-Rules-v100.pdf#page=7"
            target="_blank"
            rel="noreferrer"
          >
            Official rules v1.0, 103.5–103.5c
          </a>
          {issues.length > 0 && (
            <p className="notice">
              This draft is not a valid constructed deck. Testing does not make
              it legal.
            </p>
          )}
          {tested !== JSON.stringify(entries) && (
            <p className="notice">
              Deck changed since this hand was drawn. Reset to test the new
              list.
            </p>
          )}
          <div className="test-hand">
            {state.hand.map((id, i) => {
              const c = cards.find((c) => c.id === id);
              return (
                <button
                  className={selected.includes(i) ? "selected" : "secondary"}
                  aria-pressed={selected.includes(i)}
                  aria-label={`${c?.name ?? "Unknown card"} hand card ${i + 1}`}
                  key={i}
                  disabled={state.mulliganUsed}
                  onClick={() =>
                    setSelected((s) =>
                      s.includes(i) ? s.filter((n) => n !== i) : [...s, i],
                    )
                  }
                >
                  {c && <CardArt card={c} />}
                  <span>
                    {c?.name}
                    {selected.includes(i)
                      ? ` · bottom order ${selected.indexOf(i) + 1}`
                      : ""}
                  </span>
                </button>
              );
            })}
          </div>
          <p>
            {state.drawn} drawn · {state.pile.length} remaining ·{" "}
            {state.hand.length} in hand
          </p>
          <div className="public-actions">
            <button
              disabled={state.mulliganUsed}
              onClick={() => {
                setState(mulligan(state, selected));
                setSelected([]);
              }}
            >
              Mulligan selected
            </button>
            <button
              className="secondary"
              disabled={!state.pile.length}
              onClick={() => {
                setState(drawNext(state));
                setSelected([]);
              }}
            >
              Draw next
            </button>
            <button className="secondary" onClick={start}>
              Reset hand
            </button>
            <button className="text-button" onClick={() => setState(null)}>
              Close tester
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
