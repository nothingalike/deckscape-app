"use client";
import { ChoiceButtons, AmountChoice } from "./compact-choices";
import { FormFallback, ActionConfirmation } from "./visual-action-controls";

import { useEffect, useRef, useState } from "react";
import {
  BoardChoice,
  BoardDecoration,
  useBoardInteraction,
} from "./board-interaction";
import { useAutomaticQuote } from "./use-automatic-quote";
import type {
  ProgramPlayOption,
  ProgramPlayVariant,
} from "@/lib/simulator/program-play-option";
import type { ProgramChoices } from "@/lib/simulator/play-program";
import {
  programQuoteRequestSchema,
  type ProgramQuote,
} from "@/lib/simulator/program-quote-contract";
import type { ProgramQuoteTransport } from "@/lib/simulator/http-match-transport";
import { useAutomaticRamPayment } from "./use-automatic-ram-payment";

type Props = {
  initialId?: string;
  options: ProgramPlayOption[];
  revision: number;
  name: (id: string) => string;
  onQuote?: ProgramQuoteTransport["quoteProgram"];
  onQuoteChange?: (id: string, quote: ProgramQuote | null) => void;
  onPlay: (
    id: string,
    ram: string[],
    choices: ProgramChoices,
    freePlay?: boolean,
  ) => void;
};
export function ProgramPlayControls(props: Props) {
  const [id, setId] = useState(props.initialId ?? "");
  const [key, setKey] = useState(() => {
    const option = props.options.find(
      (option) => option.id === props.initialId,
    );
    return option?.variants.length === 1 ? option.variants[0].key : "";
  });
  const selected = props.options.find((option) => option.id === id);
  const variant = selected?.variants.find((variant) => variant.key === key);
  if (!props.options.length) return null;
  return (
    <fieldset>
      <legend>Play a program</legend>
      <FormFallback>
        {/* SIM_FORM_FALLBACK: duplicate source selector */}
        <label>
          Program from your hand{" "}
          <select
            aria-label="Program from your hand"
            value={id}
            onChange={(event) => {
              setId(event.target.value);
              const option = props.options.find(
                (option) => option.id === event.target.value,
              );
              setKey(
                option?.variants.length === 1 ? option.variants[0].key : "",
              );
            }}
          >
            <option value="">Choose a program</option>
            {props.options.map((option, index) => (
              <option key={option.id} value={option.id}>
                {index + 1}. {props.name(option.id)}
                {option.origin === "recycleBin"
                  ? " (recycle bin)"
                  : option.origin === "cyberdeck"
                    ? " (cyberdeck top)"
                    : ""}
              </option>
            ))}
          </select>
        </label>
      </FormFallback>
      {selected && (
        <>
          {!selected.variants.length && (
            <p>No program choices are currently available.</p>
          )}
          {props.initialId && variant ? (
            (selected.variants.length > 1 || variant.key !== "normal") && (
              <p data-action-summary>{variant.label}</p>
            )
          ) : (
            <ChoiceButtons
              label="Program play options"
              value={key}
              onChange={(value) => setKey(value)}
            >
              <option value="">Choose how to play</option>
              {selected.variants.map((variant) => (
                <option key={variant.key} value={variant.key}>
                  {variant.label}
                </option>
              ))}
            </ChoiceButtons>
          )}
        </>
      )}
      {variant && (
        <ProgramSelection
          key={`${props.revision}:${id}:${key}`}
          {...props}
          id={id}
          variant={variant}
          freePlays={selected?.freePlays}
        />
      )}
    </fieldset>
  );
}

