"use client";
import { useRef, useState } from "react";
import type { DuckyPrompt } from "@/lib/simulator/ducky-contract";
import type { ProgramChoices } from "@/lib/simulator/program-choices";
import type { ProgramQuoteTransport } from "@/lib/simulator/http-match-transport";
import type { SubmitDecision } from "./decision-controls";
import { InlineConfirmation } from "./visual-action-controls";
import { CardChoiceTray } from "./card-choice-tray";
import { ProgramPlayControls } from "./program-play-controls";
export function DuckyControls({
  decision,
  name,
  onSubmit,
  onQuote,
}: {
  decision: DuckyPrompt;
  name: (id: string) => string;
  onSubmit: SubmitDecision;
  onQuote?: ProgramQuoteTransport["quoteProgram"];
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const sending = useRef(false);
  async function send(choices?: ProgramChoices) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      const r = await onSubmit({
        expectedRevision: decision.revision,
        action: {
          type: "answer-ducky",
          decisionId: decision.decisionId,
          ...(choices ? { choices } : { skip: true }),
        },
      });
      if (r.ok) {
        setMessage("Choice submitted. Waiting for the updated game.");
        return;
      }
      setMessage(r.message ?? "Could not play this copy.");
    } catch {
      setMessage("Could not play this copy.");
    }
    sending.current = false;
    setBusy(false);
  }
  return (
    <CardChoiceTray title="Rubber Ducky — play your copy">
      <fieldset disabled={busy}>
        <p>
          Play {name(decision.cardId)} with fresh choices. No RAM payment;
          additional costs still apply. X must be 0.
        </p>
        {decision.canPlay ? (
          <InlineConfirmation>
            <ProgramPlayControls
              initialId={decision.cardId}
              revision={decision.revision}
              options={decision.options}
              name={name}
              onQuote={onQuote}
              onPlay={(_id, _ram, choices) => void send(choices)}
            />
          </InlineConfirmation>
        ) : (
          <>
            <p>No legal play is available for this copy.</p>
            <button type="button" onClick={() => void send()}>
              Continue without playing
            </button>
          </>
        )}
        {message && <p role="status">{message}</p>}
      </fieldset>
    </CardChoiceTray>
  );
}
