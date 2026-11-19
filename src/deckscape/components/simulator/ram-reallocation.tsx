"use client";
import { useState } from "react";
import { BoardChoice, BoardDecoration } from "./board-interaction";
import type { DecisionPrompt } from "@/lib/simulator/decision-prompt";
type Decision = Extract<DecisionPrompt, { type: "ram-balance" }>;
export function ramAllocationValid(
  decision: Decision,
  allocation: Record<string, string>,
  detach: string[],
) {
  const assigned = decision.ram.filter((ram) => allocation[ram.id]);
  const shortage = decision.hosts.reduce(
    (sum, host) => sum + Math.max(0, host.required - host.committed.length),
    0,
  );
  return (
    assigned.length === Math.min(shortage, decision.ram.length) &&
    assigned.filter((ram) => !ram.running).length ===
      Math.min(
        assigned.length,
        decision.ram.filter((ram) => !ram.running).length,
      ) &&
    decision.hosts.every(
      (host) =>
        assigned.filter((ram) => allocation[ram.id] === host.hostId).length <=
          Math.max(0, host.required - host.committed.length) &&
        detach.filter((id) => host.committed.includes(id)).length ===
          Math.max(0, host.committed.length - host.required),
    )
  );
}
export function RamReallocation({
  decision,
  allocation,
  detach,
  onAllocate,
  onDetach,
  name,
  disabled,
}: {
  decision: Decision;
  allocation: Record<string, string>;
  detach: string[];
  onAllocate: (value: Record<string, string>) => void;
  onDetach: (value: string[]) => void;
  name: (id: string) => string;
  disabled: boolean;
}) {
  const [hostId, setHostId] = useState("");
  const hosts = decision.hosts.filter(
    (host) => host.required > host.committed.length,
  );
  const host = hosts.find((host) => host.hostId === hostId);
  const assigned = decision.ram.filter((ram) => allocation[ram.id] === hostId);
  const hasRoom =
    host && assigned.length < host.required - host.committed.length;
  const excess = decision.hosts.flatMap((host) =>
    host.committed.length > host.required
      ? host.committed.filter(
          (id) =>
            detach.includes(id) ||
            detach.filter((id) => host.committed.includes(id)).length <
              host.committed.length - host.required,
        )
      : [],
  );
  const bank = host
    ? decision.ram.filter(
        (ram) =>
          allocation[ram.id] === hostId ||
          (hasRoom &&
            (!ram.running ||
              !decision.ram.some(
                (other) => !other.running && !allocation[other.id],
              ))),
      )
    : [];
  return (
    <>
      <BoardDecoration
        selected={[
          ...Object.keys(allocation).filter((id) => allocation[id]),
          ...detach,
          ...(hostId ? [hostId] : []),
        ]}
        links={Object.entries(allocation)
          .filter(([, to]) => to)
          .map(([from, to]) => ({ from, to }))}
      />
      <BoardChoice
        label={
          host
            ? "Choose RAM for " + name(hostId)
            : "Choose a host, or excess RAM to detach"
        }
        active
        disabled={disabled}
        candidates={[
          ...hosts.map((host) => host.hostId),
          ...excess,
          ...bank.map((ram) => ram.id),
        ]}
        selected={[...detach, ...assigned.map((ram) => ram.id)]}
        onChoose={(id) => {
          if (hosts.some((host) => host.hostId === id)) setHostId(id);
          else if (excess.includes(id))
            onDetach(
              detach.includes(id)
                ? detach.filter((value) => value !== id)
                : [...detach, id],
            );
          else if (host)
            onAllocate({
              ...allocation,
              [id]: allocation[id] === hostId ? "" : hostId,
            });
        }}
      />
      {decision.hosts.map((host) => (
        <p key={host.hostId}>
          {name(host.hostId)}:{" "}
          {host.committed.length +
            decision.ram.filter((ram) => allocation[ram.id] === host.hostId)
              .length -
            detach.filter((id) => host.committed.includes(id)).length}
          /{host.required} RAM
        </p>
      ))}
      {!!detach.length && (
        <p>Marked for detachment: {detach.map(name).join(", ")}</p>
      )}
      {Object.entries(allocation)
        .filter(([, to]) => to)
        .map(([id, to]) => (
          <p key={id}>
            {name(id)} → {name(to)}{" "}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAllocate({ ...allocation, [id]: "" })}
            >
              Unassign {name(id)}
            </button>
          </p>
        ))}
    </>
  );
}
