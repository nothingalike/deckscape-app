import Link from "next/link";
import { Heart, MessageSquare, Layers3 } from "lucide-react";
import { CardArt } from "./card-art";
import type { Card, Entry } from "@/lib/types";
import { validateDeck } from "@/lib/validation";
import type { DeckReadiness } from "@/lib/simulator/deck-readiness";
import { DeckReadinessNotice } from "./simulator/deck-readiness";
import { SoloDeckStatus } from '../../desktop/solo-support';

export type DeckRowData = {
  simulatorReadiness?: DeckReadiness;
  id: string;
  revision?: number;
  name: string;
  entries: Entry[];
  updated_at: string;
  published_at?: string | null;
  like_count?: number;
  comment_count?: number;
};
export function DeckRow({
  deck,
  cards,
  mode = "account",
  quickPlayAccountState,
}: {
  deck: DeckRowData;
  cards: Card[];
  mode?: "account" | "local" | "public";
  quickPlayAccountState?: "guest" | "account";
}) {
  const mainframe = cards.find(
    (c) =>
      c.id === deck.entries.find((e) => e.section === "mainframe")?.card_id,
  );
  const published = !!deck.published_at;
  const date = mode === "public" ? deck.published_at! : deck.updated_at;
  const invalid =
    mode === "public" && validateDeck(deck.entries, cards).length > 0;
  const showReadiness = mode === "account" && !!deck.simulatorReadiness;
  const showQuickPlay =
    mode === "account" &&
    deck.revision !== undefined &&
    !!quickPlayAccountState;
  const socialCounts = published && (
    <div className="deck-social-counts">
      <span>
        <Heart size={14} aria-hidden="true" />
        {deck.like_count ?? 0} {deck.like_count === 1 ? "like" : "likes"}
      </span>
      <span>
        <MessageSquare size={14} aria-hidden="true" />
        {deck.comment_count ?? 0}{" "}
        {deck.comment_count === 1 ? "comment" : "comments"}
      </span>
    </div>
  );
  const metadata = (
    <div
      className={
        mode === "account" ? "compact-deck-meta is-inline" : "compact-deck-meta"
      }
    >
      {mode !== "public" && (
        <span
          className={published ? "deck-status is-published" : "deck-status"}
        >
          {mode === "local"
            ? "Device draft"
            : published
              ? "Published"
              : "Draft"}
        </span>
      )}
      {mode === "account" && <span aria-hidden="true">·</span>}
      {mode !== "account" && socialCounts}
      <time dateTime={date}>
        {mode === "public" ? "Published" : "Updated"}{" "}
        {new Date(date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        })}
      </time>
      {mode === "account" && socialCounts}
    </div>
  );
  return (
    <li
      className={
        showReadiness || showQuickPlay
          ? "compact-deck-item has-simulator-controls"
          : undefined
      }
    >
      <Link
        className="compact-deck-row"
        href={
          mode === "public"
            ? `/d/${deck.id}`
            : mode === "local"
              ? `/decks/${deck.id}`
              : `/decks/${deck.id}`
        }
      >
        <div className="compact-deck-art">
          {mainframe ? (
            <CardArt card={mainframe} />
          ) : (
            <Layers3 aria-label="No mainframe selected" />
          )}
        </div>
        <div className="compact-deck-info">
          <h3>{deck.name}</h3>
          <p>
            {mainframe?.name || "Choose a mainframe"}
            {mainframe && (
              <> · {mainframe.factions.join(" / ") || "Factionless"}</>
            )}
          </p>
          {invalid && (
            <span className="warning-text">Rule update · needs review</span>
          )}
          {mode === "account" && metadata}
        </div>
        {mode !== "account" && metadata}
      </Link>
      {mode === 'local' && <div className="local-deck-solo"><SoloDeckStatus entries={deck.entries} cards={cards} />
        <Link href={'/solo/' + deck.id}>Fight a bot</Link></div>}
    </li>
  );
}
