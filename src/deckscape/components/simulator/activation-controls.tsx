"use client";
import { ChoiceButtons, AmountChoice } from "./compact-choices";
import { FormFallback, ActionConfirmation } from "./visual-action-controls";

import { useEffect, useRef, useState } from "react";
import { BoardChoice, BoardDecoration } from "./board-interaction";
import { useAutomaticQuote } from "./use-automatic-quote";
import type {
  ActivationOption,
  ActivationVariant,
} from "@/lib/simulator/activation-option";
import type { AbilityChoices } from "@/lib/simulator/ability-choices";
import {
  activationQuoteRequestSchema,
  activationQuoteSchema,
  type ActivationQuote,
} from "@/lib/simulator/activation-quote-contract";
import type { ActivationQuoteTransport } from "@/lib/simulator/http-match-transport";
import { useAutomaticRamPayment } from "./use-automatic-ram-payment";

type Props = {
  initialId?: string;
  initialAbilityId?: string;
  options: ActivationOption[];
  revision: number;
  name: (id: string) => string;
  onQuote?: ActivationQuoteTransport["quoteActivation"];
  onActivate: (
    id: string,
    abilityId: string,
    ram: string[],
    choices: AbilityChoices,
  ) => void;
};

export function ActivationControls(props: Props) {
  const [id, setId] = useState(props.initialId ?? "");
  const [abilityId, setAbilityId] = useState(() => {
    if (props.initialAbilityId) return props.initialAbilityId;
    const source = props.options.find(
      (option) => option.id === props.initialId,
    );
    return source?.abilities.length === 1 ? source.abilities[0].abilityId : "";
  });
  const [key, setKey] = useState("");
  const selected = props.options.find((option) => option.id === id);
  const ability = selected?.abilities.find(
    (ability) => ability.abilityId === abilityId,
  );
  const variant =
    ability?.variants.length === 1
      ? ability.variants[0]
      : ability?.variants.find((variant) => variant.key === key);
  const guidedSelection = !!props.initialId && !!variant;
  if (!props.options.length) return null;
  return (
    <fieldset>
      <legend>Activate an ability</legend>
      <FormFallback>
        {/* SIM_FORM_FALLBACK: duplicate source selector */}
        <label>
          Ability source{" "}
          <select
            aria-label="Ability source"
            value={id}
            onChange={(event) => {
              setId(event.target.value);
              setAbilityId("");
              setKey("");
            }}
          >
            <option value="">Choose a source</option>
            {props.options.map((option, index) => (
              <option key={option.id} value={option.id}>
                {index + 1}. {props.name(option.id)}
              </option>
            ))}
          </select>
        </label>
      </FormFallback>
      {selected && guidedSelection ? (
        <p data-action-summary>
          {ability?.label}
          {variant.key !== "normal" && variant.label !== ability?.label
            ? ` · ${variant.label}`
            : ""}
        </p>
      ) : selected ? (
        <ChoiceButtons
          label="Activated ability"
          value={abilityId}
          onChange={(value) => {
            setAbilityId(value);
            setKey("");
          }}
        >
          <option value="">Choose an ability</option>
          {selected.abilities.map((ability) => (
            <option key={ability.abilityId} value={ability.abilityId}>
              {ability.label}
            </option>
          ))}
        </ChoiceButtons>
      ) : null}
      {ability && !ability.variants.length && (
        <p>No choices are currently available for this ability.</p>
      )}
      {ability && ability.variants.length > 1 && !guidedSelection && (
        <ChoiceButtons
          label="Ability options"
          value={key}
          onChange={(value) => setKey(value)}
        >
          <option value="">Choose how to activate</option>
          {ability.variants.map((variant) => (
            <option key={variant.key} value={variant.key}>
              {variant.label}
            </option>
          ))}
        </ChoiceButtons>
      )}
      {variant && (
        <ActivationSelection
          key={JSON.stringify([props.revision, id, abilityId, variant.key])}
          {...props}
          id={id}
          abilityId={abilityId}
          variant={variant}
        />
      )}
    </fieldset>
  );
}

