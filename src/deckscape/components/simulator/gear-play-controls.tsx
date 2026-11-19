"use client";
import { FormFallback, ActionConfirmation } from "./visual-action-controls";

import { useState } from "react";
import { BoardChoice, BoardDecoration } from "./board-interaction";
import {
  gearPlayReasons,
  type GearPlayOption,
} from "@/lib/simulator/gear-play-option";
import type { GearLink } from "@/lib/simulator/gear-attachment";
import type { PortRegion } from "@/lib/simulator/ports";
import { gearPortChoiceId } from "@/lib/simulator/gear-port-choice";
import { useAutomaticRamPayment } from "./use-automatic-ram-payment";

const portNames: Record<PortRegion, string> = {
  head: "Head",
  body: "Body",
  leftArm: "Left arm",
  rightArm: "Right arm",
};

export function GearPlayControls({
  options,
  name,
  onPlay,
  initialId = "",
}: {
  initialId?: string;
  options: GearPlayOption[];
  name: (id: string) => string;
  onPlay: (
    id: string,
    ram: string[],
    targets: GearLink[],
    freePlay?: boolean,
  ) => void;
}) {
  const [id, setId] = useState(initialId);
  const [freePlay, setFreePlay] = useState(false);
  const [ram, setRam] = useState<string[]>([]);
  const [targets, setTargets] = useState<{ hostId: string; port: string }[]>(
    [],
  );
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
      targets,
    ]),
    cost: selected?.cost ?? 0,
    candidates: selected?.ram ?? [],
    available: selected?.unavailable === null,
    setRam,
  });
  if (!options.length) return null;
  const count = selected?.tether ? 2 : 1;
  const first = selected?.hosts.find(
    (host) => host.hostId === targets[0]?.hostId,
  );
  const attachmentReady =
    selected &&
    targets.length === count &&
    targets.every((target) =>
      selected.hosts
        .find((host) => host.hostId === target.hostId)
        ?.ports.includes(target.port as PortRegion),
    ) &&
    (!selected.tether ||
      selected.hosts.find((host) => host.hostId === targets[1]?.hostId)
        ?.chain !== first?.chain);
  const valid =
    selected &&
    selected.unavailable === null &&
    attachmentReady &&
    ram.length === selected.cost &&
    ram.every((value) => selected.ram.includes(value));
  return (
    <fieldset data-gear-attachment>
      <legend>Attach gear</legend>
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
      <BoardDecoration
        selected={[
          ...targets
            .filter((target) => target.port)
            .map((target) => gearPortChoiceId(target.hostId, target.port)),
          ...ram,
        ]}
        links={targets
          .filter((target) => target.port)
          .map((target, index) => ({
            from: id,
            to: gearPortChoiceId(target.hostId, target.port),
            label: `Attachment ${index + 1}`,
            kind: "target" as const,
          }))}
      />
      <FormFallback>
        {/* SIM_FORM_FALLBACK: duplicate source selector */}
        <label>
          Gear from your hand{" "}
          <select
            aria-label="Gear from your hand"
            value={id}
            onChange={(event) => {
              setId(event.target.value);
              setFreePlay(false);
              setRam([]);
              setTargets([]);
            }}
          >
            <option value="">Choose gear</option>
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
          <p>
            {selected.tether
              ? "Choose two characters on separate chains."
              : "Choose a character attachment port."}
          </p>
          <p role="status">
            {targets.filter((target) => target.port).length} of {count} selected
          </p>
          {selected.unavailable && (
            <p role="status" aria-label="Gear unavailable">
              {gearPlayReasons[selected.unavailable]}
            </p>
          )}
          <fieldset disabled={selected.unavailable !== null}>
            <FormFallback>
              <legend>Choose gear attachment</legend>
            </FormFallback>
            <FormFallback>
              <BoardChoice
                label="Gear payment"
                active={
                  initialId
                    ? selected.cost > 0 && ram.length === selected.cost
                      ? undefined
                      : !!attachmentReady && selected.cost > 0
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
              {/* SIM_FORM_FALLBACK: duplicate board choices */}{" "}
              {selected.ram.map((ramId, index) => (
                <label key={ramId} style={{ display: "block" }}>
                  <input
                    type="checkbox"
                    aria-label={`Gear payment ${index + 1}. ${name(ramId)}`}
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
            {Array.from({ length: count }, (_, index) => {
              const host = selected.hosts.find(
                (option) => option.hostId === targets[index]?.hostId,
              );
              const hosts =
                index === 0
                  ? selected.hosts
                  : selected.hosts.filter(
                      (option) => first && option.chain !== first.chain,
                    );
              return (
                <fieldset key={index}>
                  <FormFallback>
                    <legend>Attachment {index + 1}</legend>
                  </FormFallback>
                  <div hidden={!!initialId}>
                    <BoardChoice
                      label={`Gear port ${index + 1}`}
                      active={
                        !!initialId &&
                        !targets[index]?.port &&
                        (index === 0 || !!targets[index - 1]?.port)
                      }
                      required={1}
                      candidates={hosts.flatMap((host) =>
                        host.ports.map((port) =>
                          gearPortChoiceId(host.hostId, port),
                        ),
                      )}
                      selected={
                        targets[index]?.port
                          ? [
                              gearPortChoiceId(
                                targets[index].hostId,
                                targets[index].port,
                              ),
                            ]
                          : []
                      }
                      disabled={
                        selected.unavailable !== null || (index === 1 && !first)
                      }
                      onChoose={(choice) => {
                        for (const host of hosts)
                          for (const port of host.ports) {
                            if (gearPortChoiceId(host.hostId, port) !== choice)
                              continue;
                            setTargets([
                              ...targets.slice(0, index),
                              { hostId: host.hostId, port },
                            ]);
                            setRam([]);
                          }
                      }}
                    />
                  </div>
                  <FormFallback>
                    {targets[index]?.port && (
                      <p>
                        {name(targets[index].hostId)} ·{" "}
                        {portNames[targets[index].port as PortRegion]}
                      </p>
                    )}
                  </FormFallback>
                  <FormFallback>
                    {/* SIM_FORM_FALLBACK: host and port are selected together through board gear spots. */}
                    <BoardChoice
                      label={`Gear host ${index + 1}`}
                      required={1}
                      candidates={hosts.map((host) => host.hostId)}
                      selected={
                        targets[index]?.hostId ? [targets[index].hostId] : []
                      }
                      disabled={
                        selected.unavailable !== null || (index === 1 && !first)
                      }
                      onChoose={(id) => {
                        const next = targets.slice(0, index);
                        next[index] = { hostId: id, port: "" };
                        setTargets(next);
                      }}
                    />
                    <label>
                      Character{" "}
                      <select
                        aria-label={`Gear host ${index + 1}`}
                        value={targets[index]?.hostId ?? ""}
                        disabled={index === 1 && !first}
                        onChange={(event) => {
                          const next = targets.slice(0, index);
                          next[index] = {
                            hostId: event.target.value,
                            port: "",
                          };
                          setTargets(next);
                        }}
                      >
                        <option value="">Choose a character</option>
                        {hosts.map((option, position) => (
                          <option key={option.hostId} value={option.hostId}>
                            {position + 1}. {name(option.hostId)}
                          </option>
                        ))}
                      </select>
                    </label>{" "}
                    <label>
                      Port{" "}
                      <select
                        aria-label={`Gear port ${index + 1}`}
                        value={targets[index]?.port ?? ""}
                        disabled={!host}
                        onChange={(event) => {
                          setTargets((values) =>
                            values.map((value, position) =>
                              position === index
                                ? { ...value, port: event.target.value }
                                : value,
                            ),
                          );
                        }}
                      >
                        <option value="">Choose a port</option>
                        {host?.ports.map((port) => (
                          <option key={port} value={port}>
                            {portNames[port]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </FormFallback>
                </fieldset>
              );
            })}
          </fieldset>
          {(!initialId || attachmentReady) && (
            <ActionConfirmation>
              <button
                data-card-play-confirm
                type="button"
                disabled={!valid}
                onClick={() => {
                  if (valid)
                    onPlay(
                      selected.id,
                      ram,
                      targets.map((target) => ({
                        hostId: target.hostId,
                        port: target.port as PortRegion,
                      })),
                      usingFreePlay || undefined,
                    );
                }}
              >
                Play gear
              </button>
            </ActionConfirmation>
          )}
        </>
      )}
    </fieldset>
  );
}
