"use client";
import { DuckyControls } from "./ducky-controls";
import { TowerControls } from "./tower-controls";
import { EclipseControls } from "./eclipse-controls";
import { DeckOrderControls } from "./deck-order-controls";
import { WonderlandControls } from "./wonderland-controls";
import type { ProgramQuoteTransport } from "@/lib/simulator/http-match-transport";
import { MultipleRetargetControls } from "./multiple-retarget-controls";
import { GroupedRetargetControls } from "./grouped-retarget-controls";
import { ChoiceButtons, AmountChoice } from "./compact-choices";
import { RedirectControls } from "./redirect-controls";
import { CardChoiceTray, TrayCards } from "./card-choice-tray";
import { RamReallocation, ramAllocationValid } from "./ram-reallocation";
import { CardDetails } from "./card-inspection";
import { BoardChoice, BoardDecoration } from "./board-interaction";
import { gearPortChoiceId } from "@/lib/simulator/gear-port-choice";
import { FormFallback, ActionConfirmation } from "./visual-action-controls";

import { useRef, useState } from "react";
import type { DecisionPrompt } from "@/lib/simulator/decision-prompt";
import type { GameCommand } from "@/lib/simulator/commands";

export type SubmitDecision = (
  command: GameCommand,
) => Promise<{ ok: boolean; message?: string }>;

/** Parent keys the form by revision and decision id so a new snapshot clears old selections. */
export function DecisionControls({
  decision,
  name,
  onSubmit,
  onQuote,
}: {
  decision: DecisionPrompt;
  name: (id: string) => string;
  onSubmit: SubmitDecision;
  onQuote?: ProgramQuoteTransport["quoteProgram"];
}) {
  if (decision.type === "ducky-play")
    return (
      <DuckyControls
        key={decision.decisionId + ":" + decision.revision}
        decision={decision}
        name={name}
        onSubmit={onSubmit}
        onQuote={onQuote}
      />
    );
  if (decision.type === "tower")
    return (
      <TowerControls
        key={decision.decisionId + ":" + decision.revision}
        decision={decision}
        onSubmit={onSubmit}
      />
    );
  if (decision.type === "eclipse-entry")
    return (
      <EclipseControls
        key={`${decision.revision}:${decision.decisionId}`}
        decision={decision}
        onSubmit={onSubmit}
      />
    );
  if (decision.type === "deck-order")
    return (
      <DeckOrderControls
        key={`${decision.revision}:${decision.decisionId}`}
        decision={decision}
        onSubmit={onSubmit}
      />
    );
  if (decision.type === "wonderland")
    return (
      <WonderlandControls
        key={`${decision.revision}:${decision.decisionId}`}
        decision={decision}
        name={name}
        onSubmit={onSubmit}
        onQuote={onQuote}
      />
    );
  return (
    <DecisionForm
      key={`${decision.revision}:${decision.decisionId}`}
      decision={decision}
      name={name}
      onSubmit={onSubmit}
    />
  );
}

