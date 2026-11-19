"use client";

import { useBotDriver } from "./use-bot-driver";
import { useCallback, useEffect, useRef, useState } from "react";
import { GameplaySurface } from "./gameplay-surface";
import type { PublicFlair } from "@/lib/achievements/public-flair";
import type {
  ProgramQuoteTransport,
  ActivationQuoteTransport,
} from "@/lib/simulator/http-match-transport";
import {
  MatchClientSession,
  type BattlefieldSnapshot,
  type MatchClientState,
  type MatchTransport,
} from "@/lib/simulator/match-client-session";
import styles from "./game-table.module.css";
import { revisionFallbackDelay, useParticipantRevisions } from "@/lib/simulator/revision-notifications";
import {
  automaticPassLockName,
  automaticPassPreferenceKey,
  canAutomaticallyPass,
  parseAutomaticPassPreference,
  serializeAutomaticPassPreference,
} from "@/lib/simulator/automatic-priority-pass";

/** The owning route provides one stable transport per authenticated match. */
export function MatchClient({
  initial,
  transport,
  matchId,
  playerNames,
  playerFlair,
  botRun,
}: {
  botRun?: { id: string; roomId: string; mode: "single" | "gauntlet" };
  initial: BattlefieldSnapshot;
  matchId?: string;
  playerNames?: readonly [string, string];
  playerFlair?: readonly [PublicFlair | undefined, PublicFlair | undefined];
  transport: MatchTransport &
    Partial<ProgramQuoteTransport & ActivationQuoteTransport>;
}) {
  const botError = useBotDriver(botRun?.roomId);
  const session = useRef<MatchClientSession | null>(null);
  const [state, setState] = useState<MatchClientState | null>(null);
  const stateRef = useRef<MatchClientState | null>(null);
  const [autoPass, setAutoPass] = useState(false);
  const autoPassRef = useRef(false);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const preferenceLoadedRef = useRef(false);
  const [visible, setVisible] = useState(true);
  const [visibilitySynced, setVisibilitySynced] = useState(true);
  const visibleRef = useRef(true);
  const [lockOwned, setLockOwned] = useState(false);
  const lockOwnedRef = useRef(false);
  const [synchronized, setSynchronized] = useState(false);
  const synchronizedRef = useRef(false);
  const [autoPassNotice, setAutoPassNotice] = useState("");
  const claimedRevision = useRef<number | null>(null);
  const coordinatorGeneration = useRef(0);
  const seat = initial.view.seat;
  const preferenceKey = matchId
    ? automaticPassPreferenceKey(matchId, seat)
    : null;
  const notificationsConnected = useParticipantRevisions((notice, healthy) => {
    if (!session.current) return;
    if (document.hidden && !session.current.getSnapshot().commandPending) return;
    if (notice === null) void session.current.reconnect();
    else if (healthy && notice.resource === "match" && notice.id === matchId)
      void session.current.notifyRevision(notice.revision);
  });

  const updateAutoPass = useCallback(
    (enabled: boolean, persist = true) => {
      autoPassRef.current = enabled;
      setAutoPass(enabled);
      claimedRevision.current = null;
      if (!persist || !preferenceKey) return;
      try {
        localStorage.setItem(
          preferenceKey,
          serializeAutomaticPassPreference(enabled),
        );
        setAutoPassNotice("");
      } catch {
        setAutoPassNotice(
          "Auto Pass works in this tab, but its setting cannot be saved for reload.",
        );
      }
    },
    [preferenceKey],
  );

  useEffect(() => {
    const client = new MatchClientSession(initial, transport, () =>
      crypto.randomUUID(),
    );
    session.current = client;
    const publishState = () => {
      const next = client.getSnapshot();
      stateRef.current = next;
      setState(next);
      if (!document.hidden && next.phase === "ready") setVisibilitySynced(true);
    };
    publishState();
    const unsubscribe = client.subscribe(publishState);
    const resume = () => {
      setVisibilitySynced(false);
      if (!document.hidden) void client.reconnect().then(() => {
        if (session.current === client && client.getSnapshot().phase === "ready")
          setVisibilitySynced(true);
      });
    };
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      unsubscribe();
      client.close();
      session.current = null;
      stateRef.current = null;
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [initial, transport]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const client = session.current;
      if (client && (!document.hidden || client.getSnapshot().phase !== "ready") &&
        (!client.getSnapshot().snapshot.view.outcome || client.getSnapshot().commandPending))
        await client.reconnect();
      if (!stopped) {
        const phase = client?.getSnapshot().phase;
        timer = setTimeout(poll, phase === "reconnecting" ? 5000 :
          revisionFallbackDelay(notificationsConnected, 2000));
      }
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [notificationsConnected]);

  useEffect(() => {
    preferenceLoadedRef.current = false;
    setPreferenceLoaded(false);
    updateAutoPass(false, false);
    setSynchronized(false);
    synchronizedRef.current = false;
    if (!preferenceKey) return;
    try {
      updateAutoPass(
        parseAutomaticPassPreference(localStorage.getItem(preferenceKey)),
        false,
      );
    } catch {
      setAutoPassNotice(
        "Auto Pass works in this tab, but its setting cannot be restored or saved.",
      );
    }
    preferenceLoadedRef.current = true;
    setPreferenceLoaded(true);
  }, [preferenceKey, updateAutoPass]);

  useEffect(() => {
    if (!preferenceKey) return;
    const synchronizePreference = (event: StorageEvent) => {
      if (event.key !== preferenceKey) return;
      updateAutoPass(parseAutomaticPassPreference(event.newValue), false);
    };
    window.addEventListener("storage", synchronizePreference);
    return () => window.removeEventListener("storage", synchronizePreference);
  }, [preferenceKey, updateAutoPass]);

  useEffect(() => {
    const updateVisibility = () => {
      const next = !document.hidden;
      visibleRef.current = next;
      setVisible(next);
    };
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () =>
      document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    const generation = ++coordinatorGeneration.current;
    lockOwnedRef.current = false;
    setLockOwned(false);
    synchronizedRef.current = false;
    setSynchronized(false);
    if (!matchId || !preferenceLoaded || !autoPass || !visible) return;
    if (!("locks" in navigator)) {
      updateAutoPass(false);
      setAutoPassNotice(
        "Auto Pass is unavailable in this browser because safe multi-tab coordination is not supported.",
      );
      return;
    }

    let releaseLock = () => {};
    const held = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const ownership = navigator.locks.request(
      automaticPassLockName(matchId, seat),
      { mode: "exclusive" },
      async () => {
        const client = session.current;
        if (
          generation !== coordinatorGeneration.current ||
          !autoPassRef.current ||
          !visibleRef.current ||
          !client
        )
          return;
        const fresh = await client.refresh();
        if (
          !fresh ||
          generation !== coordinatorGeneration.current ||
          !autoPassRef.current ||
          !visibleRef.current ||
          session.current !== client
        )
          return;
        lockOwnedRef.current = true;
        setLockOwned(true);
        synchronizedRef.current = true;
        setSynchronized(true);
        setAutoPassNotice("");
        await held;
        lockOwnedRef.current = false;
        setLockOwned(false);
        synchronizedRef.current = false;
        setSynchronized(false);
      },
    );
    void ownership.catch(() => {
      if (generation !== coordinatorGeneration.current) return;
      updateAutoPass(false);
      setAutoPassNotice(
        "Auto Pass could not coordinate this tab safely and was turned off.",
      );
    });
    return () => {
      coordinatorGeneration.current += 1;
      releaseLock();
      lockOwnedRef.current = false;
      synchronizedRef.current = false;
    };
  }, [autoPass, matchId, preferenceLoaded, seat, updateAutoPass, visible]);

  useEffect(() => {
    if (!state) return;
    const snapshot = state.snapshot;
    if (
      !visibilitySynced ||
      !canAutomaticallyPass(state, snapshot, {
        enabled: autoPass,
        preferenceLoaded,
        synchronized,
        lockOwned,
        visible,
      }) ||
      claimedRevision.current === snapshot.view.revision
    )
      return;

    const revision = snapshot.view.revision;
    claimedRevision.current = revision;
    const generation = coordinatorGeneration.current;
    void (async () => {
      const client = session.current;
      const latest = stateRef.current;
      if (
        !client ||
        !latest ||
        generation !== coordinatorGeneration.current ||
        latest.snapshot.view.revision !== revision ||
        !canAutomaticallyPass(latest, latest.snapshot, {
          enabled: autoPassRef.current,
          preferenceLoaded: preferenceLoadedRef.current,
          synchronized: synchronizedRef.current,
          lockOwned: lockOwnedRef.current,
          visible: visibleRef.current,
        })
      )
        return;

      const result = await client.submit({
        expectedRevision: revision,
        action: { type: "pass" },
      });
      if (!result.ok && client.getSnapshot().rejection) {
        updateAutoPass(false);
        setAutoPassNotice(
          `Auto Pass was turned off: ${result.message ?? "the pass was rejected."}`,
        );
        await client.refresh();
      }
    })();
  }, [
    autoPass,
    lockOwned,
    preferenceLoaded,
    state,
    synchronized,
    updateAutoPass,
    visible,
    visibilitySynced,
  ]);
  const snapshot = state?.snapshot ?? initial;
  return (
    <section aria-label="Local match" data-match-revision={snapshot.view.revision}>
      <GameplaySurface
        key={state?.formEpoch ?? 0}
        {...snapshot}
        playerNames={playerNames}
        playerFlair={playerFlair}
        resultLink={{ href: '#/solo', label: 'Back to matchups' }}
        automaticControls={
          <div className={styles.automaticControls}>
            <div className={styles.automaticPreference}>
              <label className={styles.automaticToggle} title="Auto Pass: automatically pass optional priority">
                <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)" }}>Auto Pass</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={autoPass}
                  disabled={!preferenceLoaded || !matchId}
                  onChange={(event) => updateAutoPass(event.target.checked)}
                />
                <span
                  className={styles.switchTrack}
                  aria-hidden="true"
                  data-pixi-switch={autoPass ? "on" : "off"}
                >
                  <span />
                </span>
              </label>
            </div>
          </div>
        }
        connectionStatus={
          <>
            {botError && <p role="status">{botError}</p>}
            {autoPassNotice && <p role="status">{autoPassNotice}</p>}
            <p role="status">
              {state?.notice || (state ? "Saved locally" : "Opening match…")}
            </p>
            {state?.phase === "reconnecting" && (
              <button
                type="button"
                onClick={() => void session.current?.reconnect()}
              >
                Reconnect now
              </button>
            )}
          </>
        }
        onQuote={transport.quoteProgram}
        onActivationQuote={transport.quoteActivation}
        disabled={!visible || !visibilitySynced || !state || state.phase !== "ready" || state.commandPending}
        onSubmit={(command) =>
          session.current?.submit(command) ??
          Promise.resolve({ ok: false, message: "Connecting to the match…" })
        }
      />
    </section>
  );
}
