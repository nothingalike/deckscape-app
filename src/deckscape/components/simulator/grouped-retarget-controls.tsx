"use client";
import { useState } from "react";
import { CardChoiceTray, TrayCards } from "./card-choice-tray";
import { FormFallback } from "./visual-action-controls";
import { BoardDecoration } from "./board-interaction";
import type { DecisionPrompt } from "@/lib/simulator/decision-prompt";
import type { GameCommand } from "@/lib/simulator/commands";

export function GroupedRetargetControls({
  decision,
  pending,
  send,
}: {
  decision: Extract<DecisionPrompt, { type: "retarget-program" }>;
  pending: boolean;
  send: (action: GameCommand["action"]) => Promise<unknown>;
}) {
  const slots = decision.objectSlots!;
  const [active, setActive] = useState(0);
  const [indices, setIndices] = useState(() => slots.map(() => 0));
  const select = (index: number) =>
    setIndices((current) =>
      current.map((value, i) => (i === active ? index : value)),
    );
  const slot = slots[active];
  const selectedTargets = slots.flatMap((entry, index) => {
    const selected = entry.options.find(
      (option) => option.index === indices[index],
    );
    return selected?.targetId ? [selected.targetId] : [];
  });
  return (
    <CardChoiceTray title="Change program targets">
      <BoardDecoration
        selected={selectedTargets}
        links={selectedTargets.map((target, index) => ({
          from: `cache-action:${decision.targetActionId}`,
          to: target,
          label: `Program target ${index + 1}`,
          kind: "target" as const,
        }))}
      />
      <p>
        Choose each target to change, then confirm the complete selection.
        Unchanged slots keep their original target.
      </p>
      <div>
        {slots.map((s, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={active === i}
            disabled={pending}
            onClick={() => setActive(i)}
          >
            Target {i + 1}:{" "}
            {s.options.find((o) => o.index === indices[i])?.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={pending}
        aria-pressed={indices[active] === 0}
        onClick={() => select(0)}
      >
        Keep original target
      </button>
      <TrayCards
        cards={slot.options.flatMap((o) =>
          o.card ? [{ ...o.card, id: String(o.index), eligible: true }] : [],
        )}
        selected={[String(indices[active])]}
        disabled={pending}
        onChoose={(id) => select(Number(id))}
      />
      <FormFallback>
        {slot.options
          .filter((o) => o.index !== 0)
          .map((o) => (
            <button
              key={o.index}
              type="button"
              disabled={pending}
              aria-pressed={indices[active] === o.index}
              onClick={() => select(o.index)}
            >
              {o.label}
            </button>
          ))}
      </FormFallback>
      <button
        type="button"
        disabled={pending || !indices.some((i) => i !== 0)}
        onClick={() =>
          void send({
            type: "answer-retarget-program-slots",
            decisionId: decision.decisionId,
            indices,
          })
        }
      >
        Confirm new targets
      </button>
    </CardChoiceTray>
  );
}