function DecisionForm({
  decision,
  name,
  onSubmit,
}: {
  decision: Exclude<
    DecisionPrompt,
    {
      type:
        "wonderland" | "deck-order" | "eclipse-entry" | "tower" | "ducky-play";
    }
  >;
  name: (id: string) => string;
  onSubmit: SubmitDecision;
}) {
  const [ram, setRam] = useState<string[]>([]);
  const [option, setOption] = useState<number | null>(null);
  const [allocation, setAllocation] = useState<Record<string, string>>({});
  const [detach, setDetach] = useState<string[]>([]);
  const [searchChoice, setSearchChoice] = useState<string | null | undefined>(
    undefined,
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const sending = useRef(false);
  const toggle = (values: string[], id: string) =>
    values.includes(id)
      ? values.filter((item) => item !== id)
      : [...values, id];
  async function send(action: GameCommand["action"]) {
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    setMessage("");
    try {
      const result = await onSubmit({
        expectedRevision: decision.revision,
        action,
      });
      setMessage(
        result.ok
          ? "Decision submitted. Waiting for the updated game."
          : (result.message ??
              "The decision was not accepted. Refresh the game and try again."),
      );
      if (result.ok) return; // Do not send twice while waiting for the next snapshot.
    } catch {
      setMessage(
        "The result could not be confirmed. Refresh the game before trying again.",
      );
      return; // Unknown delivery must be reconciled by the transport, not blindly resent.
    }
    sending.current = false;
    setPending(false);
  }
  return (
    <section aria-label="Your gameplay decision">
      <fieldset disabled={pending}>
        <legend>
          {decision.type === "bailout"
            ? "Bailout: choose RAM to destroy"
            : decision.type === "spirit-entry"
              ? "Choose an iconic character to enter"
              : decision.type === "copy-ability"
                ? "CTRL+C: choose an ability"
                : decision.type === "damage-prevention"
                  ? "Choose damage prevention"
                  : decision.type === "counter-replacement"
                    ? "Choose a replacement"
                    : decision.type === "redirect-ability"
                      ? "Redirect an activated ability"
                      : decision.type === "shred-transfer"
                        ? decision.mandatory
                          ? "SWIPE PLATINUM: attach gear"
                          : "SHRED: take gear before damage cleanup"
                        : decision.type === "retarget-program"
                          ? "Choose a new program target"
                          : decision.type === "hand-choice"
                            ? "Choose a card to discard"
                            : decision.type === "ram-cost-choice"
                              ? "Name a RAM cost"
                              : decision.type === "faction-choice"
                                ? "Name a faction"
                                : decision.type === "trigger-choice"
                                  ? "Choose how to resolve this effect"
                                  : decision.type === "optional-trigger"
                                    ? "Choose whether to use this effect"
                                    : decision.type === "trigger-target"
                                      ? "Choose a target for the triggered ability"
                                      : decision.type === "counter-payment"
                                        ? "Pay RAM to prevent the counter"
                                        : decision.type === "top-cards"
                                          ? decision.kind === "index"
                                            ? "Index your cyberdeck"
                                            : decision.kind === "look-bin"
                                              ? "Inspect your top card"
                                              : "Divine your cyberdeck"
                                          : decision.type === "deck-search"
                                            ? "Search your cyberdeck"
                                            : decision.type === "tether-follow"
                                              ? "Choose which departed host the tether follows"
                                              : "Rebalance committed RAM"}
        </legend>
        {decision.type === "bailout" && (
          <>
            <p>
              Bailout prevented your loss and set both health totals to 1.
              Choose {decision.count} RAM to destroy, including committed RAM.
            </p>
            <BoardChoice
              label="RAM destroyed by Bailout"
              active
              required={decision.count}
              disabled={pending}
              candidates={decision.ram}
              selected={ram}
              onChoose={(id) => setRam(toggle(ram, id))}
            />
            <ActionConfirmation disabled={pending}>
              <button
                type="button"
                disabled={ram.length !== decision.count}
                onClick={() =>
                  void send({
                    type: "answer-bailout",
                    decisionId: decision.decisionId,
                    ram,
                  })
                }
              >
                Confirm RAM destruction
              </button>
            </ActionConfirmation>
          </>
        )}
        {decision.type === "spirit-entry" && (
          <CardChoiceTray title="The Spirit Realm: choose an iconic character">
            <p>
              Choose one copy of {decision.name} to enter. The other copies stay
              in your recycle bin. All characters enter after every choice is
              confirmed.
            </p>
            {decision.confirmed.length > 0 && (
              <div aria-label="Confirmed entrants">
                <p>Already chosen to enter:</p>
                <ul>
                  {decision.confirmed.map((card) => (
                    <li key={card.id}>
                      Player {card.player + 1}: {card.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <TrayCards
              cards={decision.cards}
              selected={searchChoice ? [searchChoice] : []}
              disabled={pending}
              onChoose={setSearchChoice}
            />
            <button
              type="button"
              disabled={pending || !searchChoice}
              onClick={() =>
                searchChoice &&
                void send({
                  type: "answer-spirit-entry",
                  decisionId: decision.decisionId,
                  id: searchChoice,
                })
              }
            >
              Confirm iconic entrant
            </button>
          </CardChoiceTray>
        )}
        {decision.type === "copy-ability" && (
          <>
            <p>
              Replace CTRL+C with an ability from {name(decision.targetId)}.
              Reboot before using it.
            </p>
            {decision.options.map((o) => (
              <button
                key={o.index}
                type="button"
                aria-pressed={option === o.index}
                onClick={() => setOption(o.index)}
              >
                {o.label}
              </button>
            ))}
            <button
              type="button"
              disabled={option === null}
              onClick={() =>
                void send({
                  type: "answer-copy-ability",
                  decisionId: decision.decisionId,
                  index: option!,
                })
              }
            >
              Confirm copied ability
            </button>
          </>
        )}
        {decision.type === "damage-prevention" && (
          <>
            <p>
              Choose which prevention effect applies first. Firewall and
              Amethyst gain a counter; Justice reflects the amount it prevents.
            </p>
            <BoardChoice
              label="Damage prevention"
              active
              required={1}
              disabled={pending}
              candidates={decision.options.filter(
                (id) => id !== "other-prevention" && !id.startsWith("justice:"),
              )}
              selected={
                option === null ||
                decision.options[option] === "other-prevention" ||
                decision.options[option].startsWith("justice:")
                  ? []
                  : [decision.options[option]]
              }
              onChoose={(id) => setOption(decision.options.indexOf(id))}
            />
            {decision.options.map((id, index) => (
              <button
                key={id}
                type="button"
                aria-pressed={option === index}
                onClick={() => setOption(index)}
              >
                {id === "other-prevention"
                  ? "Other damage prevention — no breach counter"
                  : id.startsWith("justice:")
                    ? `Justice — prevent half and reflect (${index + 1})`
                    : `${name(id)} — ${index + 1}`}
              </button>
            ))}
            <button
              type="button"
              disabled={option === null}
              onClick={() =>
                option !== null &&
                void send({
                  type: "answer-damage-prevention",
                  decisionId: decision.decisionId,
                  replacement: decision.options[option],
                })
              }
            >
              Confirm prevention
            </button>
          </>
        )}
        {decision.type === "counter-replacement" && (
          <>
            <p>
              {name(decision.sourceId)} would be destroyed. Choose a
              replacement.
            </p>
            {(decision.options ?? ["armor", "spirit"]).map(
              (replacement, index) => (
                <button
                  key={replacement}
                  type="button"
                  aria-pressed={option === index}
                  onClick={() => setOption(index)}
                >
                  {
                    {
                      armor:
                        "ARMOR — remove 1 counter, clear damage, keep character",
                      spirit: "SPIRIT — purge character",
                      fan: "Pay 2 MF and 2 BF — return to owner's hand (SPIRIT still applies)",
                      decline: "Do not pay — continue destruction",
                    }[replacement]
                  }
                </button>
              ),
            )}
            <button
              type="button"
              disabled={option === null}
              onClick={() =>
                option !== null &&
                void send({
                  type: "answer-counter-replacement",
                  decisionId: decision.decisionId,
                  replacement: (decision.options ?? ["armor", "spirit"])[
                    option
                  ],
                })
              }
            >
              Confirm replacement
            </button>
          </>
        )}
        {decision.type === "shred-transfer" && (
          <>
            <BoardDecoration
              selected={
                option === null
                  ? []
                  : decision.options[option].links.map((link) =>
                      gearPortChoiceId(link.hostId, link.port),
                    )
              }
              links={
                option === null
                  ? []
                  : decision.options[option].links.map((link, index) => ({
                      from: decision.gearId,
                      to: gearPortChoiceId(link.hostId, link.port),
                      label: `Gear attachment ${index + 1}`,
                      kind: "target" as const,
                    }))
              }
            />
            <p>
              Take {name(decision.gearId)} and attach it to{" "}
              {name(decision.sourceId)}
              {decision.mandatory ? ". Choose an attachment below." : "?"}
            </p>
            {decision.options.map((item) => (
              <button
                type="button"
                key={item.index}
                aria-pressed={option === item.index}
                onClick={() => setOption(item.index)}
              >
                {item.links
                  .map((link) => `${name(link.hostId)}: ${link.port}`)
                  .join(" + ")}
              </button>
            ))}
            <button
              type="button"
              disabled={option === null}
              onClick={() =>
                option !== null &&
                void send({
                  type: "answer-shred-transfer",
                  decisionId: decision.decisionId,
                  option,
                })
              }
            >
              Confirm gear transfer
            </button>
            {!decision.mandatory && (
              <button
                type="button"
                onClick={() =>
                  void send({
                    type: "answer-shred-transfer",
                    decisionId: decision.decisionId,
                    option: null,
                  })
                }
              >
                Leave gear attached
              </button>
            )}
          </>
        )}
        {decision.type === "redirect-ability" && (
          <RedirectControls
            decision={decision}
            name={name}
            pending={pending}
            send={send}
          />
        )}
        {decision.type === "retarget-program" && decision.objectSlots && (
          <GroupedRetargetControls
            decision={decision}
            pending={pending}
            send={send}
          />
        )}
        {decision.type === "retarget-program" &&
          !decision.objectSlots &&
          decision.originalTargets && (
            <MultipleRetargetControls
              decision={decision}
              name={name}
              pending={pending}
              send={send}
            />
          )}
        {decision.type === "retarget-program" &&
          !decision.objectSlots &&
          !decision.originalTargets && (
            <>
              <BoardDecoration
                selected={decision.options.flatMap((item) =>
                  item.index === option && item.targetId ? [item.targetId] : [],
                )}
                links={decision.options.flatMap((item) =>
                  item.index !== option
                    ? []
                    : item.targetId
                      ? [
                          {
                            from: `cache-action:${decision.targetActionId}`,
                            to: item.targetId,
                            label: "Replacement program target",
                            kind: "target" as const,
                          },
                        ]
                      : item.player !== undefined
                        ? [
                            {
                              from: `cache-action:${decision.targetActionId}`,
                              to: `player:${item.player}`,
                              label: "Replacement player target",
                              kind: "target" as const,
                            },
                          ]
                        : [],
                )}
              />
              <p>Change the target of {name(decision.targetProgramId)}.</p>
              <BoardChoice
                label="New program target"
                active
                required={1}
                disabled={pending}
                candidates={decision.options.flatMap((item) =>
                  item.targetId ? [item.targetId] : [],
                )}
                selected={decision.options.flatMap((item) =>
                  item.index === option && item.targetId ? [item.targetId] : [],
                )}
                onChoose={(id) => {
                  const item = decision.options.find(
                    (item) => item.targetId === id,
                  );
                  if (item) setOption(item.index);
                }}
              />
              {decision.options
                .filter((item) => item.player !== undefined || !item.targetId)
                .map((item) => (
                  <button
                    key={item.index}
                    type="button"
                    aria-pressed={option === item.index}
                    onClick={() => setOption(item.index)}
                  >
                    {item.label}
                  </button>
                ))}
              <p>
                {decision.options.find((item) => item.index === option)
                  ?.label ?? "Select a replacement target on the board."}
              </p>
              <button
                type="button"
                disabled={option === null}
                onClick={() =>
                  option !== null &&
                  void send({
                    type: "answer-retarget-program",
                    decisionId: decision.decisionId,
                    index: option,
                  })
                }
              >
                Confirm new target
              </button>
            </>
          )}
        {decision.type === "ram-cost-choice" && (
          <>
            <p>
              Name the cost before revealing the top card of your cyberdeck.
            </p>
            <AmountChoice
              label="Named RAM cost"
              value={option === null ? "" : String(option)}
              min={0}
              max={Number.MAX_SAFE_INTEGER}
              onChange={(value) =>
                setOption(value === "" ? null : Number(value))
              }
            />
            <ActionConfirmation disabled={pending}>
              <button
                type="button"
                disabled={
                  option === null || !Number.isSafeInteger(option) || option < 0
                }
                onClick={() => {
                  if (option !== null)
                    void send({
                      type: "answer-ram-cost-choice",
                      decisionId: decision.decisionId,
                      cost: option,
                    });
                }}
              >
                Confirm cost and reveal
              </button>
            </ActionConfirmation>
          </>
        )}
        {decision.type === "faction-choice" && (
          <>
            <ChoiceButtons
              label="Faction"
              value={searchChoice ?? ""}
              onChange={(value) => setSearchChoice(value || undefined)}
            >
              <option value="">Choose a faction</option>
              {decision.factions.map((faction) => (
                <option key={faction} value={faction}>
                  {faction}
                </option>
              ))}
            </ChoiceButtons>

            <button
              type="button"
              disabled={
                !searchChoice || !decision.factions.includes(searchChoice)
              }
              onClick={() =>
                searchChoice &&
                void send({
                  type: "answer-faction-choice",
                  decisionId: decision.decisionId,
                  faction: searchChoice,
                })
              }
            >
              Confirm faction
            </button>
          </>
        )}
        {decision.type === "trigger-choice" &&
          decision.cardCount !== undefined && (
            <>
              <p>{decision.prompt}</p>
              <BoardChoice
                label="Cards for effect"
                active
                required={decision.cardCount}
                disabled={pending}
                candidates={decision.options.flatMap((o) =>
                  o.cardId ? [o.cardId] : [],
                )}
                selected={ram}
                onChoose={(id) =>
                  setRam((old) =>
                    old.includes(id)
                      ? old.filter((x) => x !== id)
                      : old.length < decision.cardCount!
                        ? [...old, id]
                        : old,
                  )
                }
              />
              <p>
                {ram.length} / {decision.cardCount} selected
                {ram.length ? `: ${ram.map(name).join("; ")}` : ""}
              </p>
              <ActionConfirmation disabled={pending}>
                <button
                  type="button"
                  disabled={ram.length !== decision.cardCount}
                  onClick={() =>
                    void send({
                      type: "answer-trigger-cards",
                      decisionId: decision.decisionId,
                      cards: ram.map(
                        (id) =>
                          decision.options.find((o) => o.cardId === id)!.id,
                      ),
                    })
                  }
                >
                  Confirm selected cards
                </button>
              </ActionConfirmation>
            </>
          )}
        {decision.type === "trigger-choice" &&
          decision.cardCount === undefined && (
            <>
              <p>{decision.prompt}</p>
              {decision.options.some((item) => item.cardId) && (
                <>
                  <BoardChoice
                    label="Effect payment"
                    active
                    required={1}
                    disabled={pending}
                    candidates={decision.options.flatMap((item) =>
                      item.cardId ? [item.cardId] : [],
                    )}
                    selected={
                      option === null
                        ? []
                        : decision.options[option]?.cardId
                          ? [decision.options[option].cardId!]
                          : []
                    }
                    onChoose={(id) =>
                      setOption(
                        decision.options.findIndex(
                          (item) => item.cardId === id,
                        ),
                      )
                    }
                  />
                  <p>
                    {option === null
                      ? "Choose a card on the board."
                      : name(decision.options[option].cardId!)}
                  </p>
                  <button
                    type="button"
                    disabled={
                      option === null || !decision.options[option]?.cardId
                    }
                    onClick={() =>
                      option !== null &&
                      void send({
                        type: "answer-trigger-choice",
                        decisionId: decision.decisionId,
                        choice: decision.options[option].id,
                      })
                    }
                  >
                    {option === null
                      ? "Confirm payment"
                      : decision.options[option].label}
                  </button>
                </>
              )}
              {decision.options
                .filter((item) => !item.cardId)
                .map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() =>
                      void send({
                        type: "answer-trigger-choice",
                        decisionId: decision.decisionId,
                        choice: option.id,
                      })
                    }
                  >
                    {option.label}
                  </button>
                ))}
            </>
          )}
        {decision.type === "optional-trigger" && (
          <>
            <p>{decision.prompt}</p>
            <button
              type="button"
              onClick={() =>
                void send({
                  type: "answer-optional-trigger",
                  decisionId: decision.decisionId,
                  useEffect: true,
                })
              }
            >
              Use effect
            </button>
            <button
              type="button"
              onClick={() =>
                void send({
                  type: "answer-optional-trigger",
                  decisionId: decision.decisionId,
                  useEffect: false,
                })
              }
            >
              Decline effect
            </button>
          </>
        )}
        {decision.type === "trigger-target" && decision.cards && (
          <CardChoiceTray title="Choose a recycle-bin target">
            <BoardDecoration
              selected={decision.options.flatMap((item) =>
                item.index === option && "characterId" in item
                  ? [item.characterId]
                  : [],
              )}
              links={decision.options.flatMap((item) =>
                item.index === option && "characterId" in item
                  ? [
                      {
                        from: decision.sourceId,
                        to: item.characterId,
                        label: "Triggered ability target",
                        kind: "target" as const,
                      },
                    ]
                  : [],
              )}
            />
            <p>
              Choose the MYSTIC character this ability will return if its purge
              cost is paid.
            </p>
            <TrayCards
              cards={decision.cards}
              selected={decision.options.flatMap((o) =>
                o.index === option && "characterId" in o ? [o.characterId] : [],
              )}
              disabled={pending}
              onChoose={(id) => {
                const selected = decision.options.find(
                  (o) => "characterId" in o && o.characterId === id,
                );
                if (selected) setOption(selected.index);
              }}
            />
            <button
              type="button"
              disabled={pending || option === null}
              onClick={() => {
                if (option !== null)
                  void send({
                    type: "answer-trigger-target",
                    decisionId: decision.decisionId,
                    option,
                  });
              }}
            >
              Confirm return target
            </button>
          </CardChoiceTray>
        )}
        {decision.type === "trigger-target" && !decision.cards && (
          <>
            <BoardDecoration
              selected={decision.options.flatMap((item) =>
                item.index !== option
                  ? []
                  : "characterId" in item
                    ? [item.characterId]
                    : "programId" in item
                      ? [item.programId]
                      : "ramId" in item
                        ? [item.ramId]
                        : [],
              )}
              links={decision.options.flatMap((item) => {
                if (item.index !== option) return [];
                const target =
                  "characterId" in item
                    ? item.characterId
                    : "programId" in item
                      ? item.programId
                      : "ramId" in item
                        ? item.ramId
                        : `player:${item.seat}`;
                return [
                  {
                    from: decision.sourceId,
                    to: target,
                    label: "Triggered ability target",
                    kind: "target" as const,
                  },
                ];
              })}
            />
            <BoardChoice
              label="Triggered ability target"
              active
              required={1}
              disabled={pending}
              candidates={decision.options.flatMap((item) =>
                "characterId" in item
                  ? [item.characterId]
                  : "programId" in item
                    ? [item.programId]
                    : "ramId" in item
                      ? [item.ramId]
                      : [],
              )}
              selected={decision.options.flatMap((item) =>
                item.index !== option
                  ? []
                  : "characterId" in item
                    ? [item.characterId]
                    : "programId" in item
                      ? [item.programId]
                      : "ramId" in item
                        ? [item.ramId]
                        : [],
              )}
              onChoose={(id) => {
                const item = decision.options.find((item) =>
                  "characterId" in item
                    ? item.characterId === id
                    : "programId" in item
                      ? item.programId === id
                      : "ramId" in item
                        ? item.ramId === id
                        : false,
                );
                if (item) setOption(item.index);
              }}
            />
            {decision.options.map((item) =>
              "player" in item ? (
                <button
                  type="button"
                  key={item.index}
                  aria-pressed={option === item.index}
                  onClick={() => setOption(item.index)}
                >
                  {item.player === "you"
                    ? "Target yourself"
                    : "Target opponent"}
                </button>
              ) : null,
            )}
            <FormFallback>
              {/* SIM_FORM_FALLBACK: triggered targets are selected on the board. */}
              <label>
                Target{" "}
                <select
                  aria-label="Triggered ability target"
                  value={option ?? ""}
                  onChange={(event) =>
                    setOption(
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                    )
                  }
                >
                  <option value="">Choose a target</option>
                  {decision.options.map((item) => (
                    <option key={item.index} value={item.index}>
                      {"characterId" in item
                        ? name(item.characterId)
                        : "programId" in item
                          ? name(item.programId)
                          : "ramId" in item
                            ? name(item.ramId)
                            : item.player === "you"
                              ? "You"
                              : "Opponent"}
                    </option>
                  ))}
                </select>
              </label>
            </FormFallback>
            <ActionConfirmation disabled={pending}>
              <button
                type="button"
                disabled={option === null}
                onClick={() => {
                  if (option !== null)
                    void send({
                      type: "answer-trigger-target",
                      decisionId: decision.decisionId,
                      option,
                    });
                }}
              >
                Choose target
              </button>
            </ActionConfirmation>
          </>
        )}
        {(decision.type === "deck-search" ||
          decision.type === "top-cards" ||
          decision.type === "hand-choice") && (
          <CardChoiceTray
            title={
              decision.type === "hand-choice"
                ? "Choose a card to discard"
                : decision.type === "deck-search"
                  ? "Search your cyberdeck"
                  : "Inspect top cards"
            }
          >
            <p>
              {decision.type === "hand-choice"
                ? "Choose one card from this hand to discard."
                : decision.type === "deck-search"
                  ? "Only you can see this search. Choose an eligible card to reveal and put into your hand."
                  : decision.kind === "tea-party"
                    ? "Both players can see these revealed cards. Choose a WONDERLAND character to put into play with a tea party counter and a RAM cost of 0. Bin the rest."
                    : decision.kind === "index"
                      ? "Both players can see these revealed cards. You may put one eligible card into your hand. The rest go to the recycle bin."
                      : decision.kind === "look-bin"
                        ? "Only you can see this card. Select it to bin it, or choose Keep on top."
                        : "Only you can see these cards. Put one into your hand. The rest go to the recycle bin."}
            </p>
            <TrayCards
              cards={decision.cards}
              selected={typeof searchChoice === "string" ? [searchChoice] : []}
              disabled={pending}
              onChoose={setSearchChoice}
            />
            {(decision.allowFail ||
              !decision.cards.some((card) => card.eligible)) && (
              <button
                type="button"
                aria-pressed={searchChoice === null}
                onClick={() => setSearchChoice(null)}
              >
                {decision.type === "deck-search"
                  ? "Find no card"
                  : decision.type === "top-cards" &&
                      decision.kind === "look-bin"
                    ? "Keep on top"
                    : "Take no card"}
              </button>
            )}
            <FormFallback>
              {/* SIM_FORM_FALLBACK: modal card tray replaces card-choice radios. */}
              {decision.cards.map((card, index) => (
                <div key={card.id}>
                  <label style={{ display: "block" }}>
                    <input
                      type="radio"
                      name="deck-search"
                      aria-label={`${decision.type === "deck-search" ? "Search result" : "Inspected card"} ${index + 1}. ${card.characteristics.name}`}
                      disabled={!card.eligible}
                      checked={searchChoice === card.id}
                      onChange={() => setSearchChoice(card.id)}
                    />{" "}
                    {card.characteristics.name}
                    {!card.eligible && " (not eligible)"}
                  </label>
                  <CardDetails
                    characteristics={card.characteristics}
                    artworkUrl={card.artworkUrl}
                  />
                </div>
              ))}
              {(decision.allowFail ||
                !decision.cards.some((card) => card.eligible)) && (
                <label style={{ display: "block" }}>
                  <input
                    type="radio"
                    name="deck-search"
                    checked={searchChoice === null}
                    onChange={() => setSearchChoice(null)}
                  />{" "}
                  {decision.type === "deck-search"
                    ? "Find no card"
                    : decision.type === "top-cards" &&
                        decision.kind === "look-bin"
                      ? "Keep on top"
                      : "Take no card"}
                </label>
              )}
            </FormFallback>
            <button
              type="button"
              disabled={searchChoice === undefined}
              onClick={() => {
                if (searchChoice !== undefined)
                  if (decision.type === "hand-choice") {
                    if (searchChoice !== null)
                      void send({
                        type: "answer-hand-choice",
                        decisionId: decision.decisionId,
                        selected: searchChoice,
                      });
                  } else
                    void send({
                      type:
                        decision.type === "deck-search"
                          ? "answer-deck-search"
                          : "answer-top-cards",
                      decisionId: decision.decisionId,
                      selected: searchChoice,
                    });
              }}
            >
              {decision.type === "hand-choice"
                ? "Discard selected card"
                : decision.type === "deck-search"
                  ? "Complete search"
                  : decision.type === "top-cards" &&
                      decision.kind === "look-bin"
                    ? searchChoice === null
                      ? "Keep on top"
                      : "Bin selected card"
                    : "Complete selection"}
            </button>
            <p role="status">
              {message || (pending ? "Submitting decision…" : "")}
            </p>
          </CardChoiceTray>
        )}
        {decision.type === "counter-payment" && (
          <>
            <p>
              Select exactly {decision.ramCost} refreshed RAM, or decline
              payment.
            </p>
            <BoardChoice
              label="Counter payment"
              active
              required={decision.ramCost}
              disabled={pending}
              candidates={decision.ram.filter(
                (id) => ram.includes(id) || ram.length < decision.ramCost,
              )}
              selected={ram}
              onChoose={(id) => setRam(toggle(ram, id))}
            />
            <FormFallback>
              {/* SIM_FORM_FALLBACK: counter payment uses board RAM selection. */}
              {decision.ram.map((id, index) => (
                <label key={id} style={{ display: "block" }}>
                  <input
                    type="checkbox"
                    checked={ram.includes(id)}
                    onChange={() => setRam(toggle(ram, id))}
                  />{" "}
                  {index + 1}. {name(id)}
                </label>
              ))}
            </FormFallback>
            {decision.ram.length < decision.ramCost && (
              <p>Not enough refreshed RAM is available to pay.</p>
            )}
            <ActionConfirmation disabled={pending}>
              <button
                type="button"
                disabled={ram.length !== decision.ramCost}
                onClick={() =>
                  void send({
                    type: "answer-counter-payment",
                    decisionId: decision.decisionId,
                    pay: true,
                    ram,
                  })
                }
              >
                Pay {decision.ramCost} RAM
              </button>
            </ActionConfirmation>
            <ActionConfirmation disabled={pending}>
              <button
                type="button"
                onClick={() =>
                  void send({
                    type: "answer-counter-payment",
                    decisionId: decision.decisionId,
                    pay: false,
                    ram: [],
                  })
                }
              >
                Decline payment
              </button>
            </ActionConfirmation>
          </>
        )}
        {decision.type === "tether-follow" && (
          <>
            <ChoiceButtons
              label="Tether destination"
              value={option ?? ""}
              onChange={(value) => setOption(Number(value))}
            >
              {decision.options.map((choice) => (
                <option key={choice.index} value={choice.index}>
                  {choice.hostId ? name(choice.hostId) : "Departed host"} —{" "}
                  {choice.destination}
                </option>
              ))}
            </ChoiceButtons>
            <FormFallback>
              {/* SIM_FORM_FALLBACK: tether destinations use explicit buttons. */}
              {decision.options.map((choice) => (
                <label key={choice.index} style={{ display: "block" }}>
                  <input
                    type="radio"
                    name="tether-destination"
                    value={choice.index}
                    checked={option === choice.index}
                    onChange={() => setOption(choice.index)}
                  />
                  {choice.index + 1}.{" "}
                  {choice.hostId ? name(choice.hostId) : "Departed host"} —{" "}
                  {choice.destination}
                </label>
              ))}
            </FormFallback>
            <button
              type="button"
              disabled={option === null}
              onClick={() => {
                if (option !== null)
                  void send({
                    type: "answer-tether-follow",
                    decisionId: decision.decisionId,
                    option,
                  });
              }}
            >
              Follow selected host
            </button>
          </>
        )}
        {decision.type === "ram-balance" && (
          <>
            <p>
              Allocate available RAM to shortfalls, using refreshed RAM before
              running RAM. Detach excess commitments.
            </p>
            <RamReallocation
              decision={decision}
              allocation={allocation}
              detach={detach}
              onAllocate={setAllocation}
              onDetach={setDetach}
              name={name}
              disabled={pending}
            />
            <FormFallback>
              {/* SIM_FORM_FALLBACK: host then RAM replaces allocation forms. */}
              {decision.hosts.map((host, index) => (
                <div key={host.hostId}>
                  <h3>
                    {index + 1}. {name(host.hostId)}
                  </h3>
                  <p>
                    Requires {host.required} RAM · Currently committed:{" "}
                    {host.committed.length}
                  </p>
                  {host.committed.length > host.required && (
                    <fieldset>
                      <legend>
                        Detach {host.committed.length - host.required} excess
                        RAM
                      </legend>
                      {host.committed.map((id, ramIndex) => (
                        <label key={id} style={{ display: "block" }}>
                          <input
                            type="checkbox"
                            checked={detach.includes(id)}
                            onChange={() => setDetach(toggle(detach, id))}
                          />{" "}
                          {ramIndex + 1}. {name(id)}
                        </label>
                      ))}
                    </fieldset>
                  )}
                </div>
              ))}
              {decision.ram.map((item, index) => (
                <label key={item.id} style={{ display: "block" }}>
                  {index + 1}. {name(item.id)} (
                  {item.running ? "running" : "refreshed"})
                  <select
                    aria-label={`Allocate RAM ${index + 1}`}
                    value={allocation[item.id] ?? ""}
                    onChange={(event) =>
                      setAllocation({
                        ...allocation,
                        [item.id]: event.target.value,
                      })
                    }
                  >
                    <option value="">Leave in RAM bank</option>
                    {decision.hosts
                      .filter((host) => host.committed.length < host.required)
                      .map((host, hostIndex) => (
                        <option key={host.hostId} value={host.hostId}>
                          {hostIndex + 1}. {name(host.hostId)}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
            </FormFallback>
            <ActionConfirmation disabled={pending}>
              <button
                type="button"
                disabled={!ramAllocationValid(decision, allocation, detach)}
                onClick={() =>
                  void send({
                    type: "answer-ram-balance",
                    decisionId: decision.decisionId,
                    allocations: decision.hosts
                      .map((host) => ({
                        hostId: host.hostId,
                        ram: decision.ram
                          .filter((item) => allocation[item.id] === host.hostId)
                          .map((item) => item.id),
                      }))
                      .filter((host) => host.ram.length),
                    detach,
                  })
                }
              >
                Confirm RAM allocation
              </button>
            </ActionConfirmation>
          </>
        )}
      </fieldset>
      <p role="status">{message || (pending ? "Submitting decision…" : "")}</p>
    </section>
  );
}
