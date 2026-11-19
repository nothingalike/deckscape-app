"use client";
import { useMemo } from "react";
import { Check, Minus, Plus, Trash2, AlertTriangle } from "lucide-react";
import { HoverCard } from "./hover-card";
import { CardArt } from "./card-art";
import { DeckStatistics } from "./deck-statistics";
import { profileGroups } from "@/lib/deck-layout";
import { getDeckCardStrategy } from "@/lib/deck-card-strategy";
import {
  sectionLabels,
  sections,
  type Card,
  type Deck,
  type Section,
  type Issue,
} from "@/lib/types";

export function DeckWorkspace({
  deck,
  cards,
  setDeck,
  change,
  setSelected,
  local,
  save,
  published,
  busy,
  action,
  issues,
  showTitleEditor = false,
}: {
  deck: Deck;
  cards: Card[];
  setDeck: (value: Deck | ((previous: Deck) => Deck)) => void;
  change: (card: Card, section: Section, delta: number) => void;
  setSelected: (card: Card) => void;
  local: boolean;
  save: () => Promise<Deck>;
  published: boolean;
  busy: boolean;
  action: (kind: "publish" | "unpublish" | "delete") => Promise<void>;
  issues: Issue[];
  showTitleEditor?: boolean;
}) {
  const map = useMemo(
    () => new Map(cards.map((card) => [card.id, card])),
    [cards],
  );
  const count = (section: Section) =>
    deck.entries
      .filter((entry) => entry.section === section)
      .reduce((n, entry) => n + entry.quantity, 0);
  return (
    <>
      <div className="deck-panel-heading">
        <span className="eyebrow">CONSTRUCTED / PRIVATE DRAFT</span>
        <span className="badge">{count("cyberdeck")} / 50+</span>
      </div>
      {showTitleEditor && (
        <label className="description-label">
          Deck title
          <input
            value={deck.name}
            maxLength={120}
            onChange={(e) => setDeck({ ...deck, name: e.target.value })}
          />
        </label>
      )}
      <label className="description-label">
        Deck description
        <textarea
          placeholder="Explain your game plan, key cards, opening-hand choices and substitutions…"
          aria-describedby="deck-description-help"
          value={deck.description}
          maxLength={10000}
          onChange={(e) => setDeck({ ...deck, description: e.target.value })}
        />
      </label>
      <p id="deck-description-help" className="muted">
        Keep notes about your game plan and card choices. Your description is saved with this deck.
      </p>
      {sections
        .flatMap<{
          label: string;
          section: Section;
          entries: Deck["entries"];
        }>((section) => {
          if (section === "cyberdeck") {
            const groups = profileGroups(deck.entries, cards);
            return groups.length
              ? groups.map((group) => ({ ...group, section }))
              : ["Characters", "Programs", "Gear"].map((label) => ({
                  label,
                  section,
                  entries: [],
                }));
          }
          return [
            {
              label: sectionLabels[section],
              section,
              entries: deck.entries.filter((e) => e.section === section),
            },
          ];
        })
        .map(({ section, label, entries }) => (
          <div className="deck-section" key={section + label}>
            <div className="section-select">
              <span>{label}</span>
              <span>
                {entries.reduce((total, entry) => total + entry.quantity, 0)}
                {section === "ram" ? " / 25" : ""}
              </span>
            </div>
            <div className="deck-card-grid">
              {entries.map((entry) => {
                const card = map.get(entry.card_id)!;
                if (!card)
                  return (
                    <div className="deck-entry" key={entry.card_id}>
                      <span>Unknown card ({entry.quantity})</span>
                      <button
                        className="secondary"
                        onClick={() =>
                          setDeck((d) => ({
                            ...d,
                            entries: d.entries.filter((e) => e !== entry),
                          }))
                        }
                      >
                        Remove unknown card
                      </button>
                    </div>
                  );
                return (
                  <div className="deck-entry" key={entry.card_id}>
                    <button
                      className="deck-entry-art"
                      aria-label={`Preview ${card.name}`}
                      onClick={() => setSelected(card)}
                    >
                      <HoverCard card={card}>
                        <CardArt card={card} />
                      </HoverCard>
                    </button>
                    <button
                      className="entry-name"
                      onClick={() => setSelected(card)}
                    >
                      {card.name}
                    </button>
                    <div className="quantity">
                      <button
                        aria-label={`Remove ${card.name} from ${sectionLabels[section]}`}
                        onClick={() => change(card, section, -1)}
                      >
                        <Minus size={12} />
                      </button>
                      <span>{entry.quantity}</span>
                      <button
                        aria-label={`Add ${card.name} to ${sectionLabels[section]}`}
                        disabled={
                          !getDeckCardStrategy(card)?.canIncrement(
                            entry.quantity,
                          )
                        }
                        onClick={() => change(card, section, 1)}
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {!entries.length && (
              <p className="section-empty">
                {section.includes("mainframe")
                  ? "Choose a mainframe from the library."
                  : "Add cards from the library."}
              </p>
            )}
          </div>
        ))}
      <section className="builder-footer" aria-label="Deck tools and settings">
        <h2>Deck tools</h2>
        <div className="builder-utilities">
          <details className="deck-tools builder-statistics" open>
            <summary>Stats</summary>
            <DeckStatistics entries={deck.entries} cards={cards} />
          </details>
        </div>
        <section className="builder-management" aria-label="Deck management">
          <h2>Deck management</h2>
          <div className={`legality ${issues.length ? "invalid" : "valid"}`}>
            <strong>
              {issues.length ? (
                <>
                  <AlertTriangle size={16} />
                  Incomplete constructed deck
                </>
              ) : (
                <>
                  <Check size={16} />
                  Valid constructed deck
                </>
              )}
            </strong>
            {issues.length > 0 && (
              <ul>
                {issues.map((i, n) => (
                  <li key={n}>{i.message}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="draft-controls">
            {published && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => action("unpublish")}
              >
                Unpublish
              </button>
            )}
            <button
              className="text-button danger"
              disabled={busy}
              onClick={() => action("delete")}
            >
              <Trash2 size={14} />
              Delete deck
            </button>
          </div>
        </section>
      </section>
    </>
  );
}
