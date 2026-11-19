import { Minus, Plus } from "lucide-react";
import { getDeckCardAction } from "@/lib/deck-card-strategy";
import { sectionLabels, type Card, type Entry } from "@/lib/types";

export function CardQuantityControls({
  card,
  entries,
  onAdd,
  onRemove,
}: {
  card: Card;
  entries: Entry[];
  onAdd: (card: Card) => void;
  onRemove: (card: Card) => void;
}) {
  const action = getDeckCardAction(card, entries);
  if (!action) return null;
  const { section, quantity, canAdd } = action;
  return (
    <div
      className="quantity card-quantity-controls"
      role="group"
      aria-label={`${card.name} in ${sectionLabels[section]}`}
    >
      <button
        aria-label={`Remove ${card.name}`}
        disabled={quantity === 0}
        onClick={() => onRemove(card)}
      >
        <Minus size={12} />
      </button>
      <span
        aria-live="polite"
        aria-label={`Copies in ${sectionLabels[section]}`}
      >
        {quantity}
      </span>
      <button
        className="add-card"
        aria-label={`Add ${card.name}`}
        disabled={!canAdd}
        onClick={() => onAdd(card)}
      >
        <Plus size={12} />
      </button>
    </div>
  );
}