function ActivationSelection({
  id,
  abilityId,
  variant,
  revision,
  name,
  onQuote,
  onActivate,
  initialId,
}: Props & { id: string; abilityId: string; variant: ActivationVariant }) {
  const guided = !!initialId;
  const [finishedGroups, setFinishedGroups] = useState<number[]>([]);
  const [targets, setTargets] = useState<string[][]>(() =>
    variant.targets.map(() => []),
  );
  const [x, setX] = useState("");
  const [playerTarget, setPlayerTarget] = useState<0 | 1 | undefined>();
  const [quote, setQuote] = useState<ActivationQuote | null>(null);
  const [ram, setRam] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
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
    (!variant.playerTargets ||
      variant.playerTargets.some((target) => target.player === playerTarget)) &&
    targets.every(
      (group, index) =>
        group.length >= variant.targets[index].minimum &&
        group.length <= variant.targets[index].maximum &&
        (!variant.targets[index].candidatesByFirstTarget ||
          group.every((id) =>
            (
              variant.targets[index].candidatesByFirstTarget![
                targets[0]?.[0]
              ] ?? []
            ).includes(id),
          )) &&
        (variant.targets[index].purpose !== "sacrifice-ram" ||
          group.length === Number(x)),
    ) &&
    (!variant.x ||
      (x.trim() !== "" &&
        Number.isSafeInteger(Number(x)) &&
        Number(x) >= variant.x.minimum &&
        Number(x) <= variant.x.maximum));
  const choices: AbilityChoices = {
    ...(variant.cacheActionId ? { cacheActionId: variant.cacheActionId } : {}),
    modes: variant.modes,
    targets: targets.flatMap((group, index) =>
      variant.targets[index].purpose ? [] : group,
    ),
    ...(variant.targets.some((group) => group.purpose === "sacrifice-ram")
      ? {
          sacrificeRam: targets.flatMap((group, index) =>
            variant.targets[index].purpose === "sacrifice-ram" ? group : [],
          ),
        }
      : {}),
    ...(variant.targets.some((g) => g.purpose === "sacrifice-character")
      ? {
          sacrificeCharacters: targets.flatMap((g, i) =>
            variant.targets[i].purpose === "sacrifice-character" ? g : [],
          ),
        }
      : {}),
    x: variant.x ? Number(x) : null,
    ...(playerTarget === undefined ? {} : { playerTarget }),
  };
  async function preview() {
    if (!onQuote || !valid || loading) return;
    invalidate();
    const current = generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    const request = activationQuoteRequestSchema.parse({
      expectedRevision: revision,
      id,
      abilityId,
      choices,
    });
    try {
      const response = activationQuoteSchema.parse(
        await onQuote(request, abort.signal),
      );
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
    JSON.stringify([revision, id, abilityId, choices]),
    preview,
  );
  useAutomaticRamPayment({
    paymentIdentity: JSON.stringify([
      revision,
      id,
      abilityId,
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
      <BoardDecoration
        selected={[...targets.flat(), ...ram]}
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
      {variant.playerTargets && (
        <ChoiceButtons
          label="Ability target player"
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
          label="Ability X"
          min={variant.x.minimum}
          max={variant.x.maximum}
          value={x}
          onChange={(value) => {
            invalidate();
            setX(value);
          }}
        />
      )}
      {variant.targets.map((original, index) => {
        const group = original.candidatesByFirstTarget
          ? {
              ...original,
              candidates:
                original.candidatesByFirstTarget[targets[0]?.[0]] ?? [],
            }
          : original;
        if (
          guided &&
          (quote || loading || nextTarget === -1 || nextTarget > index)
        ) {
          return (
            <p key={index} data-action-summary>
              {group.label}: {targets[index].length
                ? targets[index].map(name).join(" → ")
                : "None"}
            </p>
          );
        }
        return (
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
                    aria-label={`Ability target group ${index + 1}, ${position + 1}. ${name(target)}`}
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
        );
      })}
      {guided && loading && <p role="status">Checking ability cost…</p>}
      {(!guided || message || quote?.status === "unavailable") && (
        <button
          type="button"
          disabled={!valid || !onQuote || loading}
          onClick={() => void preview()}
        >
          {loading ? "Checking ability…" : "Check ability cost"}
        </button>
      )}
      {!onQuote && <p>Ability selection checking is unavailable.</p>}
      {quote?.status === "unavailable" && (
        <p role="status" aria-label="Ability unavailable">
          {
            {
              stale: "The game changed. Refresh before choosing again.",
              window: "You cannot activate an ability in this window.",
              source: "This source is no longer available to activate.",
              prohibited:
                "This ability is unavailable under the current effects.",
              additionalCost:
                "This ability's additional cost is not supported yet.",
              choices:
                "This combination of choices is not legal. Review your selections.",
            }[quote.reason]
          }
        </p>
      )}
      {quote?.status === "ready" && (
        <>
          <p
            role="status"
            aria-label="Ability cost"
            data-action-cost={guided || undefined}
          >
            {guided ? (
              <>
                Cost: {quote.cost === 0 ? "0 RAM" : `${quote.cost} refreshed RAM`}
                {quote.run ? ` · Run ${name(id)}` : ""} · Spend ability use
              </>
            ) : (
              <>
                Run {quote.cost} refreshed RAM.
                {quote.run ? ` Run ${name(id)}.` : ""} Spend this source's ability
                use.
              </>
            )}
          </p>
          {!quote.affordable && <p>Not enough available refreshed RAM.</p>}
          <FormFallback>
          <fieldset disabled={!quote.affordable}>
            <legend>Ability payment</legend>
            <BoardChoice
              label="Ability payment"
              active={
                guided
                  ? quote.cost > 0 && ram.length === quote.cost
                    ? undefined
                    : quote.cost > 0
                  : undefined
              }
              required={quote.cost}
              candidates={quote.ram.filter(
                (id) => ram.includes(id) || ram.length < quote.cost,
              )}
              selected={ram}
              disabled={!quote.affordable}
              onChoose={(id) =>
                setRam((values) =>
                  values.includes(id)
                    ? values.filter((value) => value !== id)
                    : [...values, id],
                )
              }
            />
            <FormFallback>
              {/* SIM_FORM_FALLBACK: duplicate board choices */}{" "}
              {quote.ram.map((ramId, index) => (
                <label key={ramId} style={{ display: "block" }}>
                  <input
                    type="checkbox"
                    aria-label={`Ability payment ${index + 1}. ${name(ramId)}`}
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
            </FormFallback>
          </fieldset>
          </FormFallback>
        </>
      )}
      {message && (
        <p role="status" aria-label="Ability preview error">
          {message}
        </p>
      )}
      <ActionConfirmation>
        <button
          type="button"
          disabled={!valid || !ready || loading}
          onClick={() => {
            if (ready) onActivate(id, abilityId, ram, choices);
          }}
        >
          Activate selected ability
        </button>
      </ActionConfirmation>
    </>
  );
}
