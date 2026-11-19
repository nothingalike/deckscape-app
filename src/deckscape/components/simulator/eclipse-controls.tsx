"use client";
import { useRef, useState } from "react";
import type { EclipsePrompt } from "@/lib/simulator/eclipse-contract";
import type { SubmitDecision } from "./decision-controls";
import { CardChoiceTray, TrayCards } from "./card-choice-tray";

export function EclipseControls({
  decision,
  onSubmit,
}: {
  decision: EclipsePrompt;
  onSubmit: SubmitDecision;
}) {
  const [selected, setSelected] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const sending = useRef(false);
  async function submit() {
    if (!selected || sending.current) return;
    sending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await onSubmit({
        expectedRevision: decision.revision,
        action: {
          type: "answer-eclipse-entry",
          decisionId: decision.decisionId,
          selected,
        },
      });
      if (result.ok) {
        setMessage("Character selected. Waiting for the updated game.");
        return;
      }
      setMessage(result.message ?? "Could not deploy this character.");
    } catch {
      setMessage("Could not deploy this character.");
    }
    sending.current = false;
    setBusy(false);
  }
  return (
    <CardChoiceTray title="Eclipse Dropship — deploy a character">
      <fieldset disabled={busy}>
        <p>
          Choose a Dustrunner to enter with a RAM cost of 0. It returns to its
          owner's hand at turn end.
        </p>
        <TrayCards
          cards={decision.cards.map((c) => ({ ...c, eligible: true }))}
          selected={selected ? [selected] : []}
          onChoose={setSelected}
          disabled={busy}
        />
        <button
          type="button"
          disabled={!selected}
          onClick={() => void submit()}
        >
          Deploy selected character
        </button>
        {message && <p role="status">{message}</p>}
      </fieldset>
    </CardChoiceTray>
  );
}
