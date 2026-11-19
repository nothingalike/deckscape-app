import { Input } from "../../renderer/ui/input";
"use client";
import { CardDetailsLink } from "./card-details-link";
import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, Plus, X, ChevronDown } from "lucide-react";
import { sortCards, type CardSort } from "@/lib/card-sort";
import { CardBrowseControls } from "./card-browse-controls";
import { HoverCard } from "./hover-card";
import { CardArt } from "./card-art";
import { type Card, type Entry } from "@/lib/types";
import { CardQuantityControls } from "./card-quantity-controls";
import { addDestination } from "@/lib/deck-layout";
import { CardPreview } from "./card-preview";
import { CardSourceStatus } from '../../desktop/card-source-status';
import { CardSoloSupport } from '../../desktop/solo-support';

export function Catalog({
  cards,
  detailLinks = false,
  onAdd,
  onAddSideboard,
  entries,
  onRemove,
  compact = false,
  layout: initialLayout = "grid",
}: {
  cards: Card[];
  detailLinks?: boolean;
  onAdd?: (card: Card) => void;
  onAddSideboard?: (card: Card) => void;
  entries?: Entry[];
  onRemove?: (card: Card) => void;
  compact?: boolean;
  layout?: "grid" | "list";
}) {
  const [layout, setLayout] = useState(initialLayout);
  const [sort, setSort] = useState<CardSort>("number");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [preview, setPreview] = useState<Card | null>(null);
  const [limit, setLimit] = useState(36);
  const options = useMemo(
    () => ({
      faction: [...new Set(cards.flatMap((c) => c.factions))].sort(),
      card_type: [...new Set(cards.map((c) => c.card_type))].sort(),
      subtype: [...new Set(cards.map((c) => c.subtype).filter(Boolean))].sort(),
      ram_cost: [...new Set(cards.flatMap((c) => c.ram_cost))].sort(
        (a, b) => Number(a) - Number(b),
      ),
      set_code: [...new Set(cards.map((c) => c.set_code))].sort(),
      rarity: [...new Set(cards.map((c) => c.rarity).filter(Boolean))].sort(),
    }),
    [cards],
  );
  const results = useMemo(
    () =>
      sortCards(
        cards.filter((c) => {
          const search = `${c.name} ${c.rules_text}`.toLowerCase();
          return (
            search.includes(query.toLowerCase()) &&
            Object.entries(filters).every(
              ([key, value]) =>
                !value ||
                (key === "faction"
                  ? value === "__factionless__"
                    ? c.factions.length === 0
                    : c.factions.includes(value)
                  : key === "ram_cost"
                    ? c.ram_cost.includes(value)
                    : c[key as keyof Card] === value),
            )
          );
        }),
        sort,
      ),
    [cards, query, filters, sort],
  );
  const labels: Record<string, string> = {
    faction: "Faction",
    card_type: "Card type",
    subtype: "Subtype / class",
    ram_cost: "RAM cost",
    set_code: "Set",
    rarity: "Rarity",
  };
  function primaryAction(card: Card) {
    if (!onAdd) return null;
    const section = addDestination(card);
    if (entries && onRemove && section) {
      return (
        <CardQuantityControls
          card={card}
          entries={entries}
          onAdd={onAdd}
          onRemove={onRemove}
        />
      );
    }
    return (
      <button
        className="add-card"
        aria-label={`Add ${card.name}`}
        disabled={!section}
        onClick={() => onAdd(card)}
      >
        <Plus size={16} /> Add
      </button>
    );
  }
  return (
    <div className={compact ? "catalog compact" : "catalog"}>
      <div className="search-row">
        <div className="search-field">
          <Search size={19} />
          <Input
            className="border-0 bg-transparent shadow-none dark:bg-transparent focus-visible:ring-0"
            aria-label="Search cards"
            placeholder="Search cards or rules text…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(36);
            }}
          />
          {query && (
            <button
              className="icon-button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
            >
              <X size={16} />
            </button>
          )}
        </div>
        <button
          className={`secondary filter-toggle ${showFilters ? "selected" : ""}`}
          aria-label="Filters"
          aria-expanded={showFilters}
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal size={17} />
          <span>Filters</span>
        </button>
      </div>
      {showFilters && (
        <div className="filters">
          {Object.entries(options).map(([key, values]) => (
            <label key={key}>
              {labels[key]}
              <select
                value={filters[key] ?? ""}
                onChange={(e) => {
                  setFilters({ ...filters, [key]: e.target.value });
                  setLimit(36);
                }}
              >
                <option value="">All</option>
                {key === "faction" && (
                  <option value="__factionless__">Factionless</option>
                )}
                {values.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button
            className="text-button"
            onClick={() => {
              setFilters({});
              setQuery("");
              setLimit(36);
            }}
          >
            Clear all
          </button>
        </div>
      )}
      <div className="results-meta">
        <span>
          {results.length} cards{" "}
          <span className="muted">/ {cards.length} in catalog</span>
        </span>
        <CardBrowseControls
          sort={sort}
          setSort={(value) => {
            setSort(value);
            setLimit(36);
          }}
          layout={layout}
          setLayout={setLayout}
        />
      </div>
      {!results.length ? (
        <div className="empty">
          <Search />
          <h3>No cards found</h3>
          <p>Try a different search or clear your filters.</p>
        </div>
      ) : (
        <div className={layout === "list" ? "catalog-list" : "card-grid"}>
          {results.slice(0, limit).map((c) =>
            layout === "list" ? (
              <article className="catalog-list-row" key={c.id}>
                <HoverCard card={c}>
                  <button
                    className="catalog-list-art art-button"
                    aria-label={"Preview " + c.name}
                    onClick={() => setPreview(c)}
                  >
                    <CardArt card={c} />
                  </button>
                </HoverCard>
                <div className="catalog-list-info">
                  <CardSourceStatus card={c} />
                  <CardSoloSupport card={c} />
                  <button
                    className="card-name"
                    aria-label={`View ${c.name}`}
                    onClick={() => setPreview(c)}
                  >
                    {c.name}
                  </button>
                  <p>
                    {c.set_code} · {c.collector_number || "—"} ·{" "}
                    {c.subtype || c.card_type} · {c.ram_cost.join(" + ") || "—"}{" "}
                    RAM
                  </p>
                </div>
                <div className="catalog-list-actions">
                  {primaryAction(c)}
                  {onAddSideboard && addDestination(c, true) && (
                    <button
                      className="secondary"
                      aria-label={`Add ${c.name} to Sideboard`}
                      onClick={() => onAddSideboard(c)}
                    >
                      Sideboard
                    </button>
                  )}
                </div>
                {detailLinks && (
                  <CardDetailsLink
                    className="card-detail-link"
                    aria-label={`Card details: ${c.name}`}
                    cardId={c.id}
                  >
                    Card details
                  </CardDetailsLink>
                )}
                {onAdd && !addDestination(c) && (
                  <small>Not eligible for deck construction</small>
                )}
              </article>
            ) : (
              <article className="catalog-card" key={c.id}>
                <button
                  className="art-button"
                  aria-label={`View ${c.name}`}
                  onClick={() => setPreview(c)}
                >
                  <HoverCard card={c}>
                    <CardArt card={c} />
                  </HoverCard>
                </button>
                <small className="card-printing">
                  {c.set_code} · {c.collector_number || "—"}
                </small>
                <CardSourceStatus card={c} />
                <CardSoloSupport card={c} />
                {detailLinks && (
                  <CardDetailsLink
                    className="card-detail-link"
                    aria-label={`Card details: ${c.name}`}
                    cardId={c.id}
                  >
                    Card details
                  </CardDetailsLink>
                )}
                <div className="catalog-caption">
                  <button className="card-name" onClick={() => setPreview(c)}>
                    {c.name}
                  </button>
                  {primaryAction(c)}
                </div>
                {onAddSideboard && addDestination(c, true) && (
                  <button
                    className="secondary"
                    aria-label={`Add ${c.name} to Sideboard`}
                    onClick={() => onAddSideboard(c)}
                  >
                    Add to Sideboard
                  </button>
                )}
                {onAdd && !addDestination(c) && (
                  <small>Not eligible for deck construction</small>
                )}
                <p>
                  {c.subtype || c.card_type}
                  <span>{c.ram_cost.join(" + ") || "—"} RAM</span>
                </p>
              </article>
            ),
          )}
        </div>
      )}
      {results.length > limit && (
        <button
          className="secondary load-more"
          onClick={() => setLimit(limit + 36)}
        >
          Show more cards <ChevronDown size={16} />
        </button>
      )}
      {preview && (
        <CardPreview
          card={preview}
          onClose={() => setPreview(null)}
          onAdd={onAdd}
          entries={entries}
          onRemove={onRemove}
          onAddSideboard={onAddSideboard}
        />
      )}
    </div>
  );
}
