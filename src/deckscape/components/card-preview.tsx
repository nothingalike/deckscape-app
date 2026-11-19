"use client";
import { CardDetailsLink } from "./card-details-link";
import { Plus, X } from "lucide-react";
import { ExpandableCardArt } from "./expandable-card-art";
import { CardRules } from "./rules-reference";
import { useDialog } from "@/lib/use-dialog";
import { addDestination } from "@/lib/deck-layout";
import { getDeckCardAction } from "@/lib/deck-card-strategy";
import type { Card, Entry } from "@/lib/types";
import { CardQuantityControls } from "./card-quantity-controls";
import { CardSourceStatus } from '../../desktop/card-source-status';
import { CardSoloSupport } from '../../desktop/solo-support';
export function CardPreview({
  card: preview,
  onClose,
  onAdd,
  onAddSideboard,
  entries,
  onRemove,
}: {
  card: Card;
  onClose: () => void;
  onAdd?: (card: Card) => void;
  onAddSideboard?: (card: Card) => void;
  entries?: Entry[];
  onRemove?: (card: Card) => void;
}) {
  const dialogRef = useDialog(true, onClose);
  return (
    <div className="modal-backdrop" onClick={() => onClose()}>
      <div
        role="dialog"
        ref={dialogRef}
        aria-modal="true"
        aria-label={preview.name}
        className="card-dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <button
          className="icon-button dialog-close"
          aria-label="Close card preview"
          onClick={() => onClose()}
        >
          <X />
        </button>
        <ExpandableCardArt card={preview} />
        <div>
          <span className="eyebrow">
            {preview.set_name} / {preview.collector_number}
          </span>
          <h2>{preview.name}</h2>
          <CardSourceStatus card={preview} />
          <CardSoloSupport card={preview} />
          <p className="accent">
            {preview.factions.join(" · ") || "Factionless"}
          </p>
          <p>
            {preview.card_type} {preview.subtype && `/ ${preview.subtype}`}
          </p>
          <div className="card-stats">
            <span>
              RAM <b>{preview.ram_cost.join(" + ") || "—"}</b>
            </span>
            <span>
              ATK <b>{preview.attack ?? "—"}</b>
            </span>
            <span>
              DEF <b>{preview.defence ?? "—"}</b>
            </span>
          </div>
          <p className="rules-text">
            {preview.rules_text ||
              "Refer to the card image for its printed rules."}
          </p>
          <p className="muted flavor">{preview.flavor_text}</p>
          <CardRules card={preview} />
          <small>
            {preview.rarity} · Art by {preview.artist || "uncredited"}
          </small>
          <CardDetailsLink
            className="button secondary wide"
            cardId={preview.id}
          >
            View card details
          </CardDetailsLink>
          {onAdd && entries && onRemove && addDestination(preview) ? (
            <div className="preview-deck-action">
              <strong>Add to Deck</strong>
              <CardQuantityControls
                card={preview}
                entries={entries}
                onRemove={onRemove}
                onAdd={(card) => {
                  onAdd(card);
                  // Let the existing replacement dialog own focus when needed.
                  if (getDeckCardAction(card, entries)?.requiresReplacement)
                    onClose();
                }}
              />
            </div>
          ) : (
            onAdd && (
              <button
                className="wide"
                disabled={!addDestination(preview)}
                onClick={() => {
                  onAdd(preview);
                  onClose();
                }}
              >
                <Plus size={16} />
                Add to deck
              </button>
            )
          )}
          {onAddSideboard && addDestination(preview, true) && (
            <button
              className="secondary wide"
              onClick={() => {
                onAddSideboard(preview);
                onClose();
              }}
            >
              Add to Sideboard
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
