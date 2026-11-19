import type { GameCommand } from "./commands";
import type { PlayerGameView, CardPresentation } from "./board-view";
import type { DecisionPrompt } from "./decision-prompt";
import type { TurnPrompt } from "./turn-prompt";
import type { CardRequirementAssessment } from "./card-requirement-assessment";
import type { PlayerSynergyPresentation } from "./synergy-presentation";

export interface BattlefieldSnapshot {
  view: PlayerGameView;
  presentations: Record<string, CardPresentation>;
  requirements?: Record<string, CardRequirementAssessment>;
  synergy?: PlayerSynergyPresentation[];
  decision: DecisionPrompt | null;
  turnPrompt: TurnPrompt | null;
}
export type CommandDelivery =
  | { status: "accepted"; acceptedRevision: number }
  | { status: "rejected"; message: string };
export interface MatchTransport {
  /** Transport validates authenticated response envelopes before returning them. */
  read(signal: AbortSignal): Promise<BattlefieldSnapshot>;
  send(
    commandId: string,
    command: GameCommand,
    signal: AbortSignal,
  ): Promise<CommandDelivery>;
}
export interface MatchClientState {
  snapshot: BattlefieldSnapshot;
  phase: "ready" | "sending" | "reconnecting" | "closed";
  notice: string;
  commandPending: boolean;
  formEpoch: number;
  rejection: string | null;
}

/** Polling is driven by the React lifecycle; this coordinator never advances the engine.
 * An uncertain send retains its immutable id/input until a receipt or rejection arrives.
 */
export class MatchClientSession {
  private state: MatchClientState;
  private listeners = new Set<() => void>();
  private controller = new AbortController();
  private pending: { id: string; command: GameCommand } | null = null;
  private minimumRevision: number;
  private notifiedRevision: number;
  private reading: Promise<boolean> | null = null;
  private delivering: Promise<void> | null = null;

  constructor(
    initial: BattlefieldSnapshot,
    private transport: MatchTransport,
    private nextId: () => string,
  ) {
    this.state = {
      snapshot: structuredClone(initial),
      phase: "ready",
      notice: "",
      commandPending: false,
      formEpoch: 0,
      rejection: null,
    };
    this.minimumRevision = initial.view.revision;
    this.notifiedRevision = initial.view.revision;
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(change: Partial<MatchClientState>) {
    if (this.controller.signal.aborted) return;
    const next = { ...this.state, ...change, commandPending: !!this.pending };
    if (
      next.snapshot === this.state.snapshot &&
      next.phase === this.state.phase &&
      next.notice === this.state.notice &&
      next.commandPending === this.state.commandPending &&
      next.formEpoch === this.state.formEpoch &&
      next.rejection === this.state.rejection
    ) return;
    this.state = next;
    for (const listener of this.listeners) listener();
  }
  private ingest(incoming: BattlefieldSnapshot) {
    if (this.controller.signal.aborted) return false;
    const current = this.state.snapshot.view;
    if (
      incoming.view.seat !== current.seat ||
      incoming.view.engineVersion !== current.engineVersion ||
      incoming.view.rulesVersion !== current.rulesVersion
    )
      throw new Error("Unexpected match view identity");
    if (
      !Number.isSafeInteger(incoming.view.revision) ||
      incoming.view.revision < 0
    )
      throw new Error("Invalid match revision");
    if (
      incoming.view.revision < current.revision ||
      incoming.view.revision < this.minimumRevision
    )
      return false;
    this.publish({
      ...(incoming.view.revision > current.revision
        ? { snapshot: structuredClone(incoming) }
        : {}),
      phase: this.pending ? "reconnecting" : "ready",
      notice: this.pending
        ? "Confirming your last command…"
        : (this.state.rejection ?? ""),
    });
    return true;
  }
  refresh(): Promise<boolean> {
    if (this.controller.signal.aborted) return Promise.resolve(false);
    if (this.reading) return this.reading;
    this.reading = (async () => {
      try {
        return this.ingest(await this.transport.read(this.controller.signal));
      } catch {
        this.publish({
          phase: "reconnecting",
          notice: "Connection interrupted. Your game is saved; reconnecting…",
        });
        return false;
      } finally {
        this.reading = null;
      }
    })();
    return this.reading;
  }
  async submit(
    command: GameCommand,
  ): Promise<{ ok: boolean; message?: string }> {
    if (
      this.controller.signal.aborted ||
      this.pending ||
      this.state.phase !== "ready"
    )
      return {
        ok: false,
        message:
          "Wait for the game to reconnect before sending another command.",
      };
    if (
      this.state.snapshot.view.outcome ||
      command.expectedRevision !== this.state.snapshot.view.revision
    )
      return {
        ok: false,
        message: "The game has changed. Use the current decision.",
      };
    this.pending = { id: this.nextId(), command: structuredClone(command) };
    this.publish({
      phase: "sending",
      notice: "Submitting decision…",
      rejection: null,
    });
    await this.deliver();
    // The coordinator owns retries from here. The form stays locked until a new snapshot
    // or a definitive rejection; it must not allocate a second command id after a timeout.
    return this.state.rejection
      ? { ok: false, message: this.state.rejection }
      : { ok: true };
  }
  private deliver(): Promise<void> {
    if (this.delivering) return this.delivering;
    if (!this.pending || this.controller.signal.aborted)
      return Promise.resolve();
    const pending = this.pending;
    this.delivering = (async () => {
      try {
        const result = await this.transport.send(
          pending.id,
          structuredClone(pending.command),
          this.controller.signal,
        );
        if (this.controller.signal.aborted) return;
        if (result.status === "accepted") {
          if (
            !Number.isSafeInteger(result.acceptedRevision) ||
            result.acceptedRevision !== pending.command.expectedRevision + 1
          )
            throw new Error("Invalid command receipt revision");
          this.minimumRevision = Math.max(
            this.minimumRevision,
            result.acceptedRevision,
          );
          this.pending = null;
          this.publish({
            phase: "reconnecting",
            notice: "Decision accepted. Updating the game…",
          });
        } else {
          this.pending = null;
          this.publish({
            phase: "reconnecting",
            notice: result.message,
            rejection: result.message,
            formEpoch: this.state.formEpoch + 1,
          });
        }
        await this.refresh();
        // An older in-flight read can be reused above. If it predates the
        // accepted receipt, immediately fetch the authoritative newer view.
        if (
          !this.controller.signal.aborted &&
          this.state.snapshot.view.revision < this.minimumRevision &&
          !this.reading
        ) await this.refresh();
      } catch {
        this.publish({
          phase: "reconnecting",
          notice:
            "The command result is uncertain. Reconnecting with the same command ID…",
        });
      } finally {
        this.delivering = null;
        // A newly published snapshot can enable the next command before this
        // delivery unwinds. Drain that distinct command without a fallback poll.
        if (this.pending && this.pending !== pending) await this.deliver();
      }
    })();
    return this.delivering;
  }
  async reconnect() {
    if (this.pending) await this.deliver();
    else await this.refresh();
  }
  async notifyRevision(revision: number) {
    if (!Number.isSafeInteger(revision) || revision < 0) return;
    this.notifiedRevision = Math.max(this.notifiedRevision, revision);
    await this.reconnect();
    if (!this.controller.signal.aborted && !this.pending &&
      this.state.snapshot.view.revision < this.notifiedRevision && !this.reading)
      await this.refresh();
  }
  close() {
    if (this.controller.signal.aborted) return;
    this.controller.abort();
    this.state = { ...this.state, phase: "closed" };
    this.listeners.clear();
  }
}
