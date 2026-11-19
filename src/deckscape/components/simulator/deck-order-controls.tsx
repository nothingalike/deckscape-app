"use client";
import { useRef, useState } from "react";
import type { EnhancePrompt } from "@/lib/simulator/enhance-contract";
import type { SubmitDecision } from "./decision-controls";
import { CardChoiceTray, TrayCards } from "./card-choice-tray";

export function DeckOrderControls({
  decision,
  onSubmit,
}: {
  decision: EnhancePrompt;
  onSubmit: SubmitDecision;
}) {
  const [order, setOrder] = useState(decision.cards.map((c) => c.id)),
    [selected, setSelected] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const sending = useRef(false);
  const move = (delta: number) => {
    const index = order.indexOf(selected ?? "");
    if (index < 0 || index + delta < 0 || index + delta >= order.length) return;
    const next = [...order];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setOrder(next);
  };
  async function submit() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await onSubmit({
        expectedRevision: decision.revision,
        action: {
          type: "answer-deck-order",
          decisionId: decision.decisionId,
          order,
        },
      });
      if (result.ok) {
        setMessage("Order submitted. Waiting for the updated game.");
        return;
      }
      setMessage(result.message ?? "Unable to reorder the deck.");
    } catch {
      setMessage("Unable to reorder the deck.");
    }
    sending.current = false;
    setBusy(false);
  }
  return (
    <CardChoiceTray title="Enhance — order opponent's top cards">
      <fieldset disabled={busy}>
        <p>
          First card is the top of the cyberdeck. Select a card and move it
          earlier or later.
        </p>
        <TrayCards
          cards={order.map((id) => ({
            ...decision.cards.find((c) => c.id === id)!,
            eligible: true,
          }))}
          selected={selected ? [selected] : []}
          onChoose={setSelected}
          disabled={busy}
        />
        <button
          type="button"
          disabled={!selected || order.indexOf(selected) === 0}
          onClick={() => move(-1)}
        >
          Move earlier
        </button>
        <button
          type="button"
          disabled={!selected || order.indexOf(selected) === order.length - 1}
          onClick={() => move(1)}
        >
          Move later
        </button>
        <button type="button" onClick={() => void submit()}>
          Confirm deck order
        </button>
        {message && <p role="status">{message}</p>}
      </fieldset>
    </CardChoiceTray>
  );
}
