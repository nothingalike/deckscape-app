import { z } from "zod";
import type { GameState } from "./game-state";
import type { Seat } from "./setup";
import type { CardCharacteristics } from "./characteristics";
import type { PendingTrigger, RuleEvent } from "./rule-events";
import type { GameCommand } from "./commands";
import {
  ensureGameLog as ensure,
  appendGameLog as append,
} from "./game-log-record";
import { corruptionCounterHandler } from "./corruption-counters";

const seat = z.union([z.literal(0), z.literal(1)]);
export const logEntrySchema = z
  .object({
    id: z.number().int().positive(),
    turn: z.number().int().positive(),
    step: z.string(),
    message: z.string(),
    cards: z
      .array(
        z
          .object({
            name: z.string(),
            type: z.enum(["character", "gear", "program", "mainframe", "ram"]),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();
export const savedGameLogSchema = z
  .object({
    entries: z.array(
      logEntrySchema
        .extend({
          privateDetail: z
            .object({ player: seat, message: z.string() })
            .strict()
            .optional(),
        })
        .strict(),
    ),
    pendingRecorded: z.number().int().nonnegative(),
    position: z.string(),
    priority: z.string().optional(),
    outcomeRecorded: z.boolean(),
  })
  .strict();
export type SavedGameLog = z.infer<typeof savedGameLogSchema>;
export type LogEntry = z.infer<typeof logEntrySchema>;
type Characteristics = (
  state: GameState,
) => ReadonlyMap<string, CardCharacteristics>;
type LogEffectSource = {
  name: string;
  sourceId: string;
  counter?: "CORRUPTION";
};
const player = (s: Seat) => `Player ${s + 1}`;

export function recordArmorReplacement(
  state: GameState,
  controller: Seat,
  name: string,
) {
  append(
    state,
    `${player(controller)}: ${name} removes 1 ARMOR counter instead of being destroyed and clears all marked damage.`,
  );
}

/** Public replacement sources explain the instruction; drawn identities remain private. */
export function recordDrawBonus(
  state: GameState,
  seat: Seat,
  count: number,
  sources: readonly { name: string; amount: number }[],
) {
  if (count === 0) return;
  for (const source of sources) {
    append(
      state,
      `${source.name} increases ${player(seat)}'s draw from ${count} to ${count + source.amount} cards.`,
    );
    count += source.amount;
  }
}

/** Capture text at event time. Raw events, hidden IDs and canonical snapshots never
 * cross the response boundary. Private draw names are stored separately. */
function eventMessage(
  state: GameState,
  event: RuleEvent,
  characteristics: Characteristics,
  effectSource?: LogEffectSource,
) {
  const cards = characteristics(state);
  const name = (id: string, privateCard = false) => {
    const observed =
      "observers" in event
        ? event.observers?.find((o) => o.id === id)
        : undefined;
    const object = observed ?? state.objects[id];
    if (!object || (object.faceDown && !privateCard)) return "a face-down card";
    return cards.get(id)?.name ?? "a card";
  };
  const damageSource = (id: string) =>
    effectSource?.counter === "CORRUPTION" && effectSource.sourceId === id
      ? effectSource.name
      : name(id);
  const p = "player" in event ? player(event.player) : "";
  const n = "instanceId" in event ? name(event.instanceId) : "";
  const resolving = state.priorityWindow?.resolving;
  const source = effectSource
    ? `${effectSource.name}: `
    : resolving
      ? `${name(resolving.sourceId)}: `
      : "";
  const add = (message: string) => append(state, message);
  switch (event.type) {
    case "ability-retargeted":
      add(
        `${p}: ${name(event.sourceId)} changes the targets of ${event.abilityName}'s ability${event.playerTarget === undefined ? "." : ` to ${player(event.playerTarget)}.`}`,
      );
      break;
    case "card-drawn":
      append(state, `${source}${p} draws 1 card.`, {
        player: event.player,
        message: `${source}${p} draws ${name(event.instanceId, true)}.`,
      });
      break;
    case "ram-installed":
      add(`${source}${p} installs ${n}.`);
      break;
    case "cache-program-returned":
      add(`${source}${p} puts ${n} from the cache on top of their cyberdeck.`);
      break;
    case "recycle-ram-returned":
      add(
        `${source}${p} returns ${n} from the recycle bin to their RAM bank running.`,
      );
      break;
    case "empty-deck":
      add(`${p} cannot draw/install: ${event.deck} is empty.`);
      break;
    case "program-played":
    case "character-played":
    case "gear-played":
      add(`${p} plays ${n}.`);
      break;
    case "ability-activated":
      add(`${p} activates an ability of ${n}.`);
      break;
    case "character-entered":
    case "gear-entered":
    case "protocol-entered":
    case "environment-entered": {
      const hosts =
        state.objects[event.instanceId]?.attachments.map((a) =>
          name(a.hostId),
        ) ?? [];
      add(
        `${p}: ${n} enters play${hosts.length ? ` attached to ${hosts.join(" and ")}` : ""}.`,
      );
      break;
    }
    case "object-targeted":
      add(name(event.sourceId) + " targets " + n + " (" + p + ").");
      break;
    case "protocol-moved":
      add(`${p}: ${n} moves to ${name(event.mainframeId)}.`);
      break;
    case "protocol-binned":
    case "environment-binned":
      add(n + " cannot enter play and is binned.");
      break;
    case "environment-destroyed":
      add(n + " is destroyed by " + name(event.sourceId) + ".");
      break;
    case "token-created":
      add(name(event.sourceId) + " creates " + n + " for " + p + ".");
      break;
    case "counters-removed":
      add(
        name(event.sourceId) +
          " removes " +
          event.amount +
          " " +
          event.counter +
          " counter(s) from " +
          n +
          ".",
      );
      break;
    case "gear-failed-attachment":
      add(`${n} cannot attach and is binned.`);
      break;
    case "script-binned":
    case "script-purged":
      add(
        `${n}: ${event.reason === "resolved" ? "resolution complete" : "effect fails because all targets are illegal"}; moved to ${event.type === "script-purged" ? "purge" : "recycle bin"}.`,
      );
      break;
    case "persistent-destroyed":
      add(
        `${n} is destroyed and moved to the recycle bin${event.sourceId ? ` by ${name(event.sourceId)}` : ""}.`,
      );
      break;
    case "setu-character-returned":
      add(
        `${name(event.sourceId)}: ${p} puts ${name(event.instanceId, true)} from their recycle bin into their hand.`,
      );
      break;
    case "persistent-binned":
    case "cyberdeck-card-binned":
    case "card-discarded":
      add(`${p}: ${n} moves to the recycle bin.`);
      break;
    case "persistent-moved":
      add(
        event.replacement === "spirit"
          ? `${p}: ${n} is purged instead of leaving play another way because of its SPIRIT counter.`
          : event.replacement === "zen-garden"
            ? `${p}: ${n} is purged instead of leaving play another way because of Zen Garden's effect.`
            : `${p}: ${n} moves to ${event.destination}.`,
      );
      break;
    case "recycle-card-purged":
      add(`${p}: ${n} moves from the recycle bin to purge.`);
      break;
    case "health-gained":
    case "health-lost":
      add(
        `${damageSource(event.sourceId)}: ${p} ${event.type === "health-gained" ? "gains" : "loses"} ${event.amount} ${event.channel} health (${event.before} → ${event.after}).`,
      );
      break;
    case "player-damaged":
      add(
        `${damageSource(event.sourceId)} deals ${event.amount} ${event.channel} damage to ${p}.`,
      );
      break;
    case "control-changed":
      add(
        `${name(event.sourceId)}: ${p} gains control of ${n} from ${player(event.previousController)}.`,
      );
      break;
    case "character-damaged":
      add(
        `${name(event.sourceId)} deals ${event.amount} ${event.channel} damage to ${n}.`,
      );
      break;
    case "character-attacked":
      add(`${p} attacks ${player(event.defendingPlayer)} with ${n}.`);
      break;
    case "character-blocked":
      add(`${p} blocks ${name(event.attackerId)} with ${n}.`);
      break;
    case "instability-rolled":
      add(
        `${p} — instability: ${n} rolls ${event.value} on d20 (${event.value <= 10 ? "failed: destroy" : "survives"}).`,
      );
      break;
    case "psychosis-rolled":
      add(
        `${p} - PSYCHOSIS check: ${n} rolls ${event.value} on d20 against ${event.threshold}: ${event.failed ? "FAILED" : "PASSED"}; ${event.cause === "attack" ? (event.failed ? "does not attack; hits its controller" : "attack proceeds") : event.cause === "activation-run" ? (event.failed ? "ability is removed from the Cache; hits its controller" : "activation proceeds") : event.failed ? "still runs; hits its controller" : "runs normally"}.`,
      );
      break;
    case "card-die-rolled":
      add(
        `${name(event.sourceId)}: ${p} rolls ${event.result} on d20.${event.outcome ? " " + event.outcome : ""}`,
      );
      break;
    case "ram-commitments-changed":
      for (const item of event.attached)
        add(`${p} commits ${name(item.ramId)} to ${name(item.hostId)}.`);
      for (const item of event.detached)
        add(`${p} uncommits ${name(item.ramId)} from ${name(item.hostId)}.`);
      break;
    case "counters-added":
      add(
        `${name(event.sourceId)} puts ${event.amount} ${event.counter} counter(s) on ${n}.`,
      );
      break;
    case "cache-action-countered":
      add(
        `${name(event.sourceId)} counters ${name(event.targetId)}; that action will not resolve.`,
      );
      break;
    case "wheel-of-fortune-revealed":
      add(
        `${p} names RAM cost ${event.namedCost} for ${name(event.sourceId)}.`,
      );
      add(
        event.revealed
          ? `${p} reveals ${name(event.revealed, true)} (RAM cost ${event.revealedCost}): ${event.matched ? "match" : "no match"}.`
          : `${p} has no cyberdeck card to reveal; no reward.`,
      );
      break;
    case "yacht-party-resolved":
      add(
        `${p} pays 2 RAM for ${name(event.sourceId)} and reveals ${event.revealed.length ? event.revealed.map((id) => name(id, true)).join(", ") : "no cards"}.`,
      );
      add(
        event.selected
          ? `${p} puts ${name(event.selected, true)} into their hand and shuffles their cyberdeck.`
          : `${p} finds no CORPO character and shuffles their cyberdeck.`,
      );
      break;
    case "hand-revealed":
      add(
        `${p} reveals their hand: ${event.instanceIds.map((id) => name(id, true)).join(", ")}.`,
      );
      break;
    // Other rules events are bookkeeping, not a license to dump private payloads.
  }
}

/** Called between automatic steps, including immediately before outcome/choice exits.
 * The saved cursor prevents a pending event from being logged again after reconnect. */
export function captureGameLog(
  state: GameState,
  characteristics: Characteristics,
  effectSource?: LogEffectSource,
): GameState {
  const log = ensure(state);
  const position = `${state.turn.number}:${state.turn.step}:${state.combat?.stage ?? ""}`;
  if (position !== log.position) {
    append(
      state,
      `Turn ${state.turn.number} — ${player(state.turn.activePlayer)} — ${state.turn.step}${state.turn.step === "combat" ? ` / ${state.combat?.stage ?? ""}` : ""}.`,
    );
    log.position = position;
  }
  const priority =
    state.priorityWindow?.mode === "priority" &&
    !state.pendingDecision &&
    !state.outcome
      ? String(state.priorityWindow.priority)
      : "";
  const events = state.pendingRuleEvents.slice(log.pendingRecorded);
  if (events.some((e) => e.type === "instability-rolled"))
    append(
      state,
      "System Check: " +
        player(
          (
            events.find((e) => e.type === "instability-rolled") as Extract<
              RuleEvent,
              { type: "instability-rolled" }
            >
          ).player,
        ) +
        " mainframe becomes unstable.",
    );
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.type === "card-drawn") {
      const draws = [event];
      while (
        events[i + 1]?.type === "card-drawn" &&
        (events[i + 1] as typeof event).player === event.player
      )
        draws.push(events[++i] as typeof event);
      const cards = characteristics(state);
      const sourceId = state.priorityWindow?.resolving?.sourceId;
      const source = effectSource
        ? effectSource.name + ": "
        : sourceId && !state.objects[sourceId]?.faceDown
          ? (cards.get(sourceId)?.name ?? "Card effect") + ": "
          : "";
      const message =
        source + player(event.player) + " draws " + draws.length + " card(s).";
      append(state, message, {
        player: event.player,
        message:
          message +
          " Drawn: " +
          draws
            .map((d) => cards.get(d.instanceId)?.name ?? "a card")
            .join(", ") +
          ".",
      });
    } else eventMessage(state, event, characteristics, effectSource);
  }
  log.pendingRecorded = state.pendingRuleEvents.length;
  if (priority && log.priority !== priority)
    append(state, player(Number(priority) as Seat) + " has priority.");
  log.priority = priority;
  if (state.outcome && !log.outcomeRecorded) {
    const result = state.outcome;
    append(
      state,
      result.type === "win"
        ? `${player(result.winner)} wins (${result.reason}). Game over.`
        : result.type === "draw"
          ? "Game over: draw."
          : "Game abandoned. No winner.",
    );
    log.outcomeRecorded = true;
  }
  return state;
}

export function recordLogCommand(
  state: GameState,
  action: GameCommand["action"],
  actor: Seat,
) {
  ensure(state);
  if (action.type === "pass")
    append(state, `${player(actor)} passes priority.`);
  else if (action.type === "concede" || action.type === "abandon")
    append(
      state,
      `${player(actor)} ${action.type === "concede" ? "concedes" : "abandons the game"}.`,
    );
  else if (action.type === "force-quit")
    append(
      state,
      `${player(actor)} chooses to force quit ${action.ids.length} persistent(s).`,
    );
}

export function projectGameLog(state: GameState, viewer: Seat): LogEntry[] {
  return (state.gameLog?.entries ?? []).map(
    ({ id, turn, step, message, privateDetail }) => ({
      id,
      turn,
      step,
      message:
        privateDetail?.player === viewer ? privateDetail.message : message,
    }),
  );
}

/** Spectators receive only the public wording, never either player's private detail. */
export function projectPublicGameLog(state: GameState): LogEntry[] {
  return (state.gameLog?.entries ?? []).map(({ id, turn, step, message }) => ({
    id,
    turn,
    step,
    message,
  }));
}

export function recordLogResolution(
  state: GameState,
  characteristics: Characteristics,
) {
  const action = state.priorityWindow?.resolving;
  if (!action) return;
  const name = state.objects[action.sourceId]?.faceDown
    ? "Face-down card"
    : (characteristics(state).get(action.sourceId)?.name ?? "Card ability");
  append(
    state,
    player(action.controller) +
      ": resolving " +
      name +
      (action.kind === "card" ? "" : " ability") +
      ".",
  );
}

export function recordAbilityCopied(
  next: GameState,
  sourceName: string,
  abilityName: string,
) {
  append(
    next,
    `${sourceName} replaces CTRL+C with ${abilityName}. Reboot before activating the copied ability.`,
  );
}

export function recordLogTrigger(
  next: GameState,
  trigger: PendingTrigger,
  characteristics: Characteristics,
) {
  const observed =
    "observers" in trigger.event
      ? trigger.event.observers?.find((o) => o.id === trigger.sourceId)
      : undefined;
  const object = observed ?? next.objects[trigger.sourceId];
  const name = object?.faceDown
    ? "Face-down card"
    : (characteristics(next).get(trigger.sourceId)?.name ?? "Card");
  const counter: "CORRUPTION" | undefined =
    trigger.handler === corruptionCounterHandler ? "CORRUPTION" : undefined;
  const source = counter ? `${counter} counter effect on ${name}` : name;
  append(
    next,
    player(trigger.controller) +
      ": " +
      source +
      (counter ? " " : " triggered ability ") +
      (trigger.target === null
        ? "fails: no legal target."
        : trigger.optionalChoice === false
          ? "declined or unavailable."
          : "resolves."),
  );
  return { name: source, sourceId: trigger.sourceId, counter };
}