function ProgramSelection({
  id,
  variant,
  revision,
  name,
  onQuote,
  onQuoteChange,
  onPlay,
  initialId,
  freePlays,
}: Props & { id: string; variant: ProgramPlayVariant; freePlays?: number }) {
  const guided = !!initialId;
  const [freePlay, setFreePlay] = useState(false);
  const [finishedGroups, setFinishedGroups] = useState<number[]>([]);
  const [targets, setTargets] = useState<string[][]>(() =>
    variant.targets.map(() => []),
  );
  const [x, setX] = useState("");
  const [runCharacters, setRunCharacters] = useState<string[]>([]);
  const [mainframe, setMainframe] = useState("");
  const setProgramSlot = useBoardInteraction()?.setProgramSlot;
  useEffect(() => {
    if (!mainframe) setProgramSlot?.(null);
  }, [mainframe, setProgramSlot]);
  useEffect(() => () => setProgramSlot?.(null), [setProgramSlot]);
  const [playerTarget, setPlayerTarget] = useState<0 | 1 | undefined>();
  const [quote, setQuote] = useState<ProgramQuote | null>(null);
  const [ram, setRam] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    onQuoteChange?.(id, quote);
    return () => onQuoteChange?.(id, null);
  }, [id, onQuoteChange, quote]);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  const invalidate = () => {
    generation.current++;
    controller.current?.abort();
    setQuote(null);
    setRam([]);
    setLoading(false);
    setMessage("");
  };
  const nextTarget = targets.findIndex((group, index) =>
    variant.targets[index].minimum === variant.targets[index].maximum
      ? group.length < variant.targets[index].maximum
      : !finishedGroups.includes(index),
  );
  const valid =
    (!guided || nextTarget === -1) &&
    targets.every(
      (group, index) =>
        group.length >= variant.targets[index].minimum &&
        group.length <= variant.targets[index].maximum,
    ) &&
    (!variant.mainframes || variant.mainframes.includes(mainframe)) &&
    (!variant.playerTargets ||
      variant.playerTargets.some((target) => target.player === playerTarget)) &&
    (!variant.x ||
      (x.trim() !== "" &&
        Number.isSafeInteger(Number(x)) &&
        Number(x) >= variant.x.minimum &&
        Number(x) <= variant.x.maximum)) &&
    (!variant.runCharacters || runCharacters.length === Number(x));
  const choices: ProgramChoices = {
    modes: variant.modes,
    reversed: variant.reversed,
    x: variant.x ? Number(x) : null,
    targets: targets.flatMap((g, i) => (variant.targets[i].purpose ? [] : g)),
    ...(variant.targets.some((g) => g.purpose === "sacrifice-character")
      ? {
          sacrificeCharacters: targets.flatMap((g, i) =>
            variant.targets[i].purpose === "sacrifice-character" ? g : [],
          ),
        }
      : {}),
    ...(variant.mainframes ? { mainframeTarget: mainframe } : {}),
    ...(playerTarget === undefined ? {} : { playerTarget }),
    ...(variant.runCharacters ? { runCharacters } : {}),
    ...(variant.cacheActionId ? { cacheActionId: variant.cacheActionId } : {}),
  };
  async function preview() {
    if (!onQuote || !valid || loading) return;
    invalidate();
    const current = generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    const request = programQuoteRequestSchema.parse({
      expectedRevision: revision,
      id,
      choices,
      ...(freePlay ? { freePlay: true } : {}),
    });
    try {
      const response = await onQuote(request, abort.signal);
      if (current !== generation.current || abort.signal.aborted) return;
      if (JSON.stringify(response.request) !== JSON.stringify(request))
        throw new Error("Mismatched selection");
      setQuote(response);
    } catch {
      if (current === generation.current && !abort.signal.aborted)
        setMessage(
          "Could not check this selection. Try again after reconnecting.",
        );
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }
  const ready =
    quote?.status === "ready" &&
    quote.affordable &&
    ram.length === quote.cost &&
    ram.every((id) => quote.ram.includes(id));
  useAutomaticQuote(
    guided,
    valid,
    JSON.stringify([revision, id, choices, freePlay]),
    preview,
  );
  useAutomaticRamPayment({
    paymentIdentity: JSON.stringify([
      revision,
      id,
      quote?.status,
      quote?.request,
      quote?.status === "ready" ? quote.cost : null,
      quote?.status === "ready" ? quote.ram : [],
    ]),
    cost: quote?.status === "ready" ? quote.cost : 0,
    candidates: quote?.status === "ready" ? quote.ram : [],
    available: quote?.status === "ready" && quote.affordable,
    setRam,
  });

  return (
    <>
      {freePlays && (
        <button
          type="button"
          aria-pressed={freePlay}
          onClick={() => {
            invalidate();
            setFreePlay(!freePlay);
            if (variant.x) setX("0");
          }}
        >
          {freePlay ? "Using free play" : "Use free play"} ({freePlays}{" "}
          remaining)
        </button>
      )}
      <BoardDecoration
        selected={[...targets.flat(), ...runCharacters, ...ram]}
        links={[
          ...targets.flatMap((group, index) =>
            variant.targets[index].purpose
              ? []
              : group.map((target) => ({
                  from: id,
                  to: target,
                  label: variant.targets[index].label,
                  kind: "target" as const,
                })),
          ),
          ...(mainframe
            ? [
                {
                  from: id,
                  to: mainframe,
                  label: "Mainframe attachment",
                  kind: "target" as const,
                },
              ]
            : []),
          ...(playerTarget === undefined
            ? []
            : [
                {
                  from: id,
                  to: `player:${playerTarget}`,
                  label: "Player target",
                  kind: "target" as const,
                },
              ]),
          ...(variant.cacheActionId
            ? [
                {
                  from: id,
                  to: `cache-action:${variant.cacheActionId}`,
                  label: "Cache target",
                  kind: "target" as const,
                },
              ]
            : []),
        ]}
      />
      {variant.reversed && <p>Playing reversed.</p>}
      {variant.playerTargets && (
        <ChoiceButtons
          label="Program target player"
          value={playerTarget ?? ""}
          onChange={(value) => {
            invalidate();
            setPlayerTarget(value === "" ? undefined : value === "0" ? 0 : 1);
          }}
        >
          <option value="">Choose a player</option>
          {variant.playerTargets.map((target) => (
            <option key={target.player} value={target.player}>
              {target.label}
            </option>
          ))}
        </ChoiceButtons>
      )}
      {variant.x && (
        <AmountChoice
          label="Program X"
          min={variant.x.minimum}
          max={variant.x.maximum}
          value={x}
          onChange={(value) => {
            invalidate();
            setX(value);
            setRunCharacters([]);
          }}
        />
      )}
      {variant.targets.map((group, index) =>
        guided &&
        (quote || loading || nextTarget === -1 || nextTarget > index) ? (
          <p key={index} data-action-summary>
            {group.label}: {targets[index].length
              ? targets[index].map(name).join(" → ")
              : "None"}
          </p>
        ) : (
          <fieldset key={index}>
            <legend>
              {group.label}: choose{" "}
              {group.minimum === group.maximum
                ? group.minimum
                : `${group.minimum}–${group.maximum}`}
            </legend>
            <BoardChoice
              label={group.label}
              active={
                guided ? !quote && !loading && nextTarget === index : undefined
              }
              required={group.maximum}
              candidates={group.candidates.filter(
                (id) =>
                  targets[index].includes(id) ||
                  targets[index].length < group.maximum,
              )}
              selected={targets[index]}
              onChoose={(target) => {
                invalidate();
                setTargets((values) =>
                  values.map((entries, i) =>
                    i !== index
                      ? entries
                      : entries.includes(target)
                        ? entries.filter((value) => value !== target)
                        : [...entries, target],
                  ),
                );
              }}
            />
            {guided &&
              nextTarget === index &&
              group.minimum !== group.maximum && (
                <button
                  type="button"
                  disabled={targets[index].length < group.minimum}
                  onClick={() =>
                    setFinishedGroups((values) => [...values, index])
                  }
                >
                  Done choosing {group.label}
                </button>
              )}
            <FormFallback>
              {/* SIM_FORM_FALLBACK: duplicate board choices */}{" "}
              {group.candidates.map((target, position) => (
                <label key={target} style={{ display: "block" }}>
                  <input
                    type="checkbox"
                    aria-label={`Program target group ${index + 1}, ${position + 1}. ${name(target)}`}
                    checked={targets[index].includes(target)}
                    disabled={
                      !targets[index].includes(target) &&
                      targets[index].length >= group.maximum
                    }
                    onChange={() => {
                      invalidate();
                      setTargets((values) =>
                        values.map((entries, i) =>
                          i !== index
                            ? entries
                            : entries.includes(target)
                              ? entries.filter((value) => value !== target)
                              : [...entries, target],
                        ),
                      );
                    }}
                  />{" "}
                  {position + 1}. {name(target)}
                </label>
              ))}
            </FormFallback>
            {targets[index].length > 1 && (
              <p>Selected order: {targets[index].map(name).join(" → ")}</p>
            )}
          </fieldset>
        ),
      )}
      {variant.runCharacters && (
        <fieldset>
          <legend>
            {variant.runCharacters.label}: choose {x || "X"} (additional cost)
          </legend>
          <BoardChoice
            label="Run characters as an additional cost"
            active={
              guided
                ? !quote &&
                  !loading &&
                  nextTarget === -1 &&
                  (!variant.mainframes || !!mainframe) &&
                  x !== "" &&
                  runCharacters.length < Number(x)
                : undefined
            }
            required={Number(x)}
            disabled={x === ""}
            candidates={variant.runCharacters.candidates.filter(
              (id) =>
                runCharacters.includes(id) || runCharacters.length < Number(x),
            )}
            selected={runCharacters}
            onChoose={(id) => {
              invalidate();
              setRunCharacters((values) =>
                values.includes(id)
                  ? values.filter((value) => value !== id)
                  : [...values, id],
              );
            }}
          />
          {!guided && runCharacters.length > 0 && (
            <button
              type="button"
              onClick={() => {
                invalidate();
                setRunCharacters([]);
              }}
            >
              Change running characters
            </button>
          )}
          <FormFallback>
            {/* SIM_FORM_FALLBACK: additional run cost is selected on the board. */}
            {variant.runCharacters.candidates.map((character, index) => (
              <label key={character} style={{ display: "block" }}>
                <input
                  type="checkbox"
                  aria-label={`Program run cost ${index + 1}. ${name(character)}`}
                  checked={runCharacters.includes(character)}
                  disabled={
                    !runCharacters.includes(character) &&
                    (x.trim() === "" || runCharacters.length >= Number(x))
                  }
                  onChange={() => {
                    invalidate();
                    setRunCharacters((selected) =>
                      selected.includes(character)
                        ? selected.filter((id) => id !== character)
                        : [...selected, character],
                    );
                  }}
                />{" "}
                {index + 1}. {name(character)}
              </label>
            ))}
          </FormFallback>
        </fieldset>
      )}
      {variant.mainframes && (
        <>
          {(!guided || (!quote && !loading)) && (
            <BoardChoice
              label="Mainframe attachment — choose an empty program slot"
              active={
                guided
                  ? !mainframe && !quote && !loading && nextTarget === -1
                  : undefined
              }
              required={1}
              candidates={variant.mainframes}
              selected={mainframe ? [mainframe] : []}
              onChoose={(target) => {
                invalidate();
                setMainframe(target);
              }}
            />
          )}
          {mainframe && <p data-action-summary>Attach to: {name(mainframe)}</p>}
          <FormFallback>
            {/* SIM_FORM_FALLBACK: mainframe selection is handled on the board. */}
            <label>
              Attach protocol to{" "}
              <select
                aria-label="Program mainframe target"
                value={mainframe}
                onChange={(event) => {
                  invalidate();
                  setMainframe(event.target.value);
                }}
              >
                <option value="">Choose a mainframe</option>
                {variant.mainframes.map((target, index) => (
                  <option key={target} value={target}>
                    {index + 1}. {name(target)}
                  </option>
                ))}
              </select>
            </label>
          </FormFallback>
        </>
      )}
      {guided && loading && <p role="status">Checking program cost…</p>}
      {(!guided || message || quote?.status === "unavailable") && (
        <button
          type="button"
          disabled={!valid || !onQuote || loading}
          onClick={() => void preview()}
        >
          {loading ? "Checking program…" : "Check program cost"}
        </button>
      )}
      {!onQuote && <p>Program selection checking is unavailable.</p>}
      {quote?.status === "unavailable" && (
        <p role="status" aria-label="Program unavailable">
          {
            {
              stale: "The game changed. Refresh before choosing again.",
              window: "You cannot play a program in this window.",
              hand: "You no longer have permission to play this program from its zone.",
              prohibited: "A current effect prohibits this play.",
              timing: "This program cannot be played at this time.",
              additionalCost:
                "This program's additional cost is not supported yet.",
              synergy: "Insufficient faction synergy.",
              health:
                "Not enough health to pay this program's additional cost.",
              choices:
                "This combination of choices is not legal. Review your selections.",
            }[quote.reason]
          }
        </p>
      )}
      {quote?.status === "ready" && (
        <>
          <p role="status" aria-label="Program cost">
            Run {quote.cost} refreshed RAM.
          </p>
          {!quote.affordable && <p>Not enough available refreshed RAM.</p>}
          <FormFallback>
            <fieldset disabled={!quote.affordable}>
              <legend>Program payment</legend>
              {/* SIM_FORM_FALLBACK: duplicate board choices */}{" "}
              {quote.ram.map((ramId, index) => (
                <label key={ramId} style={{ display: "block" }}>
                  <input
                    type="checkbox"
                    aria-label={`Program payment ${index + 1}. ${name(ramId)}`}
                    checked={ram.includes(ramId)}
                    onChange={() =>
                      setRam((values) =>
                        values.includes(ramId)
                          ? values.filter((value) => value !== ramId)
                          : [...values, ramId],
                      )
                    }
                  />{" "}
                  {index + 1}. {name(ramId)}
                </label>
              ))}
            </fieldset>
          </FormFallback>
        </>
      )}
      {message && (
        <p role="status" aria-label="Program preview error">
          {message}
        </p>
      )}
      <ActionConfirmation>
        <button
          type="button"
          data-card-play-confirm
          disabled={!valid || !ready || loading}
          onClick={() => {
            if (ready) onPlay(id, ram, choices, freePlay || undefined);
          }}
        >
          Play selected program
        </button>
      </ActionConfirmation>
    </>
  );
}
