"use client";
import { useState, useRef } from "react";
import { X } from "lucide-react";
import { useDialog } from "@/lib/use-dialog";
import { MAX_BACKUP_BYTES } from "@/lib/import-backup";
import {
  parseDeckText,
  MAX_DECK_TEXT,
  type ImportCard,
} from "@/lib/import-deck-text";
import { sections, sectionLabels } from "@/lib/types";
export function ImportDeck({ cards = [] }: { cards?: ImportCard[] }) {
  const [unresolvedIds, setUnresolvedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"backup" | "text">("backup"),
    [text, setText] = useState(""),
    [name, setName] = useState("Imported deck"),
    [addRam, setAddRam] = useState(true);
  const [preview, setPreview] = useState<ReturnType<
    typeof parseDeckText
  > | null>(null);
  const locked = useRef(false);
  const close = () => {
    if (!locked.current) setOpen(false);
  };
  const dialogRef = useDialog(open, close);
  return (
    <div className="import-deck">
      <button
        className="secondary"
        type="button"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        Import Deck
      </button>
      {open && (
        <div className="modal-backdrop" onClick={close}>
          <div
            className="import-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Import Deck"
            ref={dialogRef}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
            }}
          >
            <button
              type="button"
              className="icon-button dialog-close"
              aria-label="Close import"
              onClick={close}
              aria-disabled={busy}
            >
              <X />
            </button>
            <h2>Import Deck</h2>
            <div
              role="group"
              aria-label="Import format"
              style={{ display: "flex", gap: 8, marginTop: 16 }}
            >
              {(["backup", "text"] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  className="secondary"
                  aria-pressed={mode === format}
                  style={
                    mode === format
                      ? { borderColor: "var(--accent)", color: "var(--accent)" }
                      : undefined
                  }
                  disabled={busy}
                  onClick={() => {
                    setMode(format);
                    setPreview(null);
                    setUnresolvedIds([]);
                    setError("");
                  }}
                >
                  {format === "backup" ? "JSON backup" : "Paste deck list"}
                </button>
              ))}
            </div>
            <form
              key={mode}
              className="account-panel"
              onSubmit={async (event) => {
                event.preventDefault();
                if (locked.current) return;
                setError("");
                const file = new FormData(event.currentTarget).get("backup");
                if (
                  mode === "backup" &&
                  (!(file instanceof File) || !file.size)
                ) {
                  setError("Choose a Deckscape draft backup first.");
                  return;
                }
                locked.current = true;
                setBusy(true);
                let navigating = false;
                try {
                  let sourceText: string;
                  let addedBasicRam = false;
                  if (mode === "text") {
                    const parsed = parseDeckText(text, cards, addRam);
                    addedBasicRam = parsed.addedBasicRam;
                    sourceText = JSON.stringify({format: "deckscape-backup", version: 1, deck: {
                      name: name.trim() || "Imported deck", description: "", entries: parsed.entries,
                    }});
                  } else {
                    if ((file as File).size > MAX_BACKUP_BYTES) throw new Error("Backup files must be 1 MB or smaller.");
                    sourceText = await (file as File).text();
                  }
                  const input = { format: "json" as const, text: sourceText };
                  const reviewed = await window.neuroscape.previewDeckImport(input);
                  if (!reviewed.ok) throw new Error(reviewed.error.message);
                  if (!preview) {
                    setPreview({ entries: reviewed.data.content.entries, issues: reviewed.data.issues, addedBasicRam });
                    setUnresolvedIds(reviewed.data.unresolvedCardIds);
                    return;
                  }
                  const result = await window.neuroscape.importDeck(input);
                  if (!result.ok) throw new Error(result.error.message);
                  location.hash = "/decks/" + result.data.id;
                  navigating = true;
                } catch (error) {
                  setError(
                    error instanceof Error
                      ? error.message
                      : "Could not import this deck. Please retry.",
                  );
                } finally {
                  if (!navigating) {
                    locked.current = false;
                    setBusy(false);
                  }
                }
              }}
            >
              {mode === "backup" ? (
                <>
                  <p>
                    Restore a downloaded Deckscape JSON backup as a new{" "}
                    local draft. Existing
                    decks stay unchanged.
                     Local drafts are stored on this computer.
                  </p>
                  <label>
                    Deck backup file
                    <input
                      type="file"
                      name="backup"
                      onChange={() => { setPreview(null); setUnresolvedIds([]); setError(""); }}
                      accept=".json,application/json"
                      required
                      disabled={busy}
                    />
                  </label>
                </>
              ) : (
                <>
                  <p>
                    Paste an exported list with Mainframe, Cyberdeck and
                    Sideboard headings. Import creates a new{" "}
                    local draft.
                  </p>
                  <label>
                    Deck name
                    <input
                      value={name}
                      maxLength={120}
                      required
                      disabled={busy}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label>
                    Deck list
                    <textarea
                      value={text}
                      rows={10}
                      maxLength={MAX_DECK_TEXT}
                      required
                      disabled={busy}
                      onChange={(e) => {
                        setText(e.target.value);
                        setPreview(null);
                        setError("");
                      }}
                      placeholder={
                        "# Mainframe\nOMNIS BLOOD DIAMOND\n\n# Cyberdeck\n4 B.O.B."
                      }
                    />
                  </label>
                  <label
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={addRam}
                      disabled={busy}
                      onChange={(e) => {
                        setAddRam(e.target.checked);
                        setPreview(null);
                      }}
                      style={{ width: "auto" }}
                    />
                    Add 25 Basic RAM if no RAM section is included
                  </label>

                </>
              )}
                  {preview && (
                    <section aria-label="Import preview">
                      <h3>Import preview</h3>
                      <ul>
                        {sections.map((section) => (
                          <li key={section}>
                            {sectionLabels[section]}:{" "}
                            {preview.entries
                              .filter((e) => e.section === section)
                              .reduce((sum, e) => sum + e.quantity, 0)}
                          </li>
                        ))}
                      </ul>
                      {unresolvedIds.length > 0 && <p>Unknown card IDs retained for repair: {unresolvedIds.join(", ")}</p>}
                      {preview.addedBasicRam && (
                        <p>25 Basic RAM will be added to the RAM deck.</p>
                      )}
                      {preview.issues.length > 0 && (
                        <>
                          <p>
                            This can be saved as a draft, but these issues need
                            fixing before playing:
                          </p>
                          <ul>
                            {preview.issues.map((issue, i) => (
                              <li key={i}>{issue.message}</li>
                            ))}
                          </ul>
                        </>
                      )}
                    </section>
                  )}
              {error && (
                <p role="alert" style={{ whiteSpace: "pre-line" }}>
                  {error}
                </p>
              )}
              <button disabled={busy}>
                {busy
                  ? "Importing…"
                  : !preview
                    ? mode === "text" ? "Review deck list" : "Review backup"
                    : "Import as new draft"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
