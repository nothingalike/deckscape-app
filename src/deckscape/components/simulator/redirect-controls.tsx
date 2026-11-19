"use client";
import { useState } from "react";
import { BoardChoice, BoardDecoration } from "./board-interaction";
import type { DecisionPrompt } from "@/lib/simulator/decision-prompt";
import type { GameCommand } from "@/lib/simulator/commands";

export function RedirectControls({
  decision,
  name,
  pending,
  send,
}: {
  decision: Extract<DecisionPrompt, { type: "redirect-ability" }>;
  name: (id: string) => string;
  pending: boolean;
  send: (action: GameCommand["action"]) => Promise<void>;
}) {
  const [key, setKey] = useState(decision.variants[0]?.key ?? "");
  const variant = decision.variants.find((v) => v.key === key);
  const [groups, setGroups] = useState<string[][]>(
    variant?.targets.map(() => []) ?? [],
  );
  const [active, setActive] = useState(0);
  const [player, setPlayer] = useState<0 | 1>();
  if (!variant) return <p>No replacement targets are available.</p>;
  const valid =
    groups.every(
      (g, i) =>
        g.length >= variant.targets[i].minimum &&
        g.length <= variant.targets[i].maximum,
    ) &&
    (!variant.playerTargets ||
      variant.playerTargets.some((p) => p.player === player)) &&
    groups.flat().length +
      Number(!!variant.playerTargets) +
      Number(!!variant.cacheActionId) ===
      decision.targetCount;
  return (
    <>
      <p>
        Redirect {decision.targetAbility}. Choose {decision.targetCount}{" "}
        replacement target(s); paid costs and modes stay the same.
      </p>
      <BoardDecoration
        selected={groups.flat()}
        links={[
          ...groups.flatMap((group, index) =>
            group.map((target) => ({
              from: `cache-action:${decision.targetActionId}`,
              to: target,
              label: variant.targets[index].label,
              kind: "target" as const,
            })),
          ),
          ...(player === undefined
            ? []
            : [
                {
                  from: `cache-action:${decision.targetActionId}`,
                  to: `player:${player}`,
                  label: "Replacement player target",
                  kind: "target" as const,
                },
              ]),
        ]}
      />
      {decision.variants.length > 1 && (
        <div aria-label="Replacement target type">
          {decision.variants.map((v) => (
            <button
              key={v.key}
              type="button"
              aria-pressed={key === v.key}
              onClick={() => {
                setKey(v.key);
                setGroups(v.targets.map(() => []));
                setActive(0);
                setPlayer(undefined);
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          let offset = 0;
          const restored = variant.targets.map((g, i) => {
            const length = Math.max(
              0,
              Math.min(
                g.maximum,
                decision.originalTargets.length -
                  offset -
                  variant.targets
                    .slice(i + 1)
                    .reduce((n, g) => n + g.minimum, 0),
              ),
            );
            const ids = decision.originalTargets.slice(offset, offset + length);
            offset += length;
            return ids;
          });
          setGroups(restored);
          setPlayer(decision.originalPlayer);
        }}
      >
        Start with original targets
      </button>
      {variant.targets.map((g, index) => (
        <div key={`${key}:${index}`}>
          <button
            type="button"
            aria-pressed={active === index}
            onClick={() => setActive(index)}
          >
            {g.label}
          </button>
          <BoardChoice
            label={g.label}
            active={active === index}
            disabled={pending}
            candidates={
              g.candidatesByFirstTarget
                ? (g.candidatesByFirstTarget[groups[0]?.[0]] ?? [])
                : g.candidates
            }
            selected={groups[index]}
            required={g.maximum}
            onChoose={(id) => {
              const next = groups.map((x) => [...x]);
              next[index] =
                g.maximum === 1
                  ? [id]
                  : next[index].includes(id)
                    ? next[index].filter((x) => x !== id)
                    : next[index].length < g.maximum
                      ? [...next[index], id]
                      : next[index];
              if (index === 0)
                for (let j = 1; j < next.length; j++)
                  if (variant.targets[j].candidatesByFirstTarget) next[j] = [];
              setGroups(next);
              if (next[index].length === g.maximum && index + 1 < groups.length)
                setActive(index + 1);
            }}
          />
          <p>{groups[index].map(name).join(", ") || "Choose on the board."}</p>
        </div>
      ))}
      {variant.playerTargets?.map((p) => (
        <button
          key={p.player}
          type="button"
          aria-pressed={player === p.player}
          onClick={() => setPlayer(p.player)}
        >
          {p.label}
        </button>
      ))}
      <button
        type="button"
        disabled={pending || !valid}
        onClick={() =>
          void send({
            type: "answer-redirect-ability",
            decisionId: decision.decisionId,
            selection: {
              variant: key,
              groups,
              ...(player === undefined ? {} : { playerTarget: player }),
            },
          })
        }
      >
        Confirm new targets
      </button>
    </>
  );
}
