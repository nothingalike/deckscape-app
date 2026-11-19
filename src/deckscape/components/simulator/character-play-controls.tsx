"use client";
import { FormFallback, ActionConfirmation } from "./visual-action-controls";

import { useState } from "react";
import { BoardChoice, BoardDecoration } from "./board-interaction";
import {
  characterPlayReasons,
  type CharacterPlayOption,
} from "@/lib/simulator/character-play-option";
import { useAutomaticRamPayment } from "./use-automatic-ram-payment";

export function CharacterPlayControls({
  options,
  name,
  onPlay,
  initialId = "",
}: {
  initialId?: string;
  options: CharacterPlayOption[];
  name: (id: string) => string;
  onPlay: (
    id: string,
    ram: string[],
    runCharacters?: string[],
    freePlay?: boolean,
  ) => void;
}) {
  const [id, setId] = useState(initialId);
  const [freePlay, setFreePlay] = useState(false);
  const [runs, setRuns] = useState<string[]>([]);
  const [ram, setRam] = useState<string[]>([]);
  const original = options.find((option) => option.id === id);
  const usingFreePlay = freePlay && !!original?.freePlays;
  const selected =
    original && usingFreePlay
      ? {
          ...original,
          cost: 0,
          unavailable:
            original.unavailable === "ram" ? null : original.unavailable,
        }
      : original;
  useAutomaticRamPayment({
    paymentIdentity: JSON.stringify([
      selected?.id,
      selected?.cost,
      selected?.ram,
      selected?.unavailable,
      usingFreePlay,
    ]),
    cost: selected?.cost ?? 0,
    candidates: selected?.ram ?? [],
    available: selected?.unavailable === null,
    setRam,
  });
  if (!options.length) return null;
  return (
    <fieldset>
      <legend>Play a character</legend>
      <FormFallback>
        {/* SIM_FORM_FALLBACK: duplicate source selector */}
        <label>
          Character from your hand{" "}
          <select
            aria-label="Character from your hand"
            value={id}
            onChange={(event) => {
              setId(event.target.value);
              setFreePlay(false);
              setRam([]);
              setRuns([]);
            }}
          >
            <option value="">Choose a character</option>
            {options.map((option, index) => (
              <option key={option.id} value={option.id}>
                {index + 1}. {name(option.id)} — {option.cost} RAM
              </option>
            ))}
          </select>
        </label>
      </FormFallback>
      {selected && (
        <>
          <BoardDecoration selected={ram} />
          <p>Commit {selected.cost} RAM to this character.</p>
          {original?.freePlays && (
            <button
              type="button"
              aria-pressed={usingFreePlay}
              onClick={() => {
                setFreePlay(!usingFreePlay);
                setRam([]);
              }}
            >
              {usingFreePlay ? "Using free play" : "Use free play"} (
              {original.freePlays} remaining)
            </button>
          )}
          {selected.unavailable && (
            <p role="status" aria-label="Character unavailable">
              {characterPlayReasons[selected.unavailable]}
            </p>
          )}
          {selected.runCharacters && (
            <BoardChoice
              label="NANOBOT characters to run"
              active={runs.length < selected.runCharacters.count}
              required={selected.runCharacters.count}
              candidates={selected.runCharacters.candidates.filter(
                (id) =>
                  runs.includes(id) ||
                  runs.length < selected.runCharacters!.count,
              )}
              selected={runs}
              onChoose={(id) =>
                setRuns((old) =>
                  old.includes(id) ? old.filter((x) => x !== id) : [...old, id],
                )
              }
              disabled={selected.unavailable !== null}
            />
          )}
          <FormFallback>
          <fieldset disabled={selected.unavailable !== null}>
            <legend>Choose refreshed RAM</legend>
            <BoardChoice
              label="Character payment"
              active={
                initialId
                  ? selected.cost > 0 && ram.length === selected.cost
                    ? undefined
                    : selected.cost > 0 &&
                      runs.length === (selected.runCharacters?.count ?? 0)
                  : undefined
              }
              required={selected.cost}
              candidates={selected.ram.filter(
                (id) => ram.includes(id) || ram.length < selected.cost,
              )}
              selected={ram}
              disabled={selected.unavailable !== null}
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
              {selected.ram.map((ramId, index) => (
                <label key={ramId} style={{ display: "block" }}>
                  <input
                    type="checkbox"
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
          <ActionConfirmation>
            <button
              type="button"
              data-card-play-confirm
              disabled={
                selected.unavailable !== null ||
                ram.length !== selected.cost ||
                runs.length !== (selected.runCharacters?.count ?? 0)
              }
              onClick={() =>
                onPlay(
                  selected.id,
                  ram,
                  selected.runCharacters ? runs : undefined,
                  usingFreePlay || undefined,
                )
              }
            >
              Play selected character
            </button>
          </ActionConfirmation>
        </>
      )}
    </fieldset>
  );
}
