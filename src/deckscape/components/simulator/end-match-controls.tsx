"use client";

import { useRef, useState } from "react";
import type { SubmitDecision } from "./decision-controls";

export function EndMatchControls({
  revision,
  disabled,
  onSubmit,
}: {
  revision: number;
  disabled: boolean;
  onSubmit: SubmitDecision;
}) {
  const [choice, setChoice] = useState<"concede" | "abandon" | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const sending = useRef(false);
  async function confirm() {
    if (!choice || sending.current || disabled) return;
    sending.current = true;
    setPending(true);
    try {
      const result = await onSubmit({
        expectedRevision: revision,
        action: { type: choice },
      });
      setMessage(
        result.ok
          ? "Updating the game…"
          : (result.message ??
              "The game could not be ended. Refresh and try again."),
      );
      if (result.ok) return;
    } catch {
      setMessage(
        "The result is uncertain. Reconnect to confirm the game’s status.",
      );
      return;
    }
    sending.current = false;
    setPending(false);
  }
  return (
    <section aria-label="End this game">
      <fieldset disabled={disabled || pending}>
        <legend>End this game</legend>
        {choice ? (
          <>
            <p>
              {choice === "concede"
                ? "Conceding awards the win to your opponent."
                : "Abandoning ends this game without a winner. It cannot be resumed."}
            </p>
            <button type="button" onClick={() => void confirm()}>
              {choice === "concede"
                ? "Confirm concession"
                : "Confirm abandonment"}
            </button>
            <button
              type="button"
              onClick={() => {
                setChoice(null);
                setMessage("");
              }}
            >
              Keep playing
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setChoice("concede")}>
              Concede
            </button>
            <button type="button" onClick={() => setChoice("abandon")}>
              Abandon without a winner
            </button>
          </>
        )}
      </fieldset>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
