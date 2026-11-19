"use client";
import { AmountChoice } from "./compact-choices";

import { useRef, useState } from "react";
import type { TurnPrompt } from "@/lib/simulator/turn-prompt";
import type { GameCommand } from "@/lib/simulator/commands";
import type { SubmitDecision } from "./decision-controls";
import { CharacterPlayControls } from "./character-play-controls";
import { GearPlayControls } from "./gear-play-controls";
import { ProgramPlayControls } from "./program-play-controls";
import { ActivationControls } from "./activation-controls";
import { FormFallback, ActionConfirmation } from "./visual-action-controls";
import { BoardChoice, BoardDecoration } from "./board-interaction";
import type {
  ProgramQuoteTransport,
  ActivationQuoteTransport,
} from "@/lib/simulator/http-match-transport";
import type { ProgramQuote } from "@/lib/simulator/program-quote-contract";

export function TurnControls(props: {
  onCancel?: () => void;
  focusedCard?: string | null;
  initialAbilityId?: string;
  onActivationQuote?: ActivationQuoteTransport["quoteActivation"];
  onQuote?: ProgramQuoteTransport["quoteProgram"];
  onProgramQuoteChange?: (id: string, quote: ProgramQuote | null) => void;
  passLabel?: "Pass priority" | "Proceed to combat";
  passDisabled?: boolean;
  prompt: TurnPrompt;
  name: (id: string) => string;
  onSubmit: SubmitDecision;
}) {
  return (
    <TurnForm
      key={`${props.prompt.revision}:${props.prompt.type}`}
      {...props}
    />
  );
}

