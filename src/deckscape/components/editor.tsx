"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Cloud, ExternalLink, Radio } from "lucide-react";

import { Catalog } from "./catalog";
import { DeckExport } from "./deck-export";
import { DeckWorkspace } from "./deck-workspace";
import { DeckDrawer } from "./deck-drawer";
import { DismissibleNotice } from "./dismissible-notice";
import { useEditorLayout } from "@/lib/use-editor-layout";
import { useCatalogScroll } from "@/lib/use-catalog-scroll";

import { validateDeck } from "@/lib/validation";
import { sectionLabels, type Card, type Deck, type Section } from "@/lib/types";
import { useDialog } from "@/lib/use-dialog";
import { addDestination } from "@/lib/deck-layout";
import {
  changeDeckCardEntries,
  getDeckCardAction,
} from "@/lib/deck-card-strategy";
import { saveLocalDeck, deleteLocalDeck } from "@/lib/local-decks";

import { CardPreview } from "./card-preview";
import { backupKey, downloadDeck, draftContent } from "@/lib/draft-backup";
import { DraftRecovery } from "./draft-recovery";
import { SoloDeckStatus } from '../../desktop/solo-support';

export function Editor({
  cards,
  initial,
  local = true,
  signedIn = false,
  guest = false,
}: {
  cards: Card[];
  initial: Deck;
  local?: boolean;
  signedIn?: boolean;
  guest?: boolean;
}) {
  const [deck, setDeckState] = useState(initial);
  const [backupError, setBackupError] = useState("");
  const backupId = useRef("");
  const recoverySources = useRef(new Map<string, string>());
  function setDeck(value: Deck | ((previous: Deck) => Deck)) {
    const next = typeof value === "function" ? value(current.current) : value;
    if (draftContent(next) !== draftContent(current.current)) {
      try {
        if (!backupId.current)
          backupId.current = backupKey(next.id) + ":" + crypto.randomUUID();
        localStorage.setItem(backupId.current, JSON.stringify(next));
        setBackupError("");
      } catch {
        setBackupError(
          "Recovery storage is unavailable. Download your draft before leaving if saving fails.",
        );
      }
    }
    current.current = next;
    setDeckState(next);
  }
  const [status, setStatus] = useState(
    local ? "Saved on this device only" : "All changes saved",
  );
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const published = false;
  const [replacement, setReplacement] = useState<{
    card: Card;
    section: Section;
  } | null>(null);
  const replacementRef = useDialog(!!replacement, () => setReplacement(null));
  const { drawer, preference, chooseLayout } = useEditorLayout();
  const catalogRef = useCatalogScroll(drawer);
  const [selected, setSelected] = useState<Card | null>(null);
  const current = useRef(deck);
  const saved = useRef(
    JSON.stringify({
      name: initial.name,
      description: initial.description,
      entries: initial.entries,
    }),
  );
  const saving = useRef<Promise<Deck> | null>(null);
  const revision = useRef(initial.revision);
  current.current = deck;
  const serialize = (d: Deck) =>
    JSON.stringify({
      name: d.name,
      description: d.description,
      entries: d.entries,
    });
  const save = useCallback(async (): Promise<Deck> => {
    if (saving.current) {
      await saving.current;
      return save();
    }
    const snapshot = current.current;
    const recoveredSources = [...recoverySources.current];
    if (serialize(snapshot) === saved.current)
      return { ...snapshot, revision: revision.current };
    if (conflict)
      throw new Error(
        "Reload to resolve the conflicting edit. Your unsaved changes are still shown here.",
      );
    setStatus("Saving…");
    setError("");
    const pending = (async () => {
      try {
        const result = await saveLocalDeck(snapshot, revision.current);
        revision.current = result.revision;
        saved.current = serialize(snapshot);
        for (const [key, content] of recoveredSources) {
          try {
            const raw = localStorage.getItem(key);
            if (raw && draftContent(JSON.parse(raw)) === content)
              localStorage.removeItem(key);
            if (recoverySources.current.get(key) === content)
              recoverySources.current.delete(key);
          } catch {}
        }
        if (serialize(current.current) === saved.current) {
          try {
            if (backupId.current) localStorage.removeItem(backupId.current);
          } catch {}
        }
        setDeck((d) => ({ ...d, revision: result.revision }));
        setStatus(local ? "Saved on this device only" : "All changes saved");
        return result;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Save failed.";
        setError(message);
        if (message.includes("CONFLICT")) setConflict(true);
        setStatus("Changes not saved");
        throw e;
      }
    })();
    saving.current = pending;
    try {
      return await pending;
    } finally {
      if (saving.current === pending) saving.current = null;
    }
  }, [conflict, local]);
  useEffect(() => {
    if (serialize(deck) === saved.current || conflict) return;
    setStatus("Unsaved changes");
    const timer = setTimeout(() => {
      void save().catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [deck, save, conflict]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (serialize(current.current) !== saved.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
  useEffect(() => {
    // Next.js links do not trigger beforeunload. Flush pending edits before
    // leaving through in-app navigation, and stay on the draft if saving fails.
    const navigate = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        serialize(current.current) === saved.current
      )
        return;
      const anchor = (event.target as Element).closest<HTMLAnchorElement>(
        "a[href]",
      );
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      )
        return;
      const destination = new URL(anchor.href);
      if (
        destination.origin !== location.origin ||
        (destination.pathname === location.pathname &&
          destination.search === location.search && destination.hash === location.hash)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      void save()
        .then(() => { location.hash = destination.hash; })
        .catch(() => {});
    };
    document.addEventListener("click", navigate, true);
    return () => document.removeEventListener("click", navigate, true);
  }, [save]);
  const issues = useMemo(
    () => validateDeck(deck.entries, cards),
    [deck.entries, cards],
  );

  function change(card: Card, section: Section, delta: number) {
    setDeck((d) => ({
      ...d,
      entries: changeDeckCardEntries(d.entries, card, section, delta),
    }));
  }
  function add(card: Card, sideboard = false) {
    const action = getDeckCardAction(card, current.current.entries, sideboard);
    if (!action) {
      setError(`${card.name} is not eligible for this destination.`);
      return;
    }
    if (action.requiresReplacement) {
      setReplacement({ card, section: action.section });
      return;
    }
    change(card, action.section, 1);
  }
  async function action(kind: "publish" | "unpublish" | "delete") {
    if (kind !== "delete" || !confirm("Delete this deck? This cannot be undone.")) return;
    setBusy(true); setError("");
    try {
      if (saving.current) await saving.current;
      await deleteLocalDeck(deck.id, revision.current);
      saved.current = serialize(current.current);
      location.hash = "/decks";
    } catch (error) { setError(error instanceof Error ? error.message : "Could not delete this deck."); }
    finally { setBusy(false); }
  }
  return (
    <div className={`editor-page ${drawer ? "editor-drawer-mode" : ""}`}>
      <DraftRecovery
        initial={initial}
        restore={(restored, key) => {
          recoverySources.current.set(key, draftContent(restored));
          setDeck(restored);
        }}
      />
      {backupError && (
        <p className="notice error" role="alert">
          {backupError}
        </p>
      )}
      <div className="editor-heading">
        <div>
          <Link className="breadcrumb" href="/decks">
            MY DECKS /
          </Link>
          <input
            className="deck-title-input"
            aria-label="Deck name"
            value={deck.name}
            maxLength={120}
            onChange={(e) => setDeck({ ...deck, name: e.target.value })}
          />
          <span className="save-status" role="status">
            <Cloud size={14} />
            {status}
          </span>
        </div>
        <div className="editor-actions">
          {local && <Link href={'/solo/' + deck.id} className="button secondary">Fight a bot</Link>}
          <DeckExport deck={deck} cards={cards} />
        </div>
      </div>
      <DismissibleNotice noticeId="local-deck-storage" label="Device storage notice">
        Decks are saved on this computer. Export a copy to keep an independent backup.
      </DismissibleNotice>
      {local && <SoloDeckStatus entries={deck.entries} cards={cards} />}
      {error && (
        <div className="notice error" role="alert">
          {error}{" "}
          {conflict ? (
            <button
              className="text-button"
              onClick={async () => {
                const exported = current.current;
                try {
                  if (await downloadDeck(exported)) {
                    saved.current = serialize(exported);
                    location.reload();
                  }
                }
                catch (error) { setError(error instanceof Error ? error.message : 'The recovery backup could not be saved.'); }
              }}
            >
              Download edits and reload saved deck
            </button>
          ) : (
            <button
              className="text-button"
              onClick={() => void save().catch(() => {})}
            >
              Retry save
            </button>
          )}
        </div>
      )}
      <div
        className="editor-layout-toggle"
        role="group"
        aria-label="Editor layout"
      >
        <button
          className="secondary"
          aria-pressed={preference === "columns"}
          onClick={() => chooseLayout("columns")}
        >
          Two columns
        </button>
        <button
          className="secondary"
          aria-pressed={preference === "drawer"}
          onClick={() => chooseLayout("drawer")}
        >
          Drawer
        </button>
      </div>
      <div
        className={`editor-columns builder-layout ${drawer ? "builder-drawer-layout" : ""}`}
      >
        <section
          ref={catalogRef}
          className="editor-library"
          aria-label="Card library"
        >
          <div className="section-heading">
            <h2>Card library</h2>
          </div>
          <Catalog
            cards={cards}
            entries={deck.entries}
            onRemove={(card) => {
              const section = addDestination(card);
              if (section) change(card, section, -1);
            }}
            onAdd={(card) => add(card)}
            onAddSideboard={(card) => add(card, true)}
            compact
            layout="grid"
          />
        </section>
        <DeckDrawer enabled={drawer} entries={deck.entries}>
          <DeckWorkspace
            showTitleEditor={drawer}
            deck={deck}
            cards={cards}
            setDeck={setDeck}
            change={change}
            setSelected={setSelected}
            local={local}
            save={save}
            published={published}
            busy={busy}
            action={action}
            issues={issues}
          />
        </DeckDrawer>
      </div>
      {replacement && (
        <div className="modal-backdrop">
          <div
            className="card-dialog"
            ref={replacementRef}
            role="dialog"
            aria-modal="true"
            aria-label="Replace mainframe"
            onKeyDown={(e) => {
              if (e.key === "Escape") setReplacement(null);
            }}
          >
            <div>
              <h2>Replace mainframe?</h2>
              <p>
                Replace the {sectionLabels[replacement.section].toLowerCase()}{" "}
                with {replacement.card.name}?
              </p>
              <button
                onClick={() => {
                  change(replacement.card, replacement.section, 1);
                  setReplacement(null);
                }}
              >
                Replace mainframe
              </button>
              <button
                className="secondary"
                onClick={() => setReplacement(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {selected && (
        <CardPreview
          card={selected}
          onClose={() => setSelected(null)}
          entries={deck.entries}
          onAdd={(card) => add(card)}
          onAddSideboard={(card) => add(card, true)}
          onRemove={(card) => {
            const section = addDestination(card);
            if (section) change(card, section, -1);
          }}
        />
      )}
    </div>
  );
}
