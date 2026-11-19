"use client";
import { useRef, useState } from "react";
import { Check, ChevronDown, Copy, Download, X } from "lucide-react";
import { downloadDeck } from "@/lib/draft-backup";
import { deckExportSnapshot, deckText } from "@/lib/deck-export";
import { downloadDeckImage } from "@/lib/deck-image-export";
import type { Card, Deck } from "@/lib/types";
import { useDialog } from "@/lib/use-dialog";

export function DeckExport({ deck, cards }: { deck: Deck; cards: Card[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [textOpen, setTextOpen] = useState(false);
  const [exportedText, setExportedText] = useState("");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const [imageStatus, setImageStatus] = useState<"idle" | "working" | "error">(
    "idle",
  );
  const [backupError, setBackupError] = useState('');
  const [savingBackup, setSavingBackup] = useState(false);
  const dialogRef = useDialog(textOpen, () => setTextOpen(false));

  function close() {
    if (ref.current) ref.current.open = false;
  }
  function showError() {
    if (ref.current) {
      ref.current.open = true;
      ref.current.querySelector('summary')?.focus();
    }
  }

  function openText() {
    setExportedText(deckText(deck, cards));
    setCopyStatus("idle");
    const summary = ref.current?.querySelector<HTMLElement>("summary");
    summary?.focus();
    close();
    setTextOpen(true);
  }

  async function copyText() {
    try {
      const result = await window.neuroscape.copyDeckText(exportedText);
      if (!result.ok) throw new Error(result.error.message);
      setCopyStatus("copied");
    } catch {
      textRef.current?.focus();
      textRef.current?.select();
      setCopyStatus("error");
    }
  }

  return (
    <>
      <details
        className="deck-export"
        ref={ref}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) close();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && ref.current?.open) {
            event.preventDefault();
            event.stopPropagation();
            close();
            ref.current.querySelector("summary")?.focus();
          }
        }}
      >
        <summary className="button secondary" tabIndex={0}>
          <Download size={16} /> Export <ChevronDown size={16} />
        </summary>
        <div className="deck-export-options">
          <button
            type="button"
            className="secondary"
            disabled={savingBackup}
            onClick={async () => {
              setSavingBackup(true); setBackupError('');
              try { if (await downloadDeck(deck)) close(); }
              catch (error) { setBackupError(error instanceof Error ? error.message : 'The backup could not be saved. Try again.'); showError(); }
              finally { setSavingBackup(false); }
            }}
          >
            Backup (.json)
            <small>Exact card IDs and quantities</small>
          </button>
          {backupError && <p className="deck-export-error" role="alert">{backupError}</p>}
          <button type="button" className="secondary" onClick={openText}>
            Copy card list
            <small>
              Opens name-based text; alternate printings may be ambiguous
            </small>
          </button>
          <button
            type="button"
            className="secondary"
            aria-busy={imageStatus === "working"}
            aria-disabled={imageStatus === "working"}
            onClick={async () => {
              if (imageStatus === "working") return;
              const snapshot = deckExportSnapshot(deck, cards);
              setImageStatus("working");
              try {
                const saved = await downloadDeckImage(snapshot);
                setImageStatus("idle");
                if (saved) close();
              } catch {
                setImageStatus("error");
                showError();
              }
            }}
          >
            {imageStatus === "working"
              ? "Creating promotional image…"
              : imageStatus === "error"
                ? "Retry promotional image (.png)"
                : "Promotional image (.png)"}
            <small>
              Shareable preview; not a complete or importable deck list
            </small>
          </button>
          {imageStatus === "error" && (
            <p className="deck-export-error" role="alert">
              The image could not be created. Your deck was not changed.
            </p>
          )}
        </div>
      </details>

      {textOpen && (
        <div className="modal-backdrop" onClick={() => setTextOpen(false)}>
          <div
            className="deck-list-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="deck-list-title"
            ref={dialogRef}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="icon-button dialog-close"
              aria-label="Close card list"
              onClick={() => setTextOpen(false)}
            >
              <X size={20} />
            </button>
            <h2 id="deck-list-title">Copy card list</h2>
            <p>
              Copy this text wherever you need it. Card names cannot distinguish
              alternate printings; use the JSON backup for an exact restore.
            </p>
            <textarea
              ref={textRef}
              aria-label="Exported card list"
              value={exportedText}
              readOnly
              spellCheck={false}
              onFocus={(event) => event.currentTarget.select()}
            />
            <div className="deck-list-dialog-actions">
              <button type="button" onClick={copyText}>
                {copyStatus === "copied" ? (
                  <Check size={16} />
                ) : (
                  <Copy size={16} />
                )}
                {copyStatus === "copied" ? "Copied" : "Copy card list"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setTextOpen(false)}
              >
                Close
              </button>
            </div>
            <p
              className={
                copyStatus === "error"
                  ? "deck-list-copy-status error"
                  : "deck-list-copy-status"
              }
              role={copyStatus === "error" ? "alert" : "status"}
              aria-live="polite"
            >
              {copyStatus === "copied" && "Copied to your clipboard."}
              {copyStatus === "error" &&
                "Automatic copy was blocked. The card list is selected so you can copy it manually."}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