function TurnForm({
  onActivationQuote,
  onQuote,
  onProgramQuoteChange,
  passLabel = "Pass priority",
  passDisabled = false,
  prompt,
  name,
  onSubmit,
  focusedCard,
  initialAbilityId,
  onCancel,
}: {
  onCancel?: () => void;
  focusedCard?: string | null;
  initialAbilityId?: string;
  onActivationQuote?: ActivationQuoteTransport["quoteActivation"];
  onQuote?: ProgramQuoteTransport["quoteProgram"];
  onProgramQuoteChange?: (id: string, quote: ProgramQuote | null) => void;
  passLabel?: "Pass priority" | "Proceed to combat";
  passDisabled?: boolean;
  prompt: TurnPrompt;
  name: (id: string) => string;
  onSubmit: SubmitDecision;
}) {
  const [showAll, setShowAll] = useState(false);
  const matches = (id: string) =>
    focusedCard === undefined || showAll || id === focusedCard;
  const [selected, setSelected] = useState<string[]>(() =>
    prompt.type === "attack" ? [...new Set(prompt.required ?? [])] : [],
  );
  const requiredAttackers =
    prompt.type === "attack" ? [...new Set(prompt.required ?? [])] : [];
  const allAttackers =
    prompt.type === "attack"
      ? [...new Set([...prompt.candidates, ...requiredAttackers])]
      : [];
  const [triggerOrder, setTriggerOrder] = useState<number[]>(() =>
    prompt.type === "order-triggers"
      ? prompt.triggers.map((trigger) => trigger.index).reverse()
      : [],
  );
  const moveTrigger = (position: number, direction: -1 | 1) =>
    setTriggerOrder((order) => {
      const target = position + direction;
      if (target < 0 || target >= order.length) return order;
      const next = [...order];
      [next[position], next[target]] = [next[target], next[position]];
      return next;
    });
  const [blocker, setBlocker] = useState("");
  const [blocking, setBlocking] = useState<Record<string, string>>({});
  const [damage, setDamage] = useState<Record<string, Record<string, string>>>(
    {},
  );
  const damageSplits =
    prompt.type === "assign-damage"
      ? prompt.splits.map((split) => ({
          attackerId: split.attackerId,
          assignments: split.blockers.map((blockerId) => ({
            blockerId,
            amount:
              damage[split.attackerId]?.[blockerId] === ""
                ? NaN
                : Number(damage[split.attackerId]?.[blockerId] ?? "0"),
          })),
        }))
      : [];
  const validDamage =
    prompt.type === "assign-damage" &&
    damageSplits.every(
      (split, index) =>
        split.assignments.every(
          ({ amount }) => Number.isSafeInteger(amount) && amount >= 0,
        ) &&
        split.assignments.reduce((sum, entry) => sum + entry.amount, 0) ===
          prompt.splits[index].total,
    );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const sending = useRef(false);
  async function send(action: GameCommand["action"]) {
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    setMessage("");
    try {
      const result = await onSubmit({
        expectedRevision: prompt.revision,
        action,
      });
      setMessage(
        result.ok
          ? "Action submitted. Waiting for the updated game."
          : (result.message ??
              "That action is no longer available. Refresh the game and try again."),
      );
      if (result.ok) return;
    } catch {
      setMessage(
        "The result could not be confirmed. Refresh the game before trying again.",
      );
      return;
    }
    sending.current = false;
    setPending(false);
  }
  return (
    <section
      aria-label="Your turn actions"
      data-turn-stage={prompt.type}
      data-card-action={
        (prompt.type === "pass" && !!focusedCard && !showAll) || undefined
      }
    >
      <fieldset disabled={pending}>
        {!(prompt.type === "pass" && focusedCard && !showAll) && (
          <legend>
            {
              {
                pass: "You have priority",
                "order-triggers": "Order triggered abilities",
                "draw-install": "Draw or install RAM",
                "force-quit": "Force quit",
                attack: "Choose attackers",
                block: "Assign blockers",
                "assign-damage": "Assign combat damage",
              }[prompt.type]
            }
          </legend>
        )}
        {prompt.type === "pass" && (
          <>
            {(!focusedCard || showAll) && (
              <p>You may respond before passing priority.</p>
            )}
            {focusedCard !== undefined && (
              <>
                <p>
                  {focusedCard
                    ? name(focusedCard)
                    : "Select a card on the table to play it or use an ability."}
                </p>
                {focusedCard && onCancel && (
                  <ActionConfirmation>
                    <button
                      type="button"
                      data-cancel-card-action
                      onClick={() => {
                        setShowAll(false);
                        onCancel();
                      }}
                    >
                      Cancel action
                    </button>
                  </ActionConfirmation>
                )}
                <FormFallback>
                  {/* SIM_FORM_FALLBACK: browse actions through cards during visual testing. */}
                  <button
                    type="button"
                    onClick={() => setShowAll((value) => !value)}
                  >
                    {showAll ? "Focus selected card" : "All available actions"}
                  </button>
                </FormFallback>
              </>
            )}
            <CharacterPlayControls
              key={`character:${focusedCard}:${showAll}`}
              initialId={showAll ? undefined : (focusedCard ?? undefined)}
              options={(prompt.characters ?? []).filter((option) =>
                matches(option.id),
              )}
              name={name}
              onPlay={(id, ram, runCharacters, freePlay) =>
                void send({
                  type: "play-character",
                  ...(freePlay ? { freePlay } : {}),
                  id,
                  ram,
                  ...(runCharacters ? { runCharacters } : {}),
                })
              }
            />
            <GearPlayControls
              key={`gear:${focusedCard}:${showAll}`}
              initialId={showAll ? undefined : (focusedCard ?? undefined)}
              options={(prompt.gear ?? []).filter((option) =>
                matches(option.id),
              )}
              name={name}
              onPlay={(id, ram, targets, freePlay) =>
                void send({
                  type: "play-gear",
                  id,
                  ram,
                  targets,
                  ...(freePlay ? { freePlay } : {}),
                })
              }
            />
            <ProgramPlayControls
              key={`program:${focusedCard}:${showAll}`}
              initialId={showAll ? undefined : (focusedCard ?? undefined)}
              options={(prompt.programs ?? []).filter((option) =>
                matches(option.id),
              )}
              revision={prompt.revision}
              name={name}
              onQuote={onQuote}
              onQuoteChange={onProgramQuoteChange}
              onPlay={(id, ram, choices, freePlay) =>
                void send({
                  type: "play-program",
                  id,
                  ram,
                  choices,
                  ...(freePlay ? { freePlay } : {}),
                })
              }
            />
            <ActivationControls
              key={`activation:${focusedCard}:${initialAbilityId}:${showAll}`}
              initialId={showAll ? undefined : (focusedCard ?? undefined)}
              initialAbilityId={showAll ? undefined : initialAbilityId}
              options={(prompt.activations ?? []).filter((option) =>
                matches(option.id),
              )}
              revision={prompt.revision}
              name={name}
              onQuote={onActivationQuote}
              onActivate={(id, abilityId, ram, choices) =>
                void send({ type: "activate", id, abilityId, ram, choices })
              }
            />
            {(!focusedCard || showAll) && (
              <button
                type="button"
                disabled={passDisabled}
                title={
                  passDisabled
                    ? "Clear the selected character before proceeding to combat."
                    : undefined
                }
                onClick={() => void send({ type: "pass" })}
              >
                {passLabel}
              </button>
            )}
          </>
        )}
        {prompt.type === "order-triggers" && (
          <>
            <p>Choose the resolution order, top to bottom.</p>
            <ol data-trigger-order>
              {triggerOrder.map((index, position) => {
                const trigger = prompt.triggers[index];
                return (
                  <li key={index}>
                    <p>
                      {trigger.label} (
                      {trigger.yours ? "your ability" : "opponent's ability"})
                      {trigger.sourceId &&
                      name(trigger.sourceId) !== trigger.label
                        ? ` — ${name(trigger.sourceId)}`
                        : ""}
                    </p>
                    <div data-reorder-controls>
                      <button
                        type="button"
                        aria-label={`Move ability ${index + 1} earlier`}
                        title="Move earlier"
                        disabled={position === 0}
                        onClick={() => moveTrigger(position, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ability ${index + 1} later`}
                        title="Move later"
                        disabled={position === triggerOrder.length - 1}
                        onClick={() => moveTrigger(position, 1)}
                      >
                        ↓
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
            <ActionConfirmation disabled={pending}>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  void send({
                    type: "order-triggers",
                    order: [...triggerOrder].reverse(),
                  })
                }
              >
                Confirm ability order
              </button>
            </ActionConfirmation>
          </>
        )}
        {prompt.type === "draw-install" && (
          <>
            <p>
              {prompt.remaining} {prompt.remaining === 1 ? "choice" : "choices"}{" "}
              remaining. Choose one action at a time.
            </p>
            <button
              type="button"
              disabled={!prompt.canDraw}
              onClick={() =>
                void send({ type: "draw-install", choice: "draw" })
              }
            >
              Draw 1 card
            </button>
            <button
              type="button"
              disabled={!prompt.canInstall}
              onClick={() =>
                void send({ type: "draw-install", choice: "install" })
              }
            >
              Install 1 RAM
            </button>
            {!prompt.canDraw && (
              <p>Drawing is prohibited by a current effect.</p>
            )}
            {!prompt.canInstall && (
              <p>Installing RAM is prohibited by a current effect.</p>
            )}
          </>
        )}
        {prompt.type === "force-quit" && (
          <>
            <div data-force-quit-help>
            <BoardChoice
              label="Force quit"
              active
              candidates={prompt.candidates}
              selected={selected}
              disabled={pending}
              onChoose={(id) =>
                setSelected((values) =>
                  values.includes(id)
                    ? values.filter((value) => value !== id)
                    : [...values, id],
                )
              }
            />
            </div>
            {/* SIM_FORM_FALLBACK: retain Force Quit checkboxes only for the explicit legacy preview. */}
            <FormFallback>
              {prompt.candidates.map((id, index) => (
                <label key={id} style={{ display: "block" }}>
                  <input
                    type="checkbox"
                    checked={selected.includes(id)}
                    onChange={() =>
                      setSelected((values) =>
                        values.includes(id)
                          ? values.filter((value) => value !== id)
                          : [...values, id],
                      )
                    }
                  />{" "}
                  {index + 1}. {name(id)}
                </label>
              ))}
            </FormFallback>
              <button
                type="button"
                data-force-quit-confirm
                aria-label={selected.length ? `Force quit selected (${selected.length})` : "Continue without force quitting"}
                disabled={pending}
                onClick={() => void send({ type: "force-quit", ids: selected })}
              >
                {selected.length
                  ? `Force quit selected (${selected.length})`
                  : "Continue"}
              </button>
          </>
        )}
        {prompt.type === "attack" && (
          <>
            {!!prompt.required?.length && <p>
              {prompt.required?.length
                ? `Must attack if able: ${prompt.required.map(name).join(", ")}. These characters are already selected. You may add other attackers.`
                : "Choose any available characters to attack, or choose none."}
            </p>}
            <div data-force-quit-help>
            <BoardChoice
              label="Attackers"
              active
              candidates={prompt.candidates}
              selected={selected}
              disabled={pending}
              onChoose={(id) =>
                setSelected((values) =>
                  prompt.required?.includes(id)
                    ? values
                    : values.includes(id)
                      ? values.filter((value) => value !== id)
                      : [...values, id],
                )
              }
            />
            </div>
            {/* SIM_FORM_FALLBACK: retain attacker checkboxes only for the explicit legacy preview. */}
            <FormFallback>
              {prompt.candidates.map((id, index) => (
                <label key={id} style={{ display: "block" }}>
                  <input
                    type="checkbox"
                    checked={selected.includes(id)}
                    onChange={() =>
                      setSelected((values) =>
                        prompt.required?.includes(id)
                          ? values
                          : values.includes(id)
                            ? values.filter((value) => value !== id)
                            : [...values, id],
                      )
                    }
                  />{" "}
                  {index + 1}. {name(id)}
                </label>
              ))}
            </FormFallback>
            <ActionConfirmation>
              <div
                role="group"
                aria-label="Attack selection controls"
                data-attack-selection-controls
              >
                <button
                  type="button"
                  disabled={pending || prompt.candidates.length === 0}
                  onClick={() => setSelected(allAttackers)}
                >
                  All Attack
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setSelected(requiredAttackers)}
                >
                  Clear
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void send({ type: "attack", ids: selected })}
                >
                  {selected.length
                    ? `Declare attackers (${selected.length})`
                    : "No Attackers"}
                </button>
              </div>
            </ActionConfirmation>
          </>
        )}
        {prompt.type === "block" && (
          <>
            <p>{blocker ? "Choose an attacker to block." : "Choose a blocker."}</p>
            {!!prompt.requiredBlockers?.length && (
              <p>
                Must block if a legal assignment is possible:{" "}
                {prompt.requiredBlockers.map(name).join(", ")}.
              </p>
            )}
            {prompt.minimumBlockers?.map(({ attackerId, minimum }) => (
              <p key={attackerId}>
                {name(attackerId)} needs at least {minimum} blockers, or must be
                left unblocked.
              </p>
            ))}
            <BoardDecoration
              selected={[
                ...Object.keys(blocking).filter((id) => blocking[id]),
                ...Object.values(blocking).filter(Boolean),
                ...(blocker ? [blocker] : []),
              ]}
              links={Object.entries(blocking)
                .filter(([, target]) => target)
                .map(([from, to]) => ({ from, to }))}
            />
            <div data-force-quit-help>
            <BoardChoice
              label={
                blocker ? "Choose an attacker to block" : "Choose your blocker"
              }
              active
              disabled={pending}
              candidates={
                blocker
                  ? (prompt.blockers.find(
                      (entry) => entry.blockerId === blocker,
                    )?.attackers ?? [])
                  : prompt.blockers.map((entry) => entry.blockerId)
              }
              selected={blocker ? [blocker] : []}
              onChoose={(id) => {
                if (!blocker) setBlocker(id);
                else {
                  setBlocking((values) => ({ ...values, [blocker]: id }));
                  setBlocker("");
                }
              }}
            />
            </div>
            <div data-block-assignment-description>
            {Object.entries(blocking)
              .filter(([, target]) => target)
              .map(([id, target]) => (
                <p key={id}>
                  <span data-block-assignment-description>
                    {name(id)} blocks {name(target)}.
                  </span>
                </p>
              ))}
            </div>
            <FormFallback>
              {/* SIM_FORM_FALLBACK: blocker then attacker board assignment. */}
              {prompt.blockers.map((entry, index) => (
                <label key={entry.blockerId} style={{ display: "block" }}>
                  Block with {index + 1}. {name(entry.blockerId)}{" "}
                  <select
                    aria-label={`Block with ${index + 1}. ${name(entry.blockerId)}`}
                    value={blocking[entry.blockerId] ?? ""}
                    onChange={(event) =>
                      setBlocking((values) => ({
                        ...values,
                        [entry.blockerId]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Do not block</option>
                    {entry.attackers.map((id, targetIndex) => (
                      <option key={id} value={id}>
                        {targetIndex + 1}. {name(id)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </FormFallback>
            <ActionConfirmation disabled={pending}>
              <button
                type="button"
                data-block-clear
                disabled={pending}
                onClick={() => { setBlocking({}); setBlocker(""); }}
              >
                Clear All Blockers
              </button>
              <button
                type="button"
                data-block-confirm
                disabled={pending}
                onClick={() =>
                  void send({
                    type: "block",
                    assignments: prompt.blockers.flatMap(({ blockerId }) =>
                      blocking[blockerId]
                        ? [{ blockerId, attackerId: blocking[blockerId] }]
                        : [],
                    ),
                  })
                }
              >
                {`Declare Blockers (${Object.values(blocking).filter(Boolean).length})`}
              </button>
            </ActionConfirmation>
          </>
        )}
        {prompt.type === "assign-damage" && (
          <>
            {!prompt.splits.length && <p>No damage split is required.</p>}
            {prompt.overrun?.map((group) => (
              <p key={group.attackerId}>
                {name(group.attackerId)} assigns {group.playerDamage}{" "}
                {group.channel} damage to your opponent with OVERRUN and{" "}
                {group.blockers
                  .map((blocker) => `${blocker.amount} to ${name(blocker.id)}`)
                  .join(", ")}
                . Damage prevention applies afterward.
              </p>
            ))}
            {prompt.splits.map((split, index) => (
              <fieldset key={split.attackerId}>
                <legend>
                  {index + 1}. {name(split.attackerId)}: assign {split.total}{" "}
                  damage
                </legend>
                <p>
                  Divide the attack's damage among these blockers before
                  prevention is applied.
                </p>
                {split.blockers.map((id, blockerIndex) => (
                  <AmountChoice
                    key={id}
                    label={`Damage from attacker ${index + 1} to blocker ${blockerIndex + 1}. ${name(id)}`}
                    min={0}
                    max={split.total}
                    value={damage[split.attackerId]?.[id] ?? "0"}
                    onChange={(value) =>
                      setDamage((values) => ({
                        ...values,
                        [split.attackerId]: {
                          ...values[split.attackerId],
                          [id]: value,
                        },
                      }))
                    }
                  />
                ))}
                <p>
                  Assigned{" "}
                  {damageSplits[index].assignments.reduce(
                    (sum, entry) =>
                      sum + (Number.isFinite(entry.amount) ? entry.amount : 0),
                    0,
                  )}{" "}
                  of {split.total}.
                </p>
              </fieldset>
            ))}
            <ActionConfirmation disabled={pending}>
              <button
                type="button"
                disabled={!validDamage}
                onClick={() =>
                  void send({ type: "assign-damage", splits: damageSplits })
                }
              >
                Resolve combat damage
              </button>
            </ActionConfirmation>
          </>
        )}
      </fieldset>
      {message && (
        <p role="status" aria-label="Turn action result">
          {message}
        </p>
      )}
    </section>
  );
}
