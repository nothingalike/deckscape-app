"use client";
import { useRef, useState } from "react";
import type { TowerPrompt } from "@/lib/simulator/tower-contract";
import type { SubmitDecision } from "./decision-controls";
import { CardChoiceTray, TrayCards } from "./card-choice-tray";
export function TowerControls({
  decision,
  onSubmit,
}: {
  decision: TowerPrompt;
  onSubmit: SubmitDecision;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [pile, setPile] = useState<0 | 1 | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const sending = useRef(false);
  const ready =
    decision.stage === "choose"
      ? pile !== null
      : selected.length > 0 && selected.length < decision.cards.length;
  async function submit() {
    if (!ready || sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      const result = await onSubmit({
        expectedRevision: decision.revision,
        action: {
          type: "answer-tower",
          decisionId: decision.decisionId,
          ...(decision.stage === "partition"
            ? { firstPile: selected }
            : { pile: pile! }),
        },
      });
      if (result.ok) {
        setMessage("Choice submitted. Waiting for the updated game.");
        return;
      }
      setMessage(result.message ?? "Could not submit choice.");
    } catch {
      setMessage("Could not submit choice.");
    }
    sending.current = false;
    setBusy(false);
  }
  return (
    <CardChoiceTray title="The Tower">
      <fieldset disabled={busy}>
        {decision.stage === "partition" ? (
          <>
            <p>
              Select the cards for pile 1. The other cards become pile 2. Both
              piles must contain a card.
            </p>
            <TrayCards
              cards={decision.cards.map((c) => ({ ...c, eligible: true }))}
              selected={selected}
              disabled={busy}
              onChoose={(id) =>
                setSelected((old) =>
                  old.includes(id) ? old.filter((x) => x !== id) : [...old, id],
                )
              }
            />
            <p>
              Pile 1: {selected.length} · Pile 2:{" "}
              {decision.cards.length - selected.length}
            </p>
          </>
        ) : (
          <>
            <p>
              Choose a face-down pile to put into your hand. The other pile will
              be binned.
            </p>
            {([0, 1] as const).map((i) => (
              <button
                key={i}
                type="button"
                aria-pressed={pile === i}
                onClick={() => setPile(i)}
              >
                Pile {i + 1} — {decision.counts[i]} cards
              </button>
            ))}
          </>
        )}
        <button type="button" disabled={!ready} onClick={() => void submit()}>
          Confirm {decision.stage === "partition" ? "piles" : "pile"}
        </button>
        {message && <p role="status">{message}</p>}
      </fieldset>
    </CardChoiceTray>
  );
}
