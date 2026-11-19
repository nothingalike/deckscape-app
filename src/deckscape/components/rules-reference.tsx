"use client";
import { useState } from "react";
import Link from "next/link";
import type { Card } from "@/lib/types";
import {
  rules,
  rulesVersion,
  rulesChecked,
  rulesSource,
  cardRules,
} from "@/lib/rules";
export function RulesReference() {
  const [query, setQuery] = useState("");
  const found = rules.filter((r) =>
    `${r.id} ${r.title} ${r.terms} ${r.summary}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="page">
      <h1>Rules & keywords</h1>
      <p>
        Reference guide to Comprehensive Rules v{rulesVersion}. Source checked{" "}
        {rulesChecked}. Search indexed topics and keywords; the linked official
        PDF contains the complete rules, conditions, and exceptions.
      </p>
      <p className="muted">
        Brief explanations below are Deckscape summaries, not official rulings.
      </p>
      <label>
        Search rules
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Keyword, topic or rule number"
        />
      </label>
      {found.map((r) => (
        <article className="deck-tools" key={r.id}>
          <h2>
            <Link href={`/rules/${r.id}`}>
              {r.title} · {r.id}
            </Link>
          </h2>
          {r.summary && <p>{r.summary}</p>}
        </article>
      ))}
      {!found.length && (
        <p>
          No indexed topic matches.{" "}
          <a href={rulesSource} target="_blank" rel="noreferrer">
            Search the official rulebook
          </a>
          .
        </p>
      )}
    </div>
  );
}
export function CardRules({ card }: { card: Card }) {
  const relevant = cardRules(card);
  if (!relevant.length) return null;
  return (
    <details className="card-keywords">
      <summary>Card keywords</summary>
      <p className="card-keywords-disclaimer">
        Named mechanics in this card’s rules text. Brief explanations are
        Deckscape summaries, not official rulings. Rules v{rulesVersion}.
      </p>
      {relevant.map((r) => (
        <div className="card-keyword" key={r.id}>
          <Link href={`/rules/${r.id}`} target="_blank" rel="noreferrer">
            {r.title} · {r.id} ↗
          </Link>
          {r.summary && <p>{r.summary}</p>}
        </div>
      ))}
    </details>
  );
}
