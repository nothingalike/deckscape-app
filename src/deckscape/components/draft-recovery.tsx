"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import { sections, type Deck } from "@/lib/types";
import { backupKey, downloadDeck, draftContent } from "@/lib/draft-backup";
const backup = z.object({
  id: z.string(),
  name: z.string().max(120),
  description: z.string().max(10000),
  revision: z.number(),
  updated_at: z.string().optional(),
  entries: z
    .array(
      z.object({
        card_id: z.uuid(),
        section: z.enum(sections),
        quantity: z.number().int().min(1).max(999),
      }),
    )
    .max(1000),
});
export function DraftRecovery({
  initial,
  restore,
}: {
  initial: Deck;
  restore: (deck: Deck, key: string) => void;
}) {
  const [copies, setCopies] = useState<{ key: string; deck: Deck }[]>([]);
  const recovered = copies[0]?.deck;
  const dismiss = () => {
    try {
      localStorage.removeItem(copies[0].key);
      setCopies((c) => c.slice(1));
    } catch {
      setError("Could not discard this recovery copy. Please try again.");
    }
  };
  const [error, setError] = useState("");
  useEffect(() => {
    try {
      const found: { key: string; deck: Deck }[] = [];
      for (const key of Object.keys(localStorage).filter(
        (key) =>
          key === backupKey(initial.id) ||
          key.startsWith(backupKey(initial.id) + ":"),
      )) {
        let result;
        try {
          result = backup.parse(JSON.parse(localStorage.getItem(key)!));
        } catch {
          setError(
            "A recovery copy could not be read. Other recovery copies remain available.",
          );
          continue;
        }
        if (
          result.id === initial.id &&
          draftContent(result as Deck) !== draftContent(initial)
        )
          found.push({ key, deck: result as Deck });
      }
      setCopies(found);
    } catch {
      setError(
        "A recovery copy could not be read. Download your current draft before leaving if saving fails.",
      );
    }
  }, [initial]);
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {recovered && (
        <div className="notice">
          <p>
            Unsaved edits from an earlier visit are available ({copies.length}{" "}
            recovery {copies.length === 1 ? "copy" : "copies"}). Restoring
            replaces the working draft with that copy. The restored draft is
            saved on this computer.
          </p>
          <button onClick={() => { void downloadDeck(recovered).catch(error => setError(error instanceof Error ? error.message : 'The recovered edits could not be saved.')); }}>
            Download recovered edits
          </button>{" "}
          <button
            onClick={() => {
              restore(
                { ...recovered, revision: initial.revision },
                copies[0].key,
              );
              setCopies((c) => c.slice(1));
            }}
          >
            Restore recovered edits
          </button>{" "}
          <button
            className="secondary"
            onClick={() => {
              dismiss();
            }}
          >
            Discard recovered edits
          </button>
        </div>
      )}
    </>
  );
}
