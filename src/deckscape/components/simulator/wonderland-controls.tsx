"use client";
import { useRef, useState } from "react";
import type {
  WonderlandPrompt,
  WonderlandAnswer,
} from "@/lib/simulator/wonderland-contract";
import type { ProgramQuoteTransport } from "@/lib/simulator/http-match-transport";
import type { SubmitDecision } from "./decision-controls";
import { BoardChoice, BoardDecoration } from "./board-interaction";
import { ActionConfirmation } from "./visual-action-controls";
import { CharacterPlayControls } from "./character-play-controls";
import { GearPlayControls } from "./gear-play-controls";
import { ProgramPlayControls } from "./program-play-controls";

export function WonderlandControls({
  decision,
  name,
  onSubmit,
  onQuote,
}: {
  decision: WonderlandPrompt;
  name: (id: string) => string;
  onSubmit: SubmitDecision;
  onQuote?: ProgramQuoteTransport["quoteProgram"];
}) {
  const [selected, setSelected] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const sending = useRef(false);
  async function send(answer: Pick<WonderlandAnswer, "play" | "selected">) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await onSubmit({
        expectedRevision: decision.revision,
        action: {
          type: "answer-wonderland",
          decisionId: decision.decisionId,
          ...answer,
        },
      });
      if (!result.ok)
        setMessage(result.message ?? "Unable to submit Wonderland choice.");
    } catch {
      setMessage("Unable to submit Wonderland choice.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <fieldset disabled={busy}>
      <legend>Wonderland · rolled {decision.roll}</legend>
      <p>
        {decision.remaining
          ? "One more roll after this result."
          : "Final result."}
      </p>
      {decision.stage === "play" ? (
        <>
          <p>
            Play {name(decision.cardId!)} from your cyberdeck. Its RAM cost is
            set to 0; any remaining costs and legal targets still apply.
          </p>
          <CharacterPlayControls
            initialId={decision.cardId}
            options={decision.play?.characters ?? []}
            name={name}
            onPlay={(id, ram, runCharacters) =>
              void send({
                play: {
                  type: "play-character",
                  id,
                  ram,
                  ...(runCharacters ? { runCharacters } : {}),
                },
              })
            }
          />
          <GearPlayControls
            initialId={decision.cardId}
            options={decision.play?.gear ?? []}
            name={name}
            onPlay={(id, ram, targets) =>
              void send({ play: { type: "play-gear", id, ram, targets } })
            }
          />
          <ProgramPlayControls
            initialId={decision.cardId}
            revision={decision.revision}
            options={decision.play?.programs ?? []}
            name={name}
            onQuote={onQuote}
            onPlay={(id, ram, choices) =>
              void send({ play: { type: "play-program", id, ram, choices } })
            }
          />
        </>
      ) : (
        <>
          <BoardDecoration
            selected={selected ? [selected] : []}
            links={
              selected
                ? [
                    {
                      from: decision.sourceId,
                      to: selected,
                      label:
                        decision.stage === "destroy"
                          ? "Destroy target"
                          : "INVERT target",
                      kind: "target",
                    },
                  ]
                : []
            }
          />
          <p>
            {decision.stage === "destroy"
              ? "Choose a character you control to destroy."
              : "Choose a character to toggle INVERT, or continue without choosing one."}
          </p>
          <BoardChoice
            active={!busy}
            label="Wonderland character"
            candidates={decision.candidates}
            selected={selected ? [selected] : []}
            onChoose={(id) => setSelected(id === selected ? null : id)}
          />
          <ActionConfirmation>
            <button
              type="button"
              disabled={busy || (decision.stage === "destroy" && !selected)}
              onClick={() => void send({ selected })}
            >
              {selected
                ? decision.stage === "destroy"
                  ? "Destroy selected character"
                  : "Confirm INVERT"
                : "Continue without INVERT"}
            </button>
          </ActionConfirmation>
        </>
      )}
      {message && <p role="alert">{message}</p>}
    </fieldset>
  );
}
