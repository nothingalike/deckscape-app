"use client";
import { useId, useState } from "react";
import { DeckRow, type DeckRowData } from "./deck-row";
import type { Card } from "@/lib/types";
export function WorkspaceDeckList({
  decks,
  cards,
  local = false,
  guest = false,
}: {
  decks: DeckRowData[];
  cards: Card[];
  local?: boolean;
  guest?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("recent");
  const visible = decks
    .filter((deck) => {
      const mainframe = cards.find(
        (c) =>
          c.id === deck.entries.find((e) => e.section === "mainframe")?.card_id,
      );
      return (
        (status === "all" ||
          (status === "published"
            ? !!deck.published_at
            : !deck.published_at)) &&
        [deck.name, mainframe?.name, ...(mainframe?.factions || [])]
          .join(" ")
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      );
    })
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "oldest"
          ? a.updated_at.localeCompare(b.updated_at)
          : b.updated_at.localeCompare(a.updated_at),
    );
  return (
    <div className="workspace-deck-list">
      <div className="deck-list-toolbar">
        <label htmlFor={id + "-search"}>
          Find a deck
          <input
            id={id + "-search"}
            type="search"
            placeholder="Deck name, mainframe, or faction"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {!local && (
          <label htmlFor={id + "-status"}>
            Status
            <select
              id={id + "-status"}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">All decks</option>
              <option value="draft">Drafts</option>
              <option value="published">Published</option>
            </select>
          </label>
        )}
        <label htmlFor={id + "-sort"}>
          Sort by
          <select
            id={id + "-sort"}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="recent">Recently updated</option>
            <option value="oldest">Oldest updated</option>
            <option value="name">Deck name</option>
          </select>
        </label>
      </div>
      <p className="deck-list-count" role="status">
        {visible.length} {visible.length === 1 ? "deck" : "decks"}
      </p>
      <ul className="compact-deck-list">
        {visible.map((deck) => (
          <DeckRow
            key={deck.id}
            deck={deck}
            cards={cards}
            mode={local ? "local" : "account"}
            quickPlayAccountState={
              local ? undefined : guest ? "guest" : "account"
            }
          />
        ))}
      </ul>
      {!visible.length && <p className="empty">No decks match your filters.</p>}
    </div>
  );
}
