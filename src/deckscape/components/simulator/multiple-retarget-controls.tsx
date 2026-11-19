"use client";
import { useState } from "react";
import { BoardChoice, BoardDecoration } from "./board-interaction";
import type { DecisionPrompt } from "@/lib/simulator/decision-prompt";
import type { GameCommand } from "@/lib/simulator/commands";

export function MultipleRetargetControls({
  decision,
  name,
  pending,
  send,
}: {
  decision: Extract<DecisionPrompt, { type: "retarget-program" }>;
  name: (id: string) => string;
  pending: boolean;
  send: (action: GameCommand["action"]) => Promise<void>;
}) {
  const [targets, setTargets] = useState(decision.originalTargets ?? []);
  const [slot, setSlot] = useState(0);
  const selected = decision.options.find((o) =>
    o.targetIds?.every((id, i) => id === targets[i]),
  );
  return (
    <>
      <BoardDecoration
        selected={targets}
        links={targets.map((target, index) => ({
          from: `cache-action:${decision.targetActionId}`,
          to: target,
          label: `Program target ${index + 1}`,
          kind: "target" as const,
        }))}
      />
      <p>
        Choose a target slot, then select its replacement on the board.
        Unchanged targets are kept.
      </p>
      {targets.map((id, i) => (
        <button
          key={i}
          type="button"
          disabled={pending}
          aria-pressed={slot === i}
          onClick={() => setSlot(i)}
        >
          Target {i + 1}: {name(id)}
        </button>
      ))}
      <BoardChoice
        active
        label={`Program target ${slot + 1}`}
        required={targets.length}
        disabled={pending}
        candidates={[
          ...new Set(
            decision.options.flatMap((o) =>
              o.targetIds?.[slot] ? [o.targetIds[slot]] : [],
            ),
          ),
        ]}
        selected={targets}
        onChoose={(id) =>
          setTargets((current) =>
            current.map((old, i) => (i === slot ? id : old)),
          )
        }
      />
      <p>
        {selected?.label ??
          "Change at least one target to a legal replacement."}
      </p>
      <button
        type="button"
        disabled={pending || !selected}
        onClick={() =>
          selected &&
          void send({
            type: "answer-retarget-program",
            decisionId: decision.decisionId,
            index: selected.index,
          })
        }
      >
        Confirm new targets
      </button>
    </>
  );
}
